/**
 * Decoding a spray back out of its receipt.
 *
 * The fixture is not invented. Every address, topic, data word and log ordering below is
 * copied from the live Base receipt for
 * `0xcb617e8849167603ea793806da5447bfe70c22ca75e8a45d54a15ac08bceb615` — dust test run 1,
 * the payment that succeeded on chain and that the app failed to notice. If this decoder
 * is right, that transaction lands in History correctly; if it drifts, these fail.
 *
 * That is also why the numbers are asserted as literals rather than derived: 300000 base
 * units to three people with a 900-unit fee is what Basescan says happened, and the test
 * should fail if the code ever computes something else, however plausibly.
 */
import { getAddress, type Address, type Hash, type Hex, type Log } from 'viem';

import type { SendRecipientRecord } from '../../history/types';
import {
  buildSendRecordFromReceipt,
  findSprayExecuted,
  reconstructRecipients,
} from '../sprayReceipt';

/* ── the live transaction ───────────────────────────────────────────────────── */

const TX_HASH =
  '0xcb617e8849167603ea793806da5447bfe70c22ca75e8a45d54a15ac08bceb615' as Hash;
const BLOCK_HASH =
  '0x18fa4a3d2b15003e84b571d99565901eaf0de5bc16240745b48e5ad7d0296c1a' as Hash;
const BLOCK = 49_586_562n;

const SENDER = '0x6d8f41df79097fb9feffc4265951718a2fbf219e';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const SPRAY = '0x1646452f98e36a3c9cfc3edd8868221e207b5eec';

const R1 = '0xc627411c69b1fef931b237ca243c25a82b6505bf';
const R2 = '0x85e4d5a1f42f6da2c6f12994a089e7aaa14079a2';
const R3 = '0xf39821e30eded6189529470e42427860bd0a8200';
const FEE_COLLECTOR = '0x033d3ce3bfd69b1d180869308822075219e771b5';

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const EXECUTED_TOPIC =
  '0x592ae3947a7a1d4eeaa70c65336f6a9ce4c8d58d2aad13a24c32ba733974d200';

/** The contract's own timestamp word: 0x6a739fe7. */
const CHAIN_SECONDS = 1_785_962_471n;

const PULL_IN = 300_900n; // subtotal + fee, sender → contract
const PER_PERSON = 100_000n;
const TOTAL = 300_000n;
const FEE = 900n;

/* ── fixture builders ───────────────────────────────────────────────────────── */

const topic = (address: string) =>
  `0x000000000000000000000000${address.slice(2).toLowerCase()}` as Hex;

const word = (value: bigint) => value.toString(16).padStart(64, '0');

/**
 * viem's bare `Log` is the pending-or-mined union, so its `blockHash` is nullable and it
 * will not satisfy a `TransactionReceipt`'s log list. Everything here came out of a mined
 * receipt.
 */
type MinedLog = Log<bigint, number, false>;

let nextLogIndex = 0;

const makeLog = (address: string, topics: string[], data: string): MinedLog =>
  ({
    address: address as Address,
    topics: topics as [Hex, ...Hex[]],
    data: data as Hex,
    blockHash: BLOCK_HASH,
    blockNumber: BLOCK,
    logIndex: nextLogIndex++,
    transactionHash: TX_HASH,
    transactionIndex: 94,
    removed: false,
  }) as unknown as MinedLog;

const transfer = (from: string, to: string, value: bigint, token = USDC) =>
  makeLog(token, [TRANSFER_TOPIC, topic(from), topic(to)], `0x${word(value)}`);

const executed = (
  over: { token?: string; total?: bigint; count?: bigint; fee?: bigint } = {},
) =>
  makeLog(
    SPRAY,
    [EXECUTED_TOPIC, topic(SENDER), topic(over.token ?? USDC)],
    `0x${word(over.total ?? TOTAL)}${word(over.count ?? 3n)}${word(
      over.fee ?? FEE,
    )}${word(CHAIN_SECONDS)}`,
  );

/** The logs exactly as the live receipt carries them, in order. */
const liveLogs = (): MinedLog[] => [
  transfer(SENDER, SPRAY, PULL_IN),
  transfer(SPRAY, R1, PER_PERSON),
  transfer(SPRAY, R2, PER_PERSON),
  transfer(SPRAY, R3, PER_PERSON),
  transfer(SPRAY, FEE_COLLECTOR, FEE),
  executed(),
];

const receiptOf = (logs: MinedLog[], status: 'success' | 'reverted' = 'success') => ({
  logs,
  transactionHash: TX_HASH,
  status,
});

beforeEach(() => {
  nextLogIndex = 0;
});

/* ── the event ──────────────────────────────────────────────────────────────── */

describe('findSprayExecuted', () => {
  it('reads the contract figures off the live receipt', () => {
    const found = findSprayExecuted(liveLogs());

    expect(found).toEqual({
      sender: getAddress(SENDER),
      token: getAddress(USDC),
      totalAmount: 300_000n,
      recipientCount: 3,
      feeAmount: 900n,
      timestamp: CHAIN_SECONDS,
    });
  });

  it('skips the ERC-20 logs sharing the receipt rather than choking on them', () => {
    /** Four Transfers precede the event; none of them decode as ours. */
    expect(findSprayExecuted(liveLogs())?.recipientCount).toBe(3);
  });

  it('returns undefined when no spray event is present', () => {
    expect(findSprayExecuted([transfer(SENDER, R1, PER_PERSON)])).toBeUndefined();
  });

  it('ignores an event emitted by some other contract at the same topic', () => {
    const impostor = makeLog(
      USDC,
      [EXECUTED_TOPIC, topic(SENDER), topic(USDC)],
      `0x${word(TOTAL)}${word(3n)}${word(FEE)}${word(CHAIN_SECONDS)}`,
    );
    expect(findSprayExecuted([impostor])).toBeUndefined();
  });
});

/* ── the payees ─────────────────────────────────────────────────────────────── */

describe('reconstructRecipients', () => {
  it('finds the three payees and leaves out the fee and the pull-in', () => {
    const logs = liveLogs();
    const rows = reconstructRecipients(logs, findSprayExecuted(logs)!);

    expect(rows).toEqual([
      { address: getAddress(R1), amount: PER_PERSON },
      { address: getAddress(R2), amount: PER_PERSON },
      { address: getAddress(R3), amount: PER_PERSON },
    ]);
  });

  it('still balances if the fee is ever emitted before the payees', () => {
    const logs = [
      transfer(SENDER, SPRAY, PULL_IN),
      transfer(SPRAY, FEE_COLLECTOR, FEE),
      transfer(SPRAY, R1, PER_PERSON),
      transfer(SPRAY, R2, PER_PERSON),
      transfer(SPRAY, R3, PER_PERSON),
      executed(),
    ];

    expect(reconstructRecipients(logs, findSprayExecuted(logs)!)).toEqual([
      { address: getAddress(R1), amount: PER_PERSON },
      { address: getAddress(R2), amount: PER_PERSON },
      { address: getAddress(R3), amount: PER_PERSON },
    ]);
  });

  it('handles a direct transferFrom shape, with no pooling leg at all', () => {
    const logs = [
      transfer(SENDER, R1, PER_PERSON),
      transfer(SENDER, R2, PER_PERSON),
      transfer(SENDER, R3, PER_PERSON),
      transfer(SENDER, SPRAY, FEE),
      executed(),
    ];

    expect(reconstructRecipients(logs, findSprayExecuted(logs)!)).toEqual([
      { address: getAddress(R1), amount: PER_PERSON },
      { address: getAddress(R2), amount: PER_PERSON },
      { address: getAddress(R3), amount: PER_PERSON },
    ]);
  });

  it('refuses to guess when the legs cannot be made to match the event total', () => {
    /** One payee leg missing: nothing left that sums to 300000 across three rows. */
    const logs = [
      transfer(SENDER, SPRAY, PULL_IN),
      transfer(SPRAY, R1, PER_PERSON),
      transfer(SPRAY, R2, PER_PERSON),
      transfer(SPRAY, FEE_COLLECTOR, FEE),
      executed(),
    ];

    expect(reconstructRecipients(logs, findSprayExecuted(logs)!)).toBeUndefined();
  });
});

/* ── the record ─────────────────────────────────────────────────────────────── */

describe('buildSendRecordFromReceipt', () => {
  it('rebuilds dust test run 1 exactly as Basescan reports it', () => {
    const record = buildSendRecordFromReceipt({
      receipt: receiptOf(liveLogs()),
      id: 's_test',
      mode: 'equal',
    });

    expect(record).toEqual({
      id: 's_test',
      hash: TX_HASH,
      /** The CONTRACT's timestamp, not the clock at recovery time. */
      sentAt: 1_785_962_471_000,
      mode: 'equal',
      recipients: [
        { address: getAddress(R1), amount: PER_PERSON },
        { address: getAddress(R2), amount: PER_PERSON },
        { address: getAddress(R3), amount: PER_PERSON },
      ],
      recipientCount: 3,
      total: 300_000n,
      fee: 900n,
      token: 'USDC',
      decimals: 6,
    });
  });

  it('labels payees from the book when the record is recovered after the fact', () => {
    const record = buildSendRecordFromReceipt({
      receipt: receiptOf(liveLogs()),
      id: 's_test',
      nameFor: (address) =>
        address.toLowerCase() === R2.toLowerCase() ? 'Ada' : undefined,
    });

    expect(record?.recipients[1]).toEqual({
      address: getAddress(R2),
      name: 'Ada',
      amount: PER_PERSON,
    });
    expect(record?.recipients[0]?.name).toBeUndefined();
  });

  it('prefers the name captured at send time over the current book', () => {
    const known: SendRecipientRecord[] = [
      { address: getAddress(R1) as Address, name: 'Ada at send time', amount: PER_PERSON },
    ];

    const record = buildSendRecordFromReceipt({
      receipt: receiptOf(liveLogs()),
      id: 's_test',
      known,
      nameFor: () => 'renamed since',
    });

    expect(record?.recipients[0]?.name).toBe('Ada at send time');
  });

  it('falls back to the remembered rows when the logs will not reconcile', () => {
    const known: SendRecipientRecord[] = [
      { address: getAddress(R1) as Address, amount: PER_PERSON },
      { address: getAddress(R2) as Address, amount: PER_PERSON },
      { address: getAddress(R3) as Address, amount: PER_PERSON },
    ];

    const record = buildSendRecordFromReceipt({
      receipt: receiptOf([
        transfer(SENDER, SPRAY, PULL_IN),
        transfer(SPRAY, R1, PER_PERSON),
        transfer(SPRAY, R2, PER_PERSON),
        transfer(SPRAY, FEE_COLLECTOR, FEE),
        executed(),
      ]),
      id: 's_test',
      known,
    });

    expect(record?.recipients).toEqual(known);
    /** The totals still come from the event, never from the fallback rows. */
    expect(record?.total).toBe(300_000n);
    expect(record?.recipientCount).toBe(3);
  });

  it('records the totals with no breakdown rather than inventing one', () => {
    const record = buildSendRecordFromReceipt({
      receipt: receiptOf([
        transfer(SENDER, SPRAY, PULL_IN),
        transfer(SPRAY, R1, PER_PERSON),
        transfer(SPRAY, FEE_COLLECTOR, FEE),
        executed(),
      ]),
      id: 's_test',
    });

    expect(record?.recipients).toEqual([]);
    expect(record?.total).toBe(300_000n);
    expect(record?.fee).toBe(900n);
  });

  it('writes nothing for a reverted transaction', () => {
    expect(
      buildSendRecordFromReceipt({
        receipt: receiptOf(liveLogs(), 'reverted'),
        id: 's_test',
      }),
    ).toBeUndefined();
  });

  it('writes nothing for a receipt with no spray event', () => {
    expect(
      buildSendRecordFromReceipt({
        receipt: receiptOf([transfer(SENDER, R1, PER_PERSON)]),
        id: 's_test',
      }),
    ).toBeUndefined();
  });

  it('writes nothing for a token it cannot denominate', () => {
    const unknown = '0x00000000000000000000000000000000deadbeef';
    const logs = [
      transfer(SENDER, SPRAY, PULL_IN, unknown),
      transfer(SPRAY, R1, PER_PERSON, unknown),
      transfer(SPRAY, R2, PER_PERSON, unknown),
      transfer(SPRAY, R3, PER_PERSON, unknown),
      transfer(SPRAY, FEE_COLLECTOR, FEE, unknown),
      executed({ token: unknown }),
    ];

    expect(
      buildSendRecordFromReceipt({ receipt: receiptOf(logs), id: 's_test' }),
    ).toBeUndefined();
  });
});
