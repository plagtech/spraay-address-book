/**
 * One-off repair for payments that happened before the app could record them.
 *
 * ── What this is for ────────────────────────────────────────────────────────────
 * Dust test run 1 succeeded on Base — three transfers and the 0.0009 USDC fee, mined in
 * block 49,586,562 — and the app noticed none of it. The recovery path in `tx/reconcile.ts`
 * stops that happening again, but it works from the journal, and there was no journal when
 * this transaction was signed. So the record has to be put back by hand, once.
 *
 * "By hand" means the HASH is hardcoded and nothing else is. The amounts, the payees, the
 * fee and the timestamp are all read off the chain through the same decoder the live path
 * uses (`tx/sprayReceipt.ts`), so this cannot disagree with a receipt produced any other
 * way, and a transcription slip in a figure is not possible.
 *
 * ── Why it is safe to leave in ──────────────────────────────────────────────────
 * Three separate reasons it cannot duplicate or corrupt anything:
 *
 *   · `appendSend` is idempotent on transaction hash;
 *   · the flag below stops it re-running once every listed hash is accounted for;
 *   · a listed hash whose receipt does not decode as a spray is skipped, not invented.
 *
 * And it is deliberately NOT retried forever: the flag is set once every hash is either
 * recorded or already present. A network failure leaves the flag unset so the next launch
 * tries again — the one thing worse than a missing receipt is a missing receipt that
 * silently stops being looked for.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hash } from 'viem';

import { loadContacts } from '../contacts/storage';
import { publicClient } from '../contracts/publicClient';
import type { SprayMode } from '../tx/gasPreflight';
import { buildSendRecordFromReceipt } from '../tx/sprayReceipt';
import { appendSend, loadHistory, newSendId } from './storage';
import type { SendRecord } from './types';

const DONE_KEY = 'spraay.history.backfill.v1';

const tag = (msg: string) => `[history-backfill] ${msg}`;

interface BackfillEntry {
  hash: Hash;
  /** Which call was made, so the recovered record says `sprayEqual` rather than guessing. */
  mode: SprayMode;
  /** Only for the log — the figures come from the chain. */
  note: string;
}

/**
 * Payments known to have happened without being recorded.
 *
 * Adding to this list is how a future lost receipt gets repaired; bump `DONE_KEY` when
 * you do, or devices that already ran the previous list will skip the new entry.
 */
const MISSED_PAYMENTS: BackfillEntry[] = [
  {
    hash: '0xcb617e8849167603ea793806da5447bfe70c22ca75e8a45d54a15ac08bceb615',
    mode: 'equal',
    note: 'dust test run 1 (sprayEqual, 3 recipients) — succeeded on chain, undetected by the app',
  },
];

/**
 * Returns the records this run put back, so the caller can refresh whatever is showing
 * history. Never throws: a repair that breaks the launch it runs on is not a repair.
 */
export async function runHistoryBackfill(): Promise<SendRecord[]> {
  if (MISSED_PAYMENTS.length === 0) return [];

  try {
    if (await AsyncStorage.getItem(DONE_KEY)) return [];
  } catch {
    /** Cannot read the flag — proceed. `appendSend` makes a repeat run harmless. */
  }

  let history: SendRecord[];
  try {
    history = await loadHistory();
  } catch {
    return [];
  }
  const seen = new Set(history.map((r) => r.hash.toLowerCase()));

  const contacts = await loadContacts().catch(() => []);
  const nameFor = (address: Address): string | undefined =>
    contacts.find((c) => c.address.toLowerCase() === address.toLowerCase())?.name;

  const added: SendRecord[] = [];
  let allAccountedFor = true;

  for (const entry of MISSED_PAYMENTS) {
    if (seen.has(entry.hash.toLowerCase())) continue;

    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: entry.hash });

      const record = buildSendRecordFromReceipt({
        receipt,
        id: newSendId(),
        nameFor,
        mode: entry.mode,
      });

      if (!record) {
        /**
         * On chain but not readable as a spray. Nothing honest to write, and retrying
         * will not change the answer — treat it as settled so this stops asking.
         */
        console.warn(tag(`${entry.hash} does not decode as a spray — skipping`));
        continue;
      }

      await appendSend(record);
      added.push(record);
      console.log(tag(`restored ${entry.note}`));
    } catch (err) {
      /** Almost always the RPC. Leave the flag unset so the next launch tries again. */
      const e = err as { message?: string };
      console.warn(tag(`could not read ${entry.hash}: ${e?.message ?? String(err)}`));
      allAccountedFor = false;
    }
  }

  if (allAccountedFor) {
    try {
      await AsyncStorage.setItem(DONE_KEY, new Date().toISOString());
    } catch {
      /** Unflagged is fine — the next run finds the records already in history. */
    }
  }

  return added;
}
