import type { Address, Hash } from 'viem';

import { formatReceipt, formatReceiptDate } from '../receipt';
import type { SendRecord } from '../types';

const A = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const B = '0x4200000000000000000000000000000000000006' as Address;
const HASH = ('0x' + 'ab'.repeat(32)) as Hash;

/** 27 Jul 2026, midday UTC — mid-day so a local-timezone shift can't roll the date. */
const SENT_AT = Date.UTC(2026, 6, 27, 12, 0, 0);

const record = (over: Partial<SendRecord> = {}): SendRecord => ({
  id: 's1',
  hash: HASH,
  sentAt: SENT_AT,
  mode: 'equal',
  recipients: [
    { address: A, name: 'Ada', amount: 5_000_000n },
    { address: B, name: 'Grace', amount: 5_000_000n },
  ],
  recipientCount: 2,
  total: 10_030_000n,
  fee: 30_000n,
  token: 'USDC',
  decimals: 6,
  ...over,
});

describe('formatReceiptDate', () => {
  it('uses an unambiguous day-month-year form', () => {
    expect(formatReceiptDate(SENT_AT)).toBe('27 Jul 2026');
  });

  it('handles a nonsense timestamp without throwing', () => {
    expect(formatReceiptDate(Number.NaN)).toBe('Unknown date');
  });
});

describe('formatReceipt', () => {
  it('includes the date, count, total and transaction link', () => {
    const text = formatReceipt(record());
    expect(text).toContain('27 Jul 2026');
    expect(text).toContain('2 people');
    expect(text).toContain('$10.03 USDC');
    expect(text).toContain(`https://basescan.org/tx/${HASH}`);
  });

  it('singularises a one-person send', () => {
    expect(formatReceipt(record({ recipientCount: 1 }))).toContain('1 person');
  });

  it('shows the fee only when there is one', () => {
    expect(formatReceipt(record())).toContain('$0.03 fee');
    expect(formatReceipt(record({ fee: 0n }))).not.toContain('fee');
  });

  /**
   * Shared text leaves the phone, so a fee rounded to "$0.00" is a false claim that
   * travels. Mirrors the dust test: 0.30 out, 0.0009 taken.
   */
  it('never claims a sub-cent fee was zero', () => {
    const text = formatReceipt(record({ total: 300_900n, fee: 900n }));
    expect(text).toContain('Includes <$0.01 (0.3%) fee');
    expect(text).not.toContain('$0.00');
  });

  it('derives the rate from the record, not from the current contract', () => {
    // A record written under a 1% fee keeps reporting 1%, whatever the fee is today.
    const text = formatReceipt(record({ total: 101_000n, fee: 1_000n }));
    expect(text).toContain('(1%)');
  });

  /**
   * The privacy rule. Receipts get pasted into group chats, and a wallet address is a
   * permanent public identifier the payee never agreed to share.
   */
  describe('never leaks addresses', () => {
    it('omits recipient addresses by default', () => {
      const text = formatReceipt(record());
      expect(text).not.toContain(A);
      expect(text).not.toContain(B);
      expect(text).not.toContain(A.toLowerCase());
      expect(text).not.toContain(A.slice(0, 10));
    });

    it('omits contact names by default', () => {
      const text = formatReceipt(record());
      expect(text).not.toContain('Ada');
      expect(text).not.toContain('Grace');
    });

    it('still omits addresses when recipients are opted in', () => {
      const text = formatReceipt(record(), { includeRecipients: true });
      expect(text).toContain('Ada');
      expect(text).toContain('Grace');
      // Names are the most that opting in can ever reveal.
      expect(text).not.toContain(A);
      expect(text).not.toContain(B);
    });

    it('contains no 0x string other than the transaction hash', () => {
      const text = formatReceipt(record(), { includeRecipients: true });
      const hexes = text.match(/0x[0-9a-fA-F]+/g) ?? [];
      expect(hexes).toEqual([HASH]);
    });

    it('lists nothing when opted-in recipients have no names', () => {
      const text = formatReceipt(
        record({ recipients: [{ address: A, amount: 1n }] }),
        { includeRecipients: true },
      );
      const hexes = text.match(/0x[0-9a-fA-F]+/g) ?? [];
      expect(hexes).toEqual([HASH]);
    });
  });

  it('formats amounts from the record decimals, not a global config', () => {
    const text = formatReceipt(
      record({ total: 1_500_000_000_000_000_000n, decimals: 18, token: 'DAI' }),
    );
    expect(text).toContain('$1.50 DAI');
  });
});
