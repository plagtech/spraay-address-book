/**
 * Settling the journal against the chain.
 *
 * `pendingSend.ts` writes down what we asked a wallet to do. This asks Base what actually
 * happened and turns the answer into history. It runs on launch and every time the app
 * comes back to the foreground, which is precisely when the promise chain that was
 * supposed to notice may have died in the background.
 *
 * ── Two ways to find a payment ──────────────────────────────────────────────────
 * BY HASH, when the wallet's answer got back to us. One `eth_getTransactionReceipt`.
 *
 * BY EVENT, when it did not. `SprayTokenExecuted` indexes `sender` and `token`
 * (abi.ts:83-94), so the chain can be asked "did this account spray this token since
 * block N", and the entry's expected total and recipient count identify which of the
 * answers is ours. This is the path that would have saved the dust test: the transaction
 * mined and the app never learned its hash, so there was nothing to look up and nothing
 * to persist.
 *
 * It also quietly covers a case the hash path cannot — a transaction sped up or replaced
 * from inside the wallet, which mines under a different hash than the one we were handed.
 *
 * ── What it refuses to do ───────────────────────────────────────────────────────
 * Write a record it cannot prove. A match must carry the event, and the event's own
 * totals are what get recorded. A reverted transaction produces no record at all — the
 * money did not move, and history means money moved.
 */
import { getAbiItem, type Address, type Hash } from 'viem';

import { SPRAY_CONTRACT_ADDRESS } from '../config/chain';
import { loadContacts } from '../contacts/storage';
import { SPRAY_ABI } from '../contracts/abi';
import { publicClient } from '../contracts/publicClient';
import { appendSend, loadHistory, newSendId } from '../history/storage';
import type { SendRecord } from '../history/types';
import {
  dropPendingSend,
  loadPendingSends,
  PENDING_EXPIRY_MS,
  type PendingSend,
} from './pendingSend';
import { buildSendRecordFromReceipt } from './sprayReceipt';

const tag = (msg: string) => `[send-recovery] ${msg}`;

const SPRAY_EXECUTED_EVENT = getAbiItem({
  abi: SPRAY_ABI,
  name: 'SprayTokenExecuted',
});

/**
 * Blocks per `eth_getLogs` call. Base's public RPC caps the range, and with `sender` and
 * `token` both indexed the result set is a handful of logs however wide the window, so
 * this is about staying inside the provider's limit rather than about volume.
 */
const SCAN_CHUNK_BLOCKS = 2_000n;

/**
 * A day of Base at ~2s a block. The ceiling on how far back a scan will go when the
 * entry has no recorded block floor, and the same horizon `PENDING_EXPIRY_MS` gives up at.
 */
const MAX_LOOKBACK_BLOCKS = 43_200n;

/** Bounds one entry's scan so a stuck journal cannot turn into an RPC loop. */
const MAX_SCAN_CHUNKS = 24;

/* ── in-flight guard ────────────────────────────────────────────────────────── */

let sendInFlight = false;

/**
 * Held while `useSpraySend` is driving a signature, so recovery does not race the live
 * path to the same transaction and route the user to a Success screen the Review screen
 * is already on its way to.
 *
 * History itself is idempotent on hash, so the cost of a race would be a double
 * navigation rather than a double record — but a payments app should not flicker.
 */
export function setSendInFlight(value: boolean): void {
  sendInFlight = value;
}

export function isSendInFlight(): boolean {
  return sendInFlight;
}

/* ── outcomes ───────────────────────────────────────────────────────────────── */

export interface ReconcileResult {
  /** Payments proven on chain and written to history by this run. */
  recovered: SendRecord[];
  /**
   * Mined, but with no `SprayTokenExecuted` to vouch for it. Not recorded — surfaced so
   * the user can be pointed at the explorer instead of told nothing happened.
   */
  unverifiable: Hash[];
  /** Entries still waiting on an answer. Recovery will ask again. */
  stillPending: number;
}

const EMPTY: ReconcileResult = { recovered: [], unverifiable: [], stillPending: 0 };

/* ── the run ────────────────────────────────────────────────────────────────── */

let running: Promise<ReconcileResult> | undefined;

/**
 * Settle every outstanding entry. Concurrent callers — launch and a foreground event can
 * land together — share one run rather than each starting their own scan.
 */
export function reconcilePendingSends(): Promise<ReconcileResult> {
  if (running) return running;
  running = execute().finally(() => {
    running = undefined;
  });
  return running;
}

async function execute(): Promise<ReconcileResult> {
  if (sendInFlight) return EMPTY;

  const entries = await loadPendingSends();
  if (entries.length === 0) return EMPTY;

  const history = await loadHistory();
  const seen = new Set(history.map((r) => r.hash.toLowerCase()));

  /** Loaded once for the whole run so a recovered receipt can still show names. */
  const contacts = await loadContacts().catch(() => []);
  const nameFor = (address: Address): string | undefined =>
    contacts.find((c) => c.address.toLowerCase() === address.toLowerCase())?.name;

  const result: ReconcileResult = { recovered: [], unverifiable: [], stillPending: 0 };

  for (const entry of entries) {
    try {
      await settle(entry, seen, nameFor, result);
    } catch (err) {
      /**
       * An RPC that would not answer is not evidence about the payment. Leave the entry
       * alone and ask again next time the app comes forward.
       */
      const e = err as { message?: string };
      console.warn(tag(`could not settle ${entry.id}: ${e?.message ?? String(err)}`));
      result.stillPending += 1;
    }
  }

  return result;
}

async function settle(
  entry: PendingSend,
  seen: Set<string>,
  nameFor: (address: Address) => string | undefined,
  result: ReconcileResult,
): Promise<void> {
  /** Already recorded — by the live path, or by an earlier run. Nothing left to ask. */
  if (entry.hash && seen.has(entry.hash.toLowerCase())) {
    await dropPendingSend(entry.id);
    return;
  }

  const outcome = entry.hash
    ? await classifyByHash(entry, seen, nameFor, result)
    : 'unknown';
  if (outcome === 'settled') return;

  /**
   * Either there was no hash, or the hash is not on chain — which can mean still in the
   * mempool, or replaced by the wallet under a different one. Ask the event index.
   */
  const found = await findExecutedTx(entry, seen);

  if (!found) {
    if (Date.now() - entry.createdAt > PENDING_EXPIRY_MS) {
      console.warn(tag(`giving up on ${entry.id} — nothing on chain after 24h`));
      await dropPendingSend(entry.id);
      return;
    }
    result.stillPending += 1;
    return;
  }

  await recordFrom(found, entry, seen, nameFor, result);
}

/**
 * Resolve an entry that has a hash. Returns 'settled' when the chain gave a definitive
 * answer — recorded, or reverted, or mined-but-unvouchable — and 'unknown' when the
 * transaction simply isn't there yet and the event scan should take over.
 */
async function classifyByHash(
  entry: PendingSend,
  seen: Set<string>,
  nameFor: (address: Address) => string | undefined,
  result: ReconcileResult,
): Promise<'settled' | 'unknown'> {
  const hash = entry.hash!;

  const receipt = await publicClient
    .getTransactionReceipt({ hash })
    .catch(() => undefined);

  if (!receipt) return 'unknown';

  if (receipt.status !== 'success') {
    /**
     * The transaction reverted: the tokens never left the wallet. There is nothing to
     * record and nothing to recover, so the question is closed.
     */
    console.log(tag(`${entry.id} reverted on chain — no record written`));
    await dropPendingSend(entry.id);
    return 'settled';
  }

  await recordFrom(hash, entry, seen, nameFor, result, receipt);
  return 'settled';
}

/**
 * Build and store the history record for a proven transaction.
 *
 * Takes the receipt when the caller already has it — the hash path fetches one to check
 * `status`, and re-fetching it here would double every recovery's RPC cost for nothing.
 */
async function recordFrom(
  hash: Hash,
  entry: PendingSend,
  seen: Set<string>,
  nameFor: (address: Address) => string | undefined,
  result: ReconcileResult,
  fetched?: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>,
): Promise<void> {
  const receipt = fetched ?? (await publicClient.getTransactionReceipt({ hash }));

  const record = buildSendRecordFromReceipt({
    receipt,
    id: newSendId(),
    known: entry.recipients,
    nameFor,
    mode: entry.mode,
  });

  if (!record) {
    /**
     * Mined, but not as a spray we can describe. Same judgement the live path makes:
     * send the user to the explorer rather than claim a payment we cannot read.
     */
    console.warn(tag(`${hash} mined without a readable SprayTokenExecuted`));
    result.unverifiable.push(hash);
    await dropPendingSend(entry.id);
    return;
  }

  await appendSend(record);
  seen.add(record.hash.toLowerCase());
  await dropPendingSend(entry.id);

  result.recovered.push(record);
  console.log(tag(`recovered ${record.hash} into history`));
}

/**
 * Search the event index for this entry's transaction.
 *
 * Scanned newest-first: a pending payment is almost always at the tip, and starting there
 * means the usual case costs one request. `seen` keeps a batch that was already recorded
 * from being matched a second time, which is what makes repeating an identical payout
 * safe.
 */
async function findExecutedTx(
  entry: PendingSend,
  seen: Set<string>,
): Promise<Hash | undefined> {
  const latest = await publicClient.getBlockNumber();

  const floorFromEntry = entry.fromBlock;
  const horizon = latest > MAX_LOOKBACK_BLOCKS ? latest - MAX_LOOKBACK_BLOCKS : 0n;
  /** Never scan further back than the horizon, even if the entry asks for it. */
  const floor =
    floorFromEntry !== undefined && floorFromEntry > horizon ? floorFromEntry : horizon;
  if (floor > latest) return undefined;

  let end = latest;
  for (let chunk = 0; chunk < MAX_SCAN_CHUNKS && end >= floor; chunk += 1) {
    const span = SCAN_CHUNK_BLOCKS - 1n;
    const start = end > floor + span ? end - span : floor;

    const logs = await publicClient.getLogs({
      address: SPRAY_CONTRACT_ADDRESS,
      event: SPRAY_EXECUTED_EVENT,
      args: { sender: entry.sender, token: entry.token },
      fromBlock: start,
      toBlock: end,
      strict: true,
    });

    /** Newest first inside the chunk too, so the tip really is checked first. */
    for (const log of [...logs].reverse()) {
      if (!log.transactionHash) continue;
      if (seen.has(log.transactionHash.toLowerCase())) continue;
      if (log.args.totalAmount !== entry.expectedTotal) continue;
      if (Number(log.args.recipientCount) !== entry.recipients.length) continue;
      return log.transactionHash;
    }

    if (start === floor) break;
    end = start - 1n;
  }

  return undefined;
}
