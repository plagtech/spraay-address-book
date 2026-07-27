/**
 * Chain-data half of the ETH-for-gas preflight (spec §2 step 4). The arithmetic lives
 * in `gasPreflight.ts`; this hook only gathers inputs and hands them over.
 *
 * Runs alongside the USDC balance check and before the approve prompt, so the Review
 * screen can block with an explainer instead of letting the wallet fail at signing.
 */
import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';

import { SPRAY_CONTRACT_ADDRESS } from '../config/chain';
import { ERC20_ABI, SPRAY_ABI } from '../contracts/abi';
import { publicClient } from '../contracts/publicClient';
import {
  APPROVE_GAS,
  applyBuffer,
  evaluateGasBudget,
  modelSprayGas,
  type GasBudget,
  type SprayMode,
} from './gasPreflight';

export interface GasPreflightParams {
  /** Connected sender. Preflight is skipped while undefined. */
  sender: Address | undefined;
  token: Address;
  mode: SprayMode;
  /** Recipient addresses in batch order. */
  recipients: Address[];
  /** `equal` mode: the shared per-recipient amount, in base units. */
  amountPerRecipient?: bigint;
  /** `custom` mode: per-recipient base-unit amounts, index-aligned with `recipients`. */
  amounts?: bigint[];
  /** `calculateTotalCost(total)` from chain — amount + protocol fee (spec §1.2). */
  totalCost: bigint;
  /** Current ERC-20 allowance for the spray contract, from spec §2 step 5's read. */
  allowance: bigint;
  /** Gate the whole check — e.g. false until validation passes and the user is on Base. */
  enabled?: boolean;
}

export interface GasPreflight {
  budget: GasBudget | undefined;
  isLoading: boolean;
  /** Set when the chain data could not be fetched at all. */
  error: Error | undefined;
  refetch: () => void;
}

export function useGasPreflight(params: GasPreflightParams): GasPreflight {
  const {
    sender,
    token,
    mode,
    recipients,
    amountPerRecipient,
    amounts,
    totalCost,
    allowance,
    enabled = true,
  } = params;

  const needsApproval = allowance < totalCost;
  const isEnabled = enabled && Boolean(sender) && recipients.length > 0;

  const query = useQuery({
    enabled: isEnabled,
    /**
     * Fee data and balance both go stale quickly; re-check when the Review screen is
     * revisited rather than showing a fee quoted minutes ago.
     */
    staleTime: 15_000,
    retry: 1,
    /**
     * Keyed on the actual recipients and amounts, not just their count: swapping an
     * address without changing the length is a different transaction, and on the
     * measured path it estimates differently (cold vs. warm recipient balance slots).
     */
    queryKey: [
      'gas-preflight',
      sender,
      token,
      mode,
      recipients,
      totalCost.toString(),
      needsApproval,
      amountPerRecipient?.toString() ?? '',
      amounts?.map(String) ?? [],
    ],
    queryFn: async (): Promise<GasBudget> => {
      if (!sender) throw new Error('No connected account');

      const [ethBalanceWei, fees] = await Promise.all([
        publicClient.getBalance({ address: sender }),
        publicClient.estimateFeesPerGas(),
      ]);

      /**
       * `estimateFeesPerGas` returns maxFeePerGas for EIP-1559 chains; Base is one, but
       * fall back to the legacy gas price rather than dividing by an undefined.
       */
      const maxFeePerGas =
        fees.maxFeePerGas ?? fees.gasPrice ?? (await publicClient.getGasPrice());

      /**
       * Only the already-approved path can be measured. See gasPreflight.ts — estimating
       * the spray call without an allowance in place reverts inside `transferFrom`.
       */
      if (!needsApproval) {
        try {
          const sprayGas = await estimateSprayGas({
            sender,
            token,
            mode,
            recipients,
            amountPerRecipient,
            amounts,
          });
          return evaluateGasBudget({
            sprayGas,
            maxFeePerGas,
            ethBalanceWei,
            approximate: false,
          });
        } catch {
          /**
           * A revert here is real information — `paused`, a blacklisted recipient, a
           * balance that moved — but diagnosing it is step 2/4's job, not this check's.
           * Fall through to the model so a send is never blocked on the wrong reason;
           * the flow's other guards report the actual cause.
           */
        }
      }

      const sprayGas = applyBuffer(modelSprayGas(recipients.length, mode));
      return evaluateGasBudget({
        sprayGas,
        approveGas: needsApproval ? applyBuffer(APPROVE_GAS) : 0n,
        maxFeePerGas,
        ethBalanceWei,
        approximate: true,
      });
    },
  });

  return {
    budget: query.data,
    isLoading: query.isPending && isEnabled,
    error: query.error ?? undefined,
    refetch: () => {
      void query.refetch();
    },
  };
}

/** Measured gas for whichever send path the batch will take (spec §2 step 6). */
async function estimateSprayGas(args: {
  sender: Address;
  token: Address;
  mode: SprayMode;
  recipients: Address[];
  amountPerRecipient?: bigint;
  amounts?: bigint[];
}): Promise<bigint> {
  const { sender, token, mode, recipients, amountPerRecipient, amounts } = args;

  if (mode === 'equal') {
    if (amountPerRecipient === undefined) {
      throw new Error('amountPerRecipient is required in equal mode');
    }
    return publicClient.estimateContractGas({
      account: sender,
      address: SPRAY_CONTRACT_ADDRESS,
      abi: SPRAY_ABI,
      functionName: 'sprayEqual',
      args: [token, recipients, amountPerRecipient],
    });
  }

  if (!amounts || amounts.length !== recipients.length) {
    throw new Error('amounts must be index-aligned with recipients in custom mode');
  }
  const pairs = recipients.map((recipient, i) => {
    const amount = amounts[i];
    if (amount === undefined) {
      throw new Error(`Missing amount for recipient ${i}`);
    }
    return { recipient, amount };
  });
  return publicClient.estimateContractGas({
    account: sender,
    address: SPRAY_CONTRACT_ADDRESS,
    abi: SPRAY_ABI,
    functionName: 'sprayToken',
    args: [token, pairs],
  });
}

/**
 * Allowance read that feeds `params.allowance` (spec §2 step 5). Exported here so the
 * Review screen has one place to get both halves of the pre-approve state.
 */
export async function readAllowance(owner: Address, token: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, SPRAY_CONTRACT_ADDRESS],
  });
}
