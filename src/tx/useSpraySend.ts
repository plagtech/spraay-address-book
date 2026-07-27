/**
 * The signing sequence — spec §2 steps 5-7.
 *
 * Two transactions when an approval is due, one when it isn't. They are strictly
 * sequential: the approve must be MINED before the spray is offered for signature, or
 * the spray reverts on the contract's first `transferFrom`. Prompting for both at once
 * would look faster and fail nearly every time.
 *
 * The wallet is the only signer — this hook builds calls and hands them to the connected
 * wallet through wagmi. No key material passes through here (spec §4).
 *
 * Approvals are for the EXACT total, never infinite (spec §4).
 */
import { useCallback, useState } from 'react';
import { useWriteContract } from 'wagmi';
import { decodeEventLog, type Address, type Hash, type TransactionReceipt } from 'viem';

import { BASE_CHAIN_ID, SPRAY_CONTRACT_ADDRESS } from '../config/chain';
import { ERC20_ABI, SPRAY_ABI } from '../contracts/abi';
import { publicClient } from '../contracts/publicClient';
import type { SprayMode } from './gasPreflight';

export type SendPhase =
  | 'idle'
  /** Waiting for the user to sign the approve in their wallet. */
  | 'approve-signing'
  /** Approve submitted, waiting for it to be mined. */
  | 'approve-pending'
  /** Waiting for the user to sign the payment. */
  | 'send-signing'
  /** Payment submitted, waiting for it to be mined. */
  | 'send-pending'
  | 'success'
  | 'error';

export interface SprayResult {
  hash: Hash;
  /** Decoded from `SprayTokenExecuted` — the contract's own account of what happened. */
  totalAmount: bigint;
  recipientCount: number;
  feeAmount: bigint;
}

export interface SpraySendParams {
  token: Address;
  mode: SprayMode;
  recipients: Address[];
  amountPerRecipient?: bigint;
  amounts?: bigint[];
  /** `calculateTotalCost(subtotal)` — the exact amount to approve. */
  totalCost: bigint;
  needsApproval: boolean;
}

export interface SpraySend {
  phase: SendPhase;
  /** User-facing message, already translated out of wallet-speak. */
  error: string | undefined;
  approveHash: Hash | undefined;
  result: SprayResult | undefined;
  start: (params: SpraySendParams) => Promise<void>;
  reset: () => void;
  isBusy: boolean;
}

export function useSpraySend(): SpraySend {
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<SendPhase>('idle');
  const [error, setError] = useState<string | undefined>();
  const [approveHash, setApproveHash] = useState<Hash | undefined>();
  const [result, setResult] = useState<SprayResult | undefined>();

  const reset = useCallback(() => {
    setPhase('idle');
    setError(undefined);
    setApproveHash(undefined);
    setResult(undefined);
  }, []);

  const start = useCallback(
    async (params: SpraySendParams) => {
      setError(undefined);
      setResult(undefined);

      try {
        if (params.needsApproval) {
          setPhase('approve-signing');
          const hash = await writeContractAsync({
            chainId: BASE_CHAIN_ID,
            address: params.token,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [SPRAY_CONTRACT_ADDRESS, params.totalCost],
          });
          setApproveHash(hash);

          setPhase('approve-pending');
          const approveReceipt = await publicClient.waitForTransactionReceipt({ hash });
          if (approveReceipt.status !== 'success') {
            throw new SendError(
              'The approval did not go through. Nothing has been sent — you can try again.',
            );
          }
        }

        setPhase('send-signing');
        const sprayHash = await submitSpray(writeContractAsync, params);

        setPhase('send-pending');
        const receipt = await publicClient.waitForTransactionReceipt({ hash: sprayHash });
        if (receipt.status !== 'success') {
          throw new SendError(
            'The payment did not go through. Your funds are still in your wallet.',
          );
        }

        const executed = findSprayEvent(receipt);
        if (!executed) {
          /**
           * A mined transaction with no `SprayTokenExecuted` is not a success we can
           * vouch for. Send the user to the explorer rather than claiming it worked.
           */
          throw new SendError(
            'The payment was mined but we could not confirm it. Check the transaction on Basescan before resending.',
          );
        }

        setResult({ hash: sprayHash, ...executed });
        setPhase('success');
      } catch (err) {
        setError(describeSendError(err));
        setPhase('error');
      }
    },
    [writeContractAsync],
  );

  return {
    phase,
    error,
    approveHash,
    result,
    start,
    reset,
    isBusy:
      phase === 'approve-signing' ||
      phase === 'approve-pending' ||
      phase === 'send-signing' ||
      phase === 'send-pending',
  };
}

/** Same-amount mode → `sprayEqual`; custom mode → `sprayToken` (spec §2 step 6). */
async function submitSpray(
  writeContractAsync: ReturnType<typeof useWriteContract>['writeContractAsync'],
  params: SpraySendParams,
): Promise<Hash> {
  if (params.mode === 'equal') {
    if (params.amountPerRecipient === undefined) {
      throw new SendError('Missing the amount for each person.');
    }
    return writeContractAsync({
      chainId: BASE_CHAIN_ID,
      address: SPRAY_CONTRACT_ADDRESS,
      abi: SPRAY_ABI,
      functionName: 'sprayEqual',
      args: [params.token, params.recipients, params.amountPerRecipient],
    });
  }

  const amounts = params.amounts;
  if (!amounts || amounts.length !== params.recipients.length) {
    throw new SendError('The people and amounts in this payout do not line up.');
  }
  const pairs = params.recipients.map((recipient, i) => {
    const amount = amounts[i];
    if (amount === undefined) throw new SendError(`Missing an amount for row ${i + 1}.`);
    return { recipient, amount };
  });

  return writeContractAsync({
    chainId: BASE_CHAIN_ID,
    address: SPRAY_CONTRACT_ADDRESS,
    abi: SPRAY_ABI,
    functionName: 'sprayToken',
    args: [params.token, pairs],
  });
}

/**
 * Pull `SprayTokenExecuted` out of the receipt. Logs from the ERC-20 transfers share the
 * receipt, so decode is attempted per log and non-matching ones are skipped.
 */
function findSprayEvent(
  receipt: TransactionReceipt,
): { totalAmount: bigint; recipientCount: number; feeAmount: bigint } | undefined {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== SPRAY_CONTRACT_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: SPRAY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === 'SprayTokenExecuted') {
        const args = decoded.args as unknown as {
          totalAmount: bigint;
          recipientCount: bigint;
          feeAmount: bigint;
        };
        return {
          totalAmount: args.totalAmount,
          recipientCount: Number(args.recipientCount),
          feeAmount: args.feeAmount,
        };
      }
    } catch {
      /** Not one of ours, or a different event — keep looking. */
    }
  }
  return undefined;
}

/** Errors whose message is already fit to show the user. */
class SendError extends Error {}

function describeSendError(err: unknown): string {
  if (err instanceof SendError) return err.message;

  const message = err instanceof Error ? err.message : String(err);

  /** Wallets report user cancellation in several shapes; 4001 is the EIP-1193 code. */
  if (/user rejected|user denied|4001|rejected the request/i.test(message)) {
    return 'You cancelled in your wallet. Nothing was sent.';
  }
  if (/insufficient funds/i.test(message)) {
    return 'Not enough ETH to cover the network fee. Top up and try again.';
  }
  if (/transfer amount exceeds balance|insufficient allowance/i.test(message)) {
    return 'Your USDC balance or approval changed. Go back and check the amounts.';
  }
  if (/paused/i.test(message)) {
    return 'Sending is paused right now. Your funds are untouched — try again later.';
  }
  if (/timed out|timeout|network request failed/i.test(message)) {
    return 'The network took too long to answer. Check Basescan before resending — the payment may still be on its way.';
  }
  return 'The payment could not be completed. Nothing was sent from your wallet.';
}
