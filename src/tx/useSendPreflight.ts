/**
 * Every read-side check that must pass before the Review screen will let a send start
 * (spec §2 steps 2-5, plus the step 8 recipient cap).
 *
 * These are deliberately gathered in one hook rather than scattered through the screen:
 * the checks share inputs (`totalCost` feeds both the USDC comparison and the gas
 * preflight's approval decision), and the screen needs a single ordered answer to
 * "can this send proceed, and if not, why not?".
 *
 * Ordering matters. `paused` and the recipient cap are absolute — they beat any balance
 * problem, because topping up would not help. Money problems come next, USDC before ETH,
 * since not affording the payment at all is the more fundamental issue.
 *
 * Writes (approve, sprayEqual/sprayToken) are NOT here — this hook only reads.
 */
import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';

import { SPRAY_CONTRACT_ADDRESS } from '../config/chain';
import { ERC20_ABI, SPRAY_ABI } from '../contracts/abi';
import { publicClient } from '../contracts/publicClient';
import { useContractConstants } from '../contracts/useContractConstants';
import { useGasPreflight } from './useGasPreflight';
import type { GasBudget, SprayMode } from './gasPreflight';

export type BlockerKind =
  | 'not-connected'
  | 'wrong-network'
  | 'paused'
  | 'too-many-recipients'
  | 'insufficient-usdc'
  | 'insufficient-eth';

export interface SendPreflightParams {
  sender: Address | undefined;
  /** True only when connected AND on Base — from `useWallet().isOnBase`. */
  isOnBase: boolean;
  token: Address;
  tokenDecimals: number;
  mode: SprayMode;
  recipients: Address[];
  /** `equal` mode: shared per-recipient amount in base units. */
  amountPerRecipient?: bigint;
  /** `custom` mode: base-unit amounts, index-aligned with `recipients`. */
  amounts?: bigint[];
}

export interface SendPreflight {
  /** Sum of the recipient amounts, before the protocol fee. */
  subtotal: bigint;
  /** `calculateTotalCost(subtotal)` from chain — subtotal + fee (spec §1.2). */
  totalCost: bigint | undefined;
  /** totalCost - subtotal. The protocol fee line on the Review screen. */
  feeAmount: bigint | undefined;
  tokenBalance: bigint | undefined;
  allowance: bigint | undefined;
  maxRecipients: number;
  /** True when the flow needs an approve before the spray (spec §2 step 5). */
  needsApproval: boolean;
  gas: GasBudget | undefined;
  /** Highest-priority reason the send cannot start, or undefined when it can. */
  blocker: BlockerKind | undefined;
  isLoading: boolean;
  error: Error | undefined;
  refetch: () => void;
}

export function useSendPreflight(params: SendPreflightParams): SendPreflight {
  const {
    sender,
    isOnBase,
    token,
    mode,
    recipients,
    amountPerRecipient,
    amounts,
  } = params;

  const subtotal = sumAmounts(mode, recipients.length, amountPerRecipient, amounts);

  /**
   * Gate the chain reads on being on Base: querying Base state through a client pinned
   * to the Base RPC would succeed even on the wrong network, and showing a confident
   * balance for a chain the user isn't on is worse than showing nothing.
   */
  const isEnabled = Boolean(sender) && isOnBase && recipients.length > 0 && subtotal > 0n;

  const reads = useQuery({
    enabled: isEnabled,
    retry: 1,
    queryKey: ['send-preflight', sender, token, subtotal.toString()],
    queryFn: async () => {
      if (!sender) throw new Error('No connected account');

      const [paused, maxRecipients, totalCost, tokenBalance, allowance] =
        await Promise.all([
          publicClient.readContract({
            address: SPRAY_CONTRACT_ADDRESS,
            abi: SPRAY_ABI,
            functionName: 'paused',
          }),
          publicClient.readContract({
            address: SPRAY_CONTRACT_ADDRESS,
            abi: SPRAY_ABI,
            functionName: 'MAX_RECIPIENTS',
          }),
          publicClient.readContract({
            address: SPRAY_CONTRACT_ADDRESS,
            abi: SPRAY_ABI,
            functionName: 'calculateTotalCost',
            args: [subtotal],
          }),
          publicClient.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [sender],
          }),
          publicClient.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [sender, SPRAY_CONTRACT_ADDRESS],
          }),
        ]);

      return { paused, maxRecipients, totalCost, tokenBalance, allowance };
    },
  });

  const totalCost = reads.data?.totalCost;
  const allowance = reads.data?.allowance;

  /**
   * Spec §2 step 8: the cap comes from chain, never from a literal. This screen re-reads
   * it alongside `paused` rather than trusting the startup cache — by the time a send is
   * about to happen, a fresh read is cheap and a stale cap is not worth the risk. The
   * cached value covers only the gap before that read lands.
   */
  const cached = useContractConstants();
  const maxRecipients = reads.data ? Number(reads.data.maxRecipients) : cached.maxRecipients;

  const needsApproval =
    totalCost !== undefined && allowance !== undefined ? allowance < totalCost : false;

  /**
   * The gas check needs `totalCost` and `allowance` to know whether an approve is also
   * due, so it can only run once the reads land.
   */
  const gasPreflight = useGasPreflight({
    sender,
    token,
    mode,
    recipients,
    amountPerRecipient,
    amounts,
    totalCost: totalCost ?? 0n,
    allowance: allowance ?? 0n,
    enabled: isEnabled && totalCost !== undefined && allowance !== undefined,
  });

  const blocker = firstBlocker({
    sender,
    isOnBase,
    paused: reads.data?.paused,
    recipientCount: recipients.length,
    maxRecipients,
    tokenBalance: reads.data?.tokenBalance,
    totalCost,
    gas: gasPreflight.budget,
  });

  return {
    subtotal,
    totalCost,
    feeAmount: totalCost !== undefined ? totalCost - subtotal : undefined,
    tokenBalance: reads.data?.tokenBalance,
    allowance,
    maxRecipients,
    needsApproval,
    gas: gasPreflight.budget,
    blocker,
    isLoading: (reads.isPending && isEnabled) || gasPreflight.isLoading,
    error: reads.error ?? gasPreflight.error ?? undefined,
    refetch: () => {
      void reads.refetch();
      gasPreflight.refetch();
    },
  };
}

/** Sum recipient amounts in base units. */
export function sumAmounts(
  mode: SprayMode,
  recipientCount: number,
  amountPerRecipient?: bigint,
  amounts?: bigint[],
): bigint {
  if (mode === 'equal') {
    return (amountPerRecipient ?? 0n) * BigInt(Math.max(recipientCount, 0));
  }
  return (amounts ?? []).reduce((total, amount) => total + amount, 0n);
}

/**
 * Ordered so the message the user sees is the one they can act on first. Returns
 * undefined only when every check that has resolved is satisfied — checks still in
 * flight do not block, the screen's loading state covers those.
 */
function firstBlocker(args: {
  sender: Address | undefined;
  isOnBase: boolean;
  paused: boolean | undefined;
  recipientCount: number;
  maxRecipients: number;
  tokenBalance: bigint | undefined;
  totalCost: bigint | undefined;
  gas: GasBudget | undefined;
}): BlockerKind | undefined {
  if (!args.sender) return 'not-connected';
  if (!args.isOnBase) return 'wrong-network';
  if (args.paused === true) return 'paused';
  if (args.recipientCount > args.maxRecipients) return 'too-many-recipients';
  if (
    args.tokenBalance !== undefined &&
    args.totalCost !== undefined &&
    args.tokenBalance < args.totalCost
  ) {
    return 'insufficient-usdc';
  }
  if (args.gas?.status === 'insufficient') return 'insufficient-eth';
  return undefined;
}
