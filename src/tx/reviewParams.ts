/**
 * Parsing for the Review route's params.
 *
 * The Payout Entry screen (spec §3.3) hands the batch over through the router, which
 * only carries strings. Everything here is defensive on purpose: these values decide
 * who receives money and how much, so a malformed param must fail visibly rather than
 * silently becoming a zero amount or a dropped recipient.
 *
 * Amounts cross the boundary already converted to BASE UNITS (6 decimals for USDC), so
 * no float ever touches a payment figure.
 */
import { isAddress, getAddress, type Address } from 'viem';

import type { SprayMode } from './gasPreflight';

/** Raw shape as expo-router delivers it — every value a string or absent. */
export interface RawReviewParams {
  mode?: string | string[];
  recipients?: string | string[];
  amounts?: string | string[];
  amountPerRecipient?: string | string[];
  unverified?: string | string[];
}

export interface ParsedReview {
  mode: SprayMode;
  recipients: Address[];
  amounts?: bigint[];
  amountPerRecipient?: bigint;
  /**
   * Set when the batch reached Review without a gateway `valid: true` — the service was
   * unreachable and the user chose to carry on. Review reminds them at the point of
   * signing, since that is where it matters.
   */
  unverified?: boolean;
}

export type ParseResult =
  | { ok: true; value: ParsedReview }
  | { ok: false; reason: string };

/** expo-router gives `string | string[]`; take the first when duplicated. */
function one(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function splitList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Base-unit integer string → bigint. Rejects decimals, signs, and junk. */
function parseBaseUnits(raw: string): bigint | undefined {
  if (!/^\d+$/.test(raw)) return undefined;
  try {
    return BigInt(raw);
  } catch {
    return undefined;
  }
}

export function parseReviewParams(raw: RawReviewParams): ParseResult {
  const modeRaw = one(raw.mode) ?? 'equal';
  if (modeRaw !== 'equal' && modeRaw !== 'custom') {
    return { ok: false, reason: `Unknown send mode "${modeRaw}".` };
  }
  const mode: SprayMode = modeRaw;
  const unverified = one(raw.unverified) === '1';

  const recipientsRaw = splitList(one(raw.recipients));
  if (recipientsRaw.length === 0) {
    return { ok: false, reason: 'No recipients were passed to this screen.' };
  }

  const recipients: Address[] = [];
  for (const candidate of recipientsRaw) {
    if (!isAddress(candidate)) {
      return { ok: false, reason: `"${candidate}" is not a valid address.` };
    }
    /** Checksum now so downstream comparisons and the gas estimate agree. */
    recipients.push(getAddress(candidate));
  }

  if (mode === 'equal') {
    const perRaw = one(raw.amountPerRecipient);
    if (!perRaw) {
      return { ok: false, reason: 'Missing the amount for each person.' };
    }
    const amountPerRecipient = parseBaseUnits(perRaw);
    if (amountPerRecipient === undefined || amountPerRecipient === 0n) {
      return { ok: false, reason: `"${perRaw}" is not a valid amount.` };
    }
    return { ok: true, value: { mode, recipients, amountPerRecipient, unverified } };
  }

  const amountsRaw = splitList(one(raw.amounts));
  if (amountsRaw.length !== recipients.length) {
    return {
      ok: false,
      reason: `Got ${recipients.length} people but ${amountsRaw.length} amounts.`,
    };
  }

  const amounts: bigint[] = [];
  for (const candidate of amountsRaw) {
    const amount = parseBaseUnits(candidate);
    if (amount === undefined || amount === 0n) {
      return { ok: false, reason: `"${candidate}" is not a valid amount.` };
    }
    amounts.push(amount);
  }

  return { ok: true, value: { mode, recipients, amounts, unverified } };
}

/**
 * Inverse of the parser — the Payout Entry screen builds its `router.push` params with
 * this so the two sides cannot drift apart.
 */
export function toReviewParams(value: ParsedReview): Record<string, string> {
  const params: Record<string, string> = {
    mode: value.mode,
    recipients: value.recipients.join(','),
  };
  if (value.mode === 'equal') {
    params.amountPerRecipient = (value.amountPerRecipient ?? 0n).toString();
  } else {
    params.amounts = (value.amounts ?? []).map(String).join(',');
  }
  /** Omitted when false so the common case keeps a clean URL. */
  if (value.unverified) params.unverified = '1';
  return params;
}
