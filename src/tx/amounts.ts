/**
 * Typed-amount → base-unit conversion.
 *
 * Every payment figure in the app crosses through here, and NOTHING in this file uses
 * floating point. `Number('0.07') * 1e6` is 70000.00000000001 — one `Math.round` away
 * from silently paying the wrong amount, and the kind of bug that only shows up on
 * certain values. String manipulation on the decimal digits avoids the class entirely.
 *
 * Over-precision is REJECTED, not truncated: someone typing "5.1234567" USDC meant
 * something, and quietly dropping the last digit is a payment they did not authorise.
 */

export type AmountResult =
  | { ok: true; value: bigint }
  | { ok: false; reason: string };

/**
 * Parse a user-typed amount into base units.
 *
 * Accepts "5", "5.25", "$5.25", "1,250.00", ".5", "5." — the shapes people actually
 * type. Rejects negatives, exponents, multiple dots, and more precision than the token
 * supports.
 */
export function parseTokenAmount(input: string, decimals: number): AmountResult {
  const cleaned = input.trim().replace(/^\$/, '').replace(/,/g, '').trim();

  if (cleaned.length === 0) return { ok: false, reason: 'Enter an amount.' };
  if (!/^\d*\.?\d*$/.test(cleaned)) {
    return { ok: false, reason: `"${input.trim()}" isn't a number.` };
  }

  const [whole = '', fraction = ''] = cleaned.split('.');
  if (whole.length === 0 && fraction.length === 0) {
    return { ok: false, reason: 'Enter an amount.' };
  }
  if (fraction.length > decimals) {
    return {
      ok: false,
      reason: `Use at most ${decimals} decimal places.`,
    };
  }

  /** Right-pad the fraction so the digits land in the correct base-unit columns. */
  const padded = fraction.padEnd(decimals, '0');
  const value = BigInt(`${whole || '0'}${padded}`);

  if (value === 0n) return { ok: false, reason: 'Amount must be more than zero.' };
  return { ok: true, value };
}

/** Base units → a plain display string. Trailing zeros trimmed, never rounded up. */
export function formatTokenAmount(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  const body = fraction.length > 0 ? `${whole}.${fraction}` : whole;
  return negative ? `-${body}` : body;
}

/** Display with thousands separators and exactly 2 decimals, for totals. */
export function formatTokenDisplay(value: bigint, decimals: number): string {
  const exact = formatTokenAmount(value, decimals);
  const [whole = '0', fraction = ''] = exact.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const twoPlaces = fraction.padEnd(2, '0').slice(0, 2);
  return `${grouped}.${twoPlaces}`;
}

/**
 * True when a real, non-zero amount would render as "0.00" at two decimal places.
 *
 * USDC has 6 decimals and the fee is 30bps, so any payout under about $3.33 produces a
 * fee in this range — not an edge case. The dust test charged 0.0009 USDC.
 */
export function isSubCent(value: bigint, decimals: number): boolean {
  if (value <= 0n || decimals <= 2) return false;
  return value < 10n ** BigInt(decimals - 2);
}

/** Basis points → a percentage with no trailing zeros: 30 → "0.3%", 500 → "5%". */
export function formatFeeRate(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/**
 * The protocol fee as the user should see it — and NEVER as "$0.00".
 *
 * Rounding a fee we do charge down to zero is a claim we cannot make: the money leaves
 * their wallet either way. Below a cent the rate is the part of the disclosure that is
 * still honest at that scale, so it is shown in place of a number that would read as
 * nothing. `bps` is optional only because not every caller knows the live rate.
 */
export function formatFeeDisplay(value: bigint, decimals: number, bps?: number): string {
  if (!isSubCent(value, decimals)) return `$${formatTokenDisplay(value, decimals)}`;
  return bps === undefined ? '<$0.01' : `<$0.01 (${formatFeeRate(bps)})`;
}
