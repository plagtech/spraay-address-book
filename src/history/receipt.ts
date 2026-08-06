/**
 * Shareable receipt text.
 *
 * ── Privacy rule ──────────────────────────────────────────────────────────────────
 * Shared text carries NO raw addresses and no contact names by default. A receipt gets
 * pasted into group chats and emails, and a wallet address is a permanent, publicly
 * traceable identifier — leaking a payee's address into a chat is not something they
 * opted into. The transaction link is deliberately enough for anyone who needs detail:
 * it exposes exactly what is already public on chain, and nothing that ties an address
 * to a name in the sender's phone.
 *
 * Kept pure and free of React so the rule can be tested directly.
 */
import { BASESCAN_TX_URL } from '../config/chain';
import { formatFeeDisplay, formatTokenDisplay } from '../tx/amounts';
import type { SendRecord } from './types';

export interface ReceiptOptions {
  /**
   * Opt-in only, and no UI sets it today. Exists so the privacy decision is a visible
   * switch rather than something a future edit changes by accident.
   */
  includeRecipients?: boolean;
}

/** "27 Jul 2026" — unambiguous across locales, unlike numeric date orders. */
export function formatReceiptDate(epochMs: number): string {
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatReceipt(record: SendRecord, options: ReceiptOptions = {}): string {
  const people = record.recipientCount === 1 ? 'person' : 'people';
  const amount = formatTokenDisplay(record.total, record.decimals);

  const lines = [
    `Spraay payment · ${formatReceiptDate(record.sentAt)}`,
    `Sent $${amount} ${record.token} to ${record.recipientCount} ${people}`,
  ];

  /**
   * The `> 0n` guard means a genuinely free send prints nothing — so the only way this
   * line can appear is when a fee was really charged, and it must never then round that
   * fee to "$0.00". Shared text leaves the app, so a false claim here travels.
   *
   * The rate is derived from the record rather than from today's contract: an old
   * receipt has to keep describing the fee that was actually taken.
   */
  if (record.fee > 0n) {
    const subtotal = record.total - record.fee;
    const bps =
      subtotal > 0n ? Number((record.fee * 10_000n) / subtotal) : undefined;
    lines.push(`Includes ${formatFeeDisplay(record.fee, record.decimals, bps)} fee`);
  }

  /**
   * Even opted in, only names are listed — never addresses. There is no option that
   * puts an address into shared text.
   */
  if (options.includeRecipients) {
    const named = record.recipients
      .map((r) => r.name)
      .filter((n): n is string => Boolean(n && n.trim().length > 0));

    if (named.length > 0) {
      lines.push('', ...named.map((n) => `· ${n}`));
    }
  }

  lines.push('', BASESCAN_TX_URL(record.hash));

  return lines.join('\n');
}
