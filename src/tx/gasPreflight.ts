/**
 * Preflight ETH-for-gas check — runs alongside the USDC balance check at spec §2 step 4,
 * before the approve prompt at step 5.
 *
 * Why this exists: the USDC check answers "can they afford the payment?", but a wallet
 * holding plenty of USDC and zero ETH still cannot send anything on Base. Without this,
 * the user only discovers that when their wallet throws an opaque
 * "insufficient funds for gas" at signing time — after they've already approved.
 *
 * ── The estimation problem ────────────────────────────────────────────────────────
 * `eth_estimateGas` on `sprayEqual`/`sprayToken` REVERTS whenever the allowance is not
 * already in place: the contract's first `transferFrom` fails, so the node returns a
 * revert rather than a gas figure. That is exactly the state this check runs in (before
 * approve), so a naive "just call estimateGas" preflight would report a hard error for
 * every first-time send.
 *
 * So the strategy is split:
 *   • allowance already covers the total → estimate the real spray call on chain.
 *   • allowance insufficient (the common path) → estimate the `approve` call for real
 *     (it never depends on allowance) and model the spray leg from a calibrated
 *     per-recipient formula, flagged `approximate: true`.
 *
 * When an approval is needed the user must pay for BOTH transactions, so the budget is
 * the sum. Checking only the spray leg would wave through a wallet that runs dry on the
 * approve and strands the user mid-flow.
 *
 * This module is deliberately pure — no RPC, no React — so the arithmetic is testable
 * on its own. `useGasPreflight` supplies the chain data.
 */
import { formatEther } from 'viem';

/** Which send path the batch will take (spec §2 step 6). */
export type SprayMode = 'equal' | 'custom';

/**
 * Gas model for the spray leg, used only when the real estimate is unavailable.
 *
 * Calibrated from the shape of the call rather than measured on mainnet: 21k tx base +
 * calldata + pulling `totalCost` in via `transferFrom` + the fee transfer lands around
 * 90k of fixed overhead, and each recipient costs one ERC-20 transfer out of the
 * contract (~36k with a warm token contract and a cold recipient balance slot).
 *
 * Intentionally on the generous side: over-estimating shows a slightly high fee, while
 * under-estimating lets a user through who then fails at signing — the failure this
 * whole module exists to prevent.
 */
export const SPRAY_BASE_OVERHEAD_GAS = 90_000n;
export const SPRAY_PER_RECIPIENT_GAS = 36_000n;

/** A fresh ERC-20 allowance slot: cold SSTORE from zero, ~46-56k. */
export const APPROVE_GAS = 56_000n;

/**
 * Safety margin on modelled (not measured) gas. Base fees also move between this check
 * and signing, so the quoted figure should sit above the likely actual.
 */
export const HEURISTIC_BUFFER_PERCENT = 20n;

/** Modelled gas for the spray leg when we cannot estimate it on chain. */
export function modelSprayGas(recipientCount: number, mode: SprayMode): bigint {
  const count = BigInt(Math.max(recipientCount, 0));
  /**
   * `sprayToken` carries an extra 32-byte amount word per recipient and a slightly
   * heavier decode loop than `sprayEqual`'s single shared amount.
   */
  const perRecipient =
    mode === 'custom' ? SPRAY_PER_RECIPIENT_GAS + 2_600n : SPRAY_PER_RECIPIENT_GAS;
  return SPRAY_BASE_OVERHEAD_GAS + perRecipient * count;
}

export function applyBuffer(gas: bigint, percent = HEURISTIC_BUFFER_PERCENT): bigint {
  return (gas * (100n + percent)) / 100n;
}

export interface GasBudgetInput {
  /** Gas units for the spray call — measured on chain, or from `modelSprayGas`. */
  sprayGas: bigint;
  /** Gas units for the approve call. Omit/0 when the allowance already covers it. */
  approveGas?: bigint;
  /** EIP-1559 ceiling the wallet will quote. Fee is computed against the max, not the
   *  base fee, because that is what the wallet actually requires the account to cover. */
  maxFeePerGas: bigint;
  /** Native ETH balance of the sender on Base. */
  ethBalanceWei: bigint;
  /** True when any part of the gas figure is modelled rather than measured. */
  approximate: boolean;
}

export interface GasBudget {
  /** `ok` — enough ETH. `insufficient` — block the send. */
  status: 'ok' | 'insufficient';
  /** Total wei needed to cover every transaction in the flow. */
  totalFeeWei: bigint;
  /** Split out so the card can explain "approve + send" when two transactions are due. */
  approveFeeWei: bigint;
  sprayFeeWei: bigint;
  ethBalanceWei: bigint;
  /** How much more ETH is needed. Zero when `status` is `ok`. */
  shortfallWei: bigint;
  /** True when two transactions (approve then send) are required. */
  needsApproval: boolean;
  approximate: boolean;
}

/**
 * Pure verdict: does this account hold enough ETH to get the whole flow on chain?
 */
export function evaluateGasBudget(input: GasBudgetInput): GasBudget {
  const approveGas = input.approveGas ?? 0n;
  const approveFeeWei = approveGas * input.maxFeePerGas;
  const sprayFeeWei = input.sprayGas * input.maxFeePerGas;
  const totalFeeWei = approveFeeWei + sprayFeeWei;
  const shortfallWei =
    input.ethBalanceWei >= totalFeeWei ? 0n : totalFeeWei - input.ethBalanceWei;

  return {
    status: shortfallWei === 0n ? 'ok' : 'insufficient',
    totalFeeWei,
    approveFeeWei,
    sprayFeeWei,
    ethBalanceWei: input.ethBalanceWei,
    shortfallWei,
    needsApproval: approveGas > 0n,
    approximate: input.approximate,
  };
}

/**
 * ETH amounts for humans. Gas on Base is fractions of a cent, so the usual 4-decimal
 * formatting renders everything as "0.0000" — show enough significant digits that the
 * number is never a row of zeros, without dumping all 18 decimals on screen.
 */
export function formatEthAmount(wei: bigint): string {
  if (wei === 0n) return '0 ETH';
  const exact = formatEther(wei);
  const value = Number(exact);

  if (!Number.isFinite(value)) return `${exact} ETH`;
  if (value >= 0.001) return `${trimZeros(value.toFixed(4))} ETH`;
  if (value >= 0.000001) return `${trimZeros(value.toFixed(6))} ETH`;
  /** Below a millionth of an ETH the honest rendering is a bound, not a figure. */
  return '<0.000001 ETH';
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
