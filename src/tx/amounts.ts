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
