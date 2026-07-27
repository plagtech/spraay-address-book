import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hash } from 'viem';

import { appendSend, loadHistory, newSendId, saveHistory } from '../storage';
import type { SendRecord } from '../types';

const A = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const B = '0x4200000000000000000000000000000000000006' as Address;
const HASH = ('0x' + 'ab'.repeat(32)) as Hash;
const HASH2 = ('0x' + 'cd'.repeat(32)) as Hash;
const KEY = 'spraay.history.v1';

const record = (over: Partial<SendRecord> = {}): SendRecord => ({
  id: 's1',
  hash: HASH,
  sentAt: 1_700_000_000_000,
  mode: 'equal',
  recipients: [
    { address: A, name: 'Ada', amount: 5_000_000n },
    { address: B, amount: 5_000_000n },
  ],
  recipientCount: 2,
  total: 10_030_000n,
  fee: 30_000n,
  token: 'USDC',
  decimals: 6,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('bigint serialisation', () => {
  /** JSON.stringify throws on a bigint, so the wire shape must convert explicitly. */
  it('does not throw when saving records containing bigints', async () => {
    await expect(saveHistory([record()])).resolves.toBeUndefined();
  });

  it('round-trips amounts exactly, with no Number in the path', async () => {
    const huge = 123_456_789_012_345_678_901_234_567_890n;
    await saveHistory([record({ total: huge, fee: huge, recipients: [
      { address: A, amount: huge },
    ] })]);

    const [loaded] = await loadHistory();
    expect(loaded?.total).toBe(huge);
    expect(loaded?.fee).toBe(huge);
    expect(loaded?.recipients[0]?.amount).toBe(huge);
    // Beyond Number.MAX_SAFE_INTEGER — a Number round trip would corrupt this.
    expect(huge > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('stores amounts as strings on disk', async () => {
    await saveHistory([record()]);
    const raw = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    expect(typeof raw[0].total).toBe('string');
    expect(typeof raw[0].recipients[0].amount).toBe('string');
  });
});

describe('loadHistory', () => {
  it('returns an empty list when nothing is stored', async () => {
    expect(await loadHistory()).toEqual([]);
  });

  it('sorts newest first regardless of stored order', async () => {
    await saveHistory([
      record({ id: 'old', hash: HASH, sentAt: 1000 }),
      record({ id: 'new', hash: HASH2, sentAt: 9000 }),
    ]);
    expect((await loadHistory()).map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('survives corrupt payloads', async () => {
    await AsyncStorage.setItem(KEY, '{not json');
    expect(await loadHistory()).toEqual([]);

    await AsyncStorage.setItem(KEY, JSON.stringify({ nope: true }));
    expect(await loadHistory()).toEqual([]);
  });

  const seedRaw = async (payload: unknown) => {
    await AsyncStorage.setItem(KEY, JSON.stringify([payload]));
  };

  /**
   * A receipt that misstates what was sent is worse than a missing one, so anything
   * touching identity or amounts drops the whole record.
   */
  it.each([
    ['a non-hex hash', { hash: 'not-a-hash' }],
    ['a truncated hash', { hash: '0xabcd' }],
    ['a missing id', { id: '' }],
    ['a non-numeric total', { total: 'lots' }],
    ['a decimal total', { total: '10.5' }],
    ['a negative fee', { fee: '-1' }],
  ])('drops a record with %s', async (_label, over) => {
    const wire = {
      id: 's1',
      hash: HASH,
      sentAt: 1,
      mode: 'equal',
      recipients: [{ address: A, amount: '1' }],
      recipientCount: 1,
      total: '1',
      fee: '0',
      token: 'USDC',
      decimals: 6,
      ...over,
    };
    await seedRaw(wire);
    expect(await loadHistory()).toEqual([]);
  });

  /**
   * A partially-parsed recipient list would understate the payment, so one bad row
   * invalidates the record rather than silently shortening the breakdown.
   */
  it('drops a record when any recipient row is unparseable', async () => {
    await seedRaw({
      id: 's1',
      hash: HASH,
      sentAt: 1,
      mode: 'equal',
      recipients: [
        { address: A, amount: '1' },
        { address: '0xnope', amount: '1' },
      ],
      recipientCount: 2,
      total: '2',
      fee: '0',
      token: 'USDC',
      decimals: 6,
    });
    expect(await loadHistory()).toEqual([]);
  });

  it('falls back on cosmetic fields rather than losing the record', async () => {
    await seedRaw({
      id: 's1',
      hash: HASH,
      sentAt: 'whenever',
      mode: 'sideways',
      recipients: [{ address: A, amount: '1' }],
      recipientCount: 'many',
      total: '1',
      fee: '0',
      token: '',
      decimals: 'six',
    });
    const [loaded] = await loadHistory();
    expect(loaded).toMatchObject({
      sentAt: 0,
      mode: 'equal',
      recipientCount: 1,
      token: 'USDC',
      decimals: 6,
    });
  });
});

describe('appendSend', () => {
  it('adds a record', async () => {
    await appendSend(record());
    expect(await loadHistory()).toHaveLength(1);
  });

  /**
   * The Success screen can re-mount, and a payment must never appear twice in its own
   * history.
   */
  it('is idempotent on transaction hash', async () => {
    await appendSend(record({ id: 'first' }));
    await appendSend(record({ id: 'second' }));

    const all = await loadHistory();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('first');
  });

  it('treats hash case-insensitively when deduping', async () => {
    await appendSend(record({ id: 'first', hash: HASH }));
    await appendSend(
      record({ id: 'second', hash: HASH.toUpperCase().replace('0X', '0x') as Hash }),
    );
    expect(await loadHistory()).toHaveLength(1);
  });

  it('keeps distinct sends', async () => {
    await appendSend(record({ id: 'a', hash: HASH }));
    await appendSend(record({ id: 'b', hash: HASH2, sentAt: 2_000_000_000_000 }));
    expect(await loadHistory()).toHaveLength(2);
  });
});

describe('newSendId', () => {
  it('produces unique ids in bulk', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newSendId()));
    expect(ids.size).toBe(5000);
  });
});
