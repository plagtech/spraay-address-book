/**
 * The journal that has to survive whatever kills the send.
 *
 * Two properties matter more than the rest: bigints must round-trip exactly (the expected
 * total is what recovery matches a chain event against, so a rounded one matches nothing),
 * and a write failure must never take the payment down with it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hash } from 'viem';

import {
  addPendingSend,
  attachPendingHash,
  dropPendingSend,
  loadPendingSends,
  newPendingId,
  type PendingSend,
} from '../pendingSend';

const SENDER = '0x6d8f41DF79097Fb9fEffC4265951718a2FbF219E' as Address;
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const R1 = '0xc627411C69B1feF931B237ca243C25A82B6505BF' as Address;
const HASH = ('0x' + 'ab'.repeat(32)) as Hash;
const KEY = 'spraay.pending-sends.v1';

const entry = (over: Partial<PendingSend> = {}): PendingSend => ({
  id: 'p1',
  sender: SENDER,
  token: USDC,
  tokenSymbol: 'USDC',
  decimals: 6,
  mode: 'equal',
  recipients: [{ address: R1, amount: 100_000n }],
  expectedTotal: 100_000n,
  fromBlock: 49_586_500n,
  createdAt: 1_785_962_000_000,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('round-tripping', () => {
  it('does not throw on the bigints it is made of', async () => {
    await expect(addPendingSend(entry())).resolves.toBeUndefined();
  });

  it('returns amounts and block heights exactly, with no Number in the path', async () => {
    const huge = 123_456_789_012_345_678_901_234_567_890n;
    await addPendingSend(entry({ expectedTotal: huge, fromBlock: huge }));

    const [loaded] = await loadPendingSends();
    expect(loaded?.expectedTotal).toBe(huge);
    expect(loaded?.fromBlock).toBe(huge);
  });

  it('keeps the whole batch, names included', async () => {
    await addPendingSend(
      entry({
        recipients: [
          { address: R1, name: 'Ada', amount: 100_000n },
          { address: USDC, amount: 200_000n },
        ],
      }),
    );

    const [loaded] = await loadPendingSends();
    expect(loaded?.recipients).toEqual([
      { address: R1, name: 'Ada', amount: 100_000n },
      { address: USDC, amount: 200_000n },
    ]);
  });

  it('starts empty and stays empty when storage holds junk', async () => {
    expect(await loadPendingSends()).toEqual([]);

    await AsyncStorage.setItem(KEY, 'not json');
    expect(await loadPendingSends()).toEqual([]);

    await AsyncStorage.setItem(KEY, '{"not":"an array"}');
    expect(await loadPendingSends()).toEqual([]);
  });
});

describe('validation', () => {
  /**
   * A half-read entry would send recovery hunting for a transaction that does not match
   * the one we signed, and matching the WRONG transaction is worse than matching none.
   */
  it('drops an entry whose amount is not a base-unit integer', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify([{ ...wire(), expectedTotal: '1.5' }]),
    );
    expect(await loadPendingSends()).toEqual([]);
  });

  it('drops an entry with an unusable sender', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify([{ ...wire(), sender: 'nope' }]));
    expect(await loadPendingSends()).toEqual([]);
  });

  it('drops an entry whose recipient rows did not all parse', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify([
        { ...wire(), recipients: [{ address: R1, amount: '1' }, { address: 'bad' }] },
      ]),
    );
    expect(await loadPendingSends()).toEqual([]);
  });

  it('ignores a hash that is not a transaction hash rather than the whole entry', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify([{ ...wire(), hash: '0xdeadbeef' }]));

    const [loaded] = await loadPendingSends();
    expect(loaded?.id).toBe('p1');
    expect(loaded?.hash).toBeUndefined();
  });
});

describe('lifecycle', () => {
  it('attaches the hash the moment the wallet answers', async () => {
    await addPendingSend(entry());
    await attachPendingHash('p1', HASH);

    expect((await loadPendingSends())[0]?.hash).toBe(HASH);
  });

  it('leaves other entries alone when attaching', async () => {
    await addPendingSend(entry({ id: 'p1' }));
    await addPendingSend(entry({ id: 'p2', createdAt: 2 }));
    await attachPendingHash('p2', HASH);

    const loaded = await loadPendingSends();
    expect(loaded.find((e) => e.id === 'p1')?.hash).toBeUndefined();
    expect(loaded.find((e) => e.id === 'p2')?.hash).toBe(HASH);
  });

  it('drops only the entry asked for', async () => {
    await addPendingSend(entry({ id: 'p1' }));
    await addPendingSend(entry({ id: 'p2', createdAt: 2 }));
    await dropPendingSend('p1');

    expect((await loadPendingSends()).map((e) => e.id)).toEqual(['p2']);
  });

  it('replaces rather than duplicates an entry written twice', async () => {
    await addPendingSend(entry());
    await addPendingSend(entry({ expectedTotal: 999n }));

    const loaded = await loadPendingSends();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.expectedTotal).toBe(999n);
  });

  it('returns oldest first, so the longest-outstanding question is settled first', async () => {
    await addPendingSend(entry({ id: 'new', createdAt: 200 }));
    await addPendingSend(entry({ id: 'old', createdAt: 100 }));

    expect((await loadPendingSends()).map((e) => e.id)).toEqual(['old', 'new']);
  });
});

describe('a failing store must not fail the payment', () => {
  it('swallows a write error instead of aborting the send', async () => {
    const setItem = jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(addPendingSend(entry())).resolves.toBeUndefined();

    setItem.mockRestore();
  });

  it('reads as empty rather than throwing when storage is unreadable', async () => {
    const getItem = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('nope'));

    await expect(loadPendingSends()).resolves.toEqual([]);

    getItem.mockRestore();
  });
});

describe('newPendingId', () => {
  it('does not collide across rapid calls', () => {
    const ids = new Set(Array.from({ length: 200 }, newPendingId));
    expect(ids.size).toBe(200);
  });
});

/** The on-disk shape of `entry()`, for the validation cases above. */
function wire() {
  return {
    id: 'p1',
    sender: SENDER,
    token: USDC,
    tokenSymbol: 'USDC',
    decimals: 6,
    mode: 'equal',
    recipients: [{ address: R1, amount: '100000' }],
    expectedTotal: '100000',
    fromBlock: '49586500',
    createdAt: 1_785_962_000_000,
  };
}
