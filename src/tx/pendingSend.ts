/**
 * The journal of sends that have been handed to a wallet and not yet accounted for.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────
 * `history/` deliberately records only payments that provably happened, and it can only
 * do that from a receipt this app managed to read. The dust test showed what that costs:
 * the transaction mined, all three transfers and the fee landed, and the app knew none of
 * it — so the payment existed on Base and nowhere in the product.
 *
 * Everything between "the user tapped Send" and "we read a receipt" runs through a chain
 * of promises that a backgrounded app can lose at three separate points:
 *
 *   1. the wallet's answer to `eth_sendTransaction`, which comes back over a relay socket
 *      the OS is free to drop while we are not on screen — lose it and we never even
 *      learn the HASH of a transaction the wallet has already broadcast;
 *   2. `waitForTransactionReceipt`, which gives up after viem's 180s default
 *      (waitForTransactionReceipt.js:53) — plenty of time to elapse while the user reads
 *      a confirmation screen in MetaMask;
 *   3. the process itself, if Android reclaims it while we are in the background.
 *
 * A hash written to disk covers (2) and (3). It does not cover (1), which is why an entry
 * is written BEFORE the wallet is asked and carries enough of the batch — sender, token,
 * expected total, recipient count, a block floor — to find the transaction on chain by its
 * `SprayTokenExecuted` event when the hash never came back. See `reconcile.ts`.
 *
 * ── This journal is not history ─────────────────────────────────────────────────
 * Nothing here is ever shown as a payment. An entry is a QUESTION for the chain, and it
 * lives only until the chain answers it. The answer becomes a `SendRecord`; the entry is
 * dropped. `history/types.ts` still means what it says — no pending, no maybe-sent.
 *
 * Bigints are serialised as decimal strings and re-validated on read, exactly as
 * `history/storage.ts` does, and for the same reason: `JSON.stringify` throws on a bigint,
 * and an amount that round-tripped through `Number` is not an amount any more.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAddress, isAddress, type Address, type Hash } from 'viem';

import type { SendRecipientRecord } from '../history/types';
import type { SprayMode } from './gasPreflight';

const STORAGE_KEY = 'spraay.pending-sends.v1';

/**
 * A phone has one wallet and signs one payment at a time, so this should never hold more
 * than one entry. The cap is a backstop against a bug leaking entries, not a design.
 */
const MAX_ENTRIES = 8;

/**
 * How long an unanswered entry is worth asking about. A transaction that has not been
 * mined a day after it was signed is not coming: Base blocks every ~2s, and a mempool
 * does not hold a transaction that long.
 */
export const PENDING_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface PendingSend {
  id: string;
  /** The account that signed. Matched against the event's indexed `sender`. */
  sender: Address;
  token: Address;
  tokenSymbol: string;
  decimals: number;
  mode: SprayMode;
  /** Carries the contact names captured at send time, so a recovered receipt reads right. */
  recipients: SendRecipientRecord[];
  /**
   * Sum of the recipient amounts BEFORE the fee — which is what `SprayTokenExecuted`
   * reports as `totalAmount`. Not the approved total cost.
   */
  expectedTotal: bigint;
  /**
   * Chain height just before the wallet was asked. The lower bound for a log scan, so
   * recovery reads a handful of blocks instead of a day of them. Absent when that read
   * failed — never a reason to skip writing the entry.
   */
  fromBlock?: bigint;
  /** Filled the moment the wallet answers. Absent means the answer was lost. */
  hash?: Hash;
  createdAt: number;
}

/* ── wire shape ─────────────────────────────────────────────────────────────── */

interface WireRecipient {
  address: string;
  name?: string;
  amount: string;
}

interface WirePending {
  id: string;
  sender: string;
  token: string;
  tokenSymbol: string;
  decimals: number;
  mode: string;
  recipients: WireRecipient[];
  expectedTotal: string;
  fromBlock?: string;
  hash?: string;
  createdAt: number;
}

function toWire(entry: PendingSend): WirePending {
  return {
    id: entry.id,
    sender: entry.sender,
    token: entry.token,
    tokenSymbol: entry.tokenSymbol,
    decimals: entry.decimals,
    mode: entry.mode,
    recipients: entry.recipients.map((r) => ({
      address: r.address,
      ...(r.name ? { name: r.name } : {}),
      amount: r.amount.toString(),
    })),
    expectedTotal: entry.expectedTotal.toString(),
    ...(entry.fromBlock !== undefined ? { fromBlock: entry.fromBlock.toString() } : {}),
    ...(entry.hash ? { hash: entry.hash } : {}),
    createdAt: entry.createdAt,
  };
}

function toAmount(raw: unknown): bigint | undefined {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return undefined;
  try {
    return BigInt(raw);
  } catch {
    return undefined;
  }
}

function toRecipient(raw: unknown): SendRecipientRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;

  const address = typeof r.address === 'string' ? r.address : undefined;
  if (!address || !isAddress(address)) return undefined;

  const amount = toAmount(r.amount);
  if (amount === undefined) return undefined;

  const name = typeof r.name === 'string' && r.name.trim().length > 0 ? r.name : undefined;
  return { address: getAddress(address), ...(name ? { name } : {}), amount };
}

/**
 * Anything that fails to parse is DROPPED rather than repaired — the same rule history
 * uses. A half-read entry would send the reconciler looking for the wrong transaction,
 * and matching the wrong transaction is worse than matching none.
 */
function toEntry(raw: unknown): PendingSend | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : undefined;
  if (!id) return undefined;

  const sender = typeof r.sender === 'string' ? r.sender : undefined;
  const token = typeof r.token === 'string' ? r.token : undefined;
  if (!sender || !isAddress(sender) || !token || !isAddress(token)) return undefined;

  const expectedTotal = toAmount(r.expectedTotal);
  if (expectedTotal === undefined) return undefined;

  const recipientsRaw = Array.isArray(r.recipients) ? r.recipients : [];
  const recipients = recipientsRaw
    .map(toRecipient)
    .filter((x): x is SendRecipientRecord => x !== undefined);
  if (recipients.length !== recipientsRaw.length) return undefined;

  const hash =
    typeof r.hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(r.hash)
      ? (r.hash as Hash)
      : undefined;

  const fromBlock = toAmount(r.fromBlock);

  return {
    id,
    sender: getAddress(sender),
    token: getAddress(token),
    tokenSymbol: typeof r.tokenSymbol === 'string' && r.tokenSymbol ? r.tokenSymbol : 'USDC',
    decimals: typeof r.decimals === 'number' && Number.isFinite(r.decimals) ? r.decimals : 6,
    mode: r.mode === 'custom' ? ('custom' as SprayMode) : ('equal' as SprayMode),
    recipients,
    expectedTotal,
    ...(fromBlock !== undefined ? { fromBlock } : {}),
    ...(hash ? { hash } : {}),
    createdAt:
      typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : 0,
  };
}

/* ── public API ─────────────────────────────────────────────────────────────── */

/** Oldest first — recovery should settle the longest-outstanding question first. */
export async function loadPendingSends(): Promise<PendingSend[]> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(toEntry)
    .filter((e): e is PendingSend => e !== undefined)
    .sort((a, b) => a.createdAt - b.createdAt);
}

async function writeAll(entries: PendingSend[]): Promise<void> {
  const bounded = [...entries]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_ENTRIES);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bounded.map(toWire)));
}

/**
 * Record the intent to send, before the wallet is asked.
 *
 * Throwing here would abort a payment that has not been attempted yet, which is the safe
 * direction — but a phone whose AsyncStorage is failing should still be able to pay, so
 * a write failure is swallowed and the caller proceeds without the safety net rather than
 * without the payment.
 */
export async function addPendingSend(entry: PendingSend): Promise<void> {
  try {
    const current = await loadPendingSends();
    await writeAll([...current.filter((e) => e.id !== entry.id), entry]);
  } catch {
    /* Best effort. The send is more important than the journal. */
  }
}

/** Attach the hash the moment the wallet answers, narrowing recovery to one lookup. */
export async function attachPendingHash(id: string, hash: Hash): Promise<void> {
  try {
    const current = await loadPendingSends();
    const next = current.map((e) => (e.id === id ? { ...e, hash } : e));
    await writeAll(next);
  } catch {
    /* Best effort — the log scan still finds it without the hash. */
  }
}

/** Called once the payment is in history, proven reverted, or too old to chase. */
export async function dropPendingSend(id: string): Promise<void> {
  try {
    const current = await loadPendingSends();
    await writeAll(current.filter((e) => e.id !== id));
  } catch {
    /* Best effort. A stranded entry expires on its own. */
  }
}

export function newPendingId(): string {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `p_${Date.now().toString(36)}_${hex}`;
}
