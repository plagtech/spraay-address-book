/**
 * The five free gateway endpoints the app uses (spec §1.4).
 *
 * Responses are normalised into app-shaped types here so screens never touch raw JSON,
 * and so a gateway field rename shows up as one failing narrow in this file rather than
 * as `undefined` flowing into a payment decision.
 */
import type { Address } from 'viem';

import { formatTokenAmount } from '../tx/amounts';
import {
  asArray,
  asBoolean,
  asNumber,
  asString,
  gatewayFetch,
  isRecord,
  GatewayError,
} from './client';

/** v1 is Base only (spec §1.1). */
const CHAIN = 'base' as const;

/* ── validate-batch ─────────────────────────────────────────────────────────── */

export interface BatchIssue {
  /** Row index when the gateway reports one, so the entry screen can point at it. */
  index?: number;
  address?: string;
  message: string;
}

export interface ValidateBatchResult {
  valid: boolean;
  errors: BatchIssue[];
  warnings: BatchIssue[];
  summary?: {
    recipientCount?: number;
    uniqueAddresses?: number;
    totalAmount?: string;
  };
}

export interface BatchRecipientInput {
  address: Address;
  /** Base units — converted to the decimal string the gateway expects. */
  amount: bigint;
}

/**
 * BPA 1.0 batch validation. Spec §2 step 1 requires `valid: true` before the user can
 * move to Review.
 *
 * ⚠️ The recipient field is `to`, NOT `address` — verified against the live gateway,
 * which returns per-row errors for `address`. This is the single place that mapping
 * happens; do not inline it elsewhere.
 */
export async function validateBatch(
  recipients: BatchRecipientInput[],
  decimals: number,
  tokenSymbol: string,
): Promise<ValidateBatchResult> {
  const body = {
    chain: CHAIN,
    token: tokenSymbol,
    recipients: recipients.map((r) => ({
      to: r.address,
      amount: formatTokenAmount(r.amount, decimals),
    })),
  };

  const raw = await gatewayFetch('/free/validate-batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!isRecord(raw)) {
    throw new GatewayError('bad-response', 'validate-batch did not return an object');
  }

  const valid = asBoolean(raw.valid);
  if (valid === undefined) {
    /**
     * Absent `valid` must NOT be read as "fine". Failing loudly here is the whole
     * point of the check.
     */
    throw new GatewayError('bad-response', 'validate-batch omitted the `valid` field');
  }

  const summaryRaw = isRecord(raw.summary) ? raw.summary : undefined;

  return {
    valid,
    errors: asArray(raw.errors).map(toIssue).filter(hasMessage),
    warnings: asArray(raw.warnings).map(toIssue).filter(hasMessage),
    summary: summaryRaw
      ? {
          recipientCount: asNumber(summaryRaw.recipientCount),
          uniqueAddresses: asNumber(summaryRaw.uniqueAddresses),
          totalAmount: asString(summaryRaw.totalAmount) ?? undefined,
        }
      : undefined,
  };
}

/**
 * Issues come back either as plain strings or as objects, and the object key for the
 * text varies (`message`, `error`, `reason`). Accept all of them rather than dropping
 * an error the user needs to see.
 */
function toIssue(raw: unknown): BatchIssue {
  if (typeof raw === 'string') return { message: raw };
  if (!isRecord(raw)) return { message: '' };

  const message =
    asString(raw.message) ??
    asString(raw.error) ??
    asString(raw.reason) ??
    asString(raw.detail) ??
    '';

  return {
    index: asNumber(raw.index) ?? asNumber(raw.row) ?? asNumber(raw.recipientIndex),
    address: asString(raw.to) ?? asString(raw.address),
    message,
  };
}

function hasMessage(issue: BatchIssue): boolean {
  return issue.message.trim().length > 0;
}

/* ── estimate-batch ─────────────────────────────────────────────────────────── */

export interface BatchEstimate {
  protocolFeeBps?: number;
  estimatedGasUSD?: number;
}

/**
 * Rough cost for the "≈ gas" hint only. `calculateTotalCost` on chain remains the
 * source of truth for the protocol fee, and the on-chain gas preflight remains the
 * source of truth for whether the user can afford to send (spec §1.4).
 */
export async function estimateBatch(recipientCount: number): Promise<BatchEstimate> {
  const raw = await gatewayFetch(
    `/free/estimate-batch?recipients=${encodeURIComponent(recipientCount)}&chain=${CHAIN}`,
  );

  const estimate = isRecord(raw) && isRecord(raw.estimate) ? raw.estimate : undefined;
  if (!estimate) return {};

  return {
    protocolFeeBps: asNumber(estimate.protocolFeeBps),
    estimatedGasUSD:
      asNumber(estimate.estimatedGasUSD) ?? asNumber(estimate.estimatedGasUsd),
  };
}

/* ── validate-address ───────────────────────────────────────────────────────── */

export interface AddressCheck {
  valid: boolean;
  message?: string;
}

/** Per-row address check as the user types — callers debounce 400ms (spec §1.4). */
export async function validateAddress(address: string): Promise<AddressCheck> {
  const raw = await gatewayFetch(
    `/free/validate-address?address=${encodeURIComponent(address)}&chain=${CHAIN}`,
  );

  if (!isRecord(raw)) throw new GatewayError('bad-response', 'validate-address shape');

  return {
    valid: asBoolean(raw.valid) ?? asBoolean(raw.isValid) ?? false,
    message: asString(raw.message) ?? asString(raw.reason),
  };
}

/* ── resolve ────────────────────────────────────────────────────────────────── */

export interface NameResolution {
  resolved: boolean;
  address?: Address;
}

/**
 * ENS / Basename lookup. BEST EFFORT ONLY — the gateway returned `resolved:false` for
 * `vitalik.eth` on 2026-07-26 (spec §1.4, verified). Callers must never block on this;
 * an unresolved name means "ask for the 0x address", not "this name is fake".
 *
 * Resolves to `{ resolved: false }` on any transport failure for the same reason.
 */
export async function resolveName(name: string): Promise<NameResolution> {
  try {
    const raw = await gatewayFetch(`/free/resolve?name=${encodeURIComponent(name)}`);
    if (!isRecord(raw)) return { resolved: false };

    const resolved = asBoolean(raw.resolved) ?? false;
    const address = asString(raw.address) ?? asString(raw.resolvedAddress);

    if (!resolved || !address) return { resolved: false };
    return { resolved: true, address: address as Address };
  } catch {
    return { resolved: false };
  }
}

/* ── health ─────────────────────────────────────────────────────────────────── */

/** Ping on app start; the UI shows a banner when this is false (spec §1.4). */
export async function checkHealth(): Promise<boolean> {
  const raw = await gatewayFetch('/health', undefined, 5_000);
  if (!isRecord(raw)) return false;
  return asString(raw.status) === 'healthy';
}
