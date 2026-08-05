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
 *
 * ── What changed after dust test run 1, and why ──────────────────────────────────
 * That payment mined. All three transfers and the fee landed. This hook reported failure.
 *
 * The shape of the flow is why. Between the tap and the receipt, everything the app knows
 * about the payment lived in promises held by a screen that was in the BACKGROUND — the
 * user is in MetaMask for that whole window — and a backgrounded app can lose the wallet's
 * answer to a relay socket the OS closed, or run out viem's 180s receipt timeout while the
 * user reads a confirmation screen. Either way the failure was total: no hash, no record,
 * nothing to look up afterwards. A payments app cannot lose the fact that a payment
 * happened.
 *
 * So the sequence now writes to disk before it asks the wallet (`pendingSend.ts`), and
 * `reconcile.ts` settles that journal against the chain on every foreground. Two
 * consequences show up here:
 *
 *   · a lost answer is `unconfirmed`, NOT `error`. The old copy said "Nothing was sent
 *     from your wallet", which for the dust test was simply false. We only say that when
 *     the wallet told us so.
 *   · the journal, not this hook's promises, is what survives. If the process dies mid-
 *     flight the payment is still found and recorded on the next launch.
 *
 * The calls themselves are untouched. Same `sprayEqual` / `sprayToken`, same exact-amount
 * approve, same 30bps fee path — this is detection, not construction.
 */
import { useCallback, useState } from 'react';
import { useWriteContract } from 'wagmi';
import type { Address, Hash } from 'viem';

import { BASE_CHAIN_ID, SPRAY_CONTRACT_ADDRESS } from '../config/chain';
import { DEFAULT_TOKEN } from '../config/tokens';
import { ERC20_ABI, SPRAY_ABI } from '../contracts/abi';
import { publicClient } from '../contracts/publicClient';
import { useForegroundWallet } from '../wallet/useForegroundWallet';
import type { SprayMode } from './gasPreflight';
import {
  addPendingSend,
  attachPendingHash,
  dropPendingSend,
  newPendingId,
} from './pendingSend';
import { setSendInFlight } from './reconcile';
import { describeSendError, provesNothingWasSent, SendError } from './sendErrors';
import { findSprayExecuted, tokenByAddress } from './sprayReceipt';
import { sumAmounts } from './useSendPreflight';

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
  /**
   * We asked the wallet to send and never got a usable answer — but the payment may have
   * gone through, so this is emphatically not an error. Recovery is now looking for it.
   */
  | 'unconfirmed'
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
  /** The signing account. Recorded in the journal so recovery can find its logs. */
  sender: Address;
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
  /**
   * The payment's hash, as soon as the wallet hands one back — kept even when the
   * confirmation is later lost, because it is what lets the user check for themselves.
   */
  sentHash: Hash | undefined;
  result: SprayResult | undefined;
  start: (params: SpraySendParams) => Promise<void>;
  reset: () => void;
  isBusy: boolean;
}

export function useSpraySend(): SpraySend {
  const { writeContractAsync } = useWriteContract();
  const foregroundWallet = useForegroundWallet();

  const [phase, setPhase] = useState<SendPhase>('idle');
  const [error, setError] = useState<string | undefined>();
  const [approveHash, setApproveHash] = useState<Hash | undefined>();
  const [sentHash, setSentHash] = useState<Hash | undefined>();
  const [result, setResult] = useState<SprayResult | undefined>();

  const reset = useCallback(() => {
    setPhase('idle');
    setError(undefined);
    setApproveHash(undefined);
    setSentHash(undefined);
    setResult(undefined);
  }, []);

  const start = useCallback(
    async (params: SpraySendParams) => {
      setError(undefined);
      setResult(undefined);
      setSentHash(undefined);

      /** Keeps recovery from racing this flow to the same transaction. */
      setSendInFlight(true);

      /**
       * Started now rather than at journal time: it is only needed as a floor for the
       * log scan, and asking for it here means the wallet prompt is not waiting on an
       * RPC round-trip.
       */
      const blockFloor = publicClient.getBlockNumber().catch(() => undefined);

      /**
       * Set once the journal entry exists. Every path that PROVES the payment did not
       * happen tears it down; every path that only proves we stopped watching leaves it
       * standing for `reconcile.ts`.
       */
      let pendingId: string | undefined;

      try {
        if (params.needsApproval) {
          setPhase('approve-signing');
          /** The wallet will not raise itself for a session request — see the module. */
          foregroundWallet();

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

        /**
         * ── The journal is written HERE ────────────────────────────────────────
         * Before the wallet is asked, not after it answers. The answer is the thing that
         * goes missing; an entry written after it would not exist in the one case this
         * whole mechanism is for.
         *
         * Recipient names are deliberately not copied in. Recovery resolves them from the
         * book when it writes the record, minutes later at worst, and leaving them out
         * keeps this module free of a dependency on contacts.
         */
        pendingId = newPendingId();
        await addPendingSend({
          id: pendingId,
          sender: params.sender,
          token: params.token,
          tokenSymbol: tokenByAddress(params.token)?.symbol ?? DEFAULT_TOKEN.symbol,
          decimals: tokenByAddress(params.token)?.decimals ?? DEFAULT_TOKEN.decimals,
          mode: params.mode,
          recipients: params.recipients.map((address, i) => ({
            address,
            amount:
              params.mode === 'equal'
                ? (params.amountPerRecipient ?? 0n)
                : (params.amounts?.[i] ?? 0n),
          })),
          /**
           * The subtotal, which is what the event reports as `totalAmount` — NOT the
           * approved total cost. Computed with the same helper the preflight uses so the
           * number recovery matches on cannot drift from the number the contract emits.
           */
          expectedTotal: sumAmounts(
            params.mode,
            params.recipients.length,
            params.amountPerRecipient,
            params.amounts,
          ),
          fromBlock: await blockFloor,
          createdAt: Date.now(),
        });

        setPhase('send-signing');
        foregroundWallet();

        let sprayHash: Hash;
        try {
          sprayHash = await submitSpray(writeContractAsync, params);
        } catch (err) {
          if (provesNothingWasSent(err)) {
            /** The wallet answered, and the answer was no. Close the question. */
            await dropPendingSend(pendingId);
            throw err;
          }
          /**
           * We asked and did not hear back. On a relay socket that the OS may have closed
           * under a backgrounded app, that says nothing about whether the wallet
           * broadcast. Leave the entry standing and let the chain decide.
           */
          console.warn('[send] lost the wallet answer; handing over to recovery', err);
          setPhase('unconfirmed');
          return;
        }

        setSentHash(sprayHash);
        await attachPendingHash(pendingId, sprayHash);

        setPhase('send-pending');

        let receipt;
        try {
          receipt = await publicClient.waitForTransactionReceipt({ hash: sprayHash });
        } catch (err) {
          /**
           * viem gives up after 180s (waitForTransactionReceipt.js:53), and a phone that
           * spent those 180s in the background can easily hit it. The transaction is
           * broadcast and the hash is on disk, so this is a wait we abandoned — not a
           * payment that failed.
           */
          console.warn('[send] receipt wait ended without an answer', err);
          setPhase('unconfirmed');
          return;
        }

        if (receipt.status !== 'success') {
          await dropPendingSend(pendingId);
          throw new SendError(
            'The payment did not go through. Your funds are still in your wallet.',
          );
        }

        const executed = findSprayExecuted(receipt.logs);
        if (!executed) {
          /**
           * A mined transaction with no `SprayTokenExecuted` is not a success we can
           * vouch for. Send the user to the explorer rather than claiming it worked.
           */
          await dropPendingSend(pendingId);
          throw new SendError(
            'The payment was mined but we could not confirm it. Check the transaction on Basescan before resending.',
          );
        }

        /**
         * The entry is left standing on purpose. It is cleared by recovery once the
         * record is actually IN history — which the Review screen writes a moment from
         * now — so a process death in that gap still leaves the payment recoverable.
         */
        setResult({
          hash: sprayHash,
          totalAmount: executed.totalAmount,
          recipientCount: executed.recipientCount,
          feeAmount: executed.feeAmount,
        });
        setPhase('success');
      } catch (err) {
        setError(describeSendError(err));
        setPhase('error');
      } finally {
        setSendInFlight(false);
      }
    },
    [writeContractAsync, foregroundWallet],
  );

  return {
    phase,
    error,
    approveHash,
    sentHash,
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

