/**
 * On-device send history, mirroring the contact store's approach.
 *
 * ── The bigint problem ────────────────────────────────────────────────────────────
 * `JSON.stringify` THROWS on a bigint rather than coercing it, and amounts here are
 * bigints in base units. So records are serialised through an explicit wire shape where
 * every amount is a decimal string, and parsed back with the same care the contact store
 * uses. Nothing round-trips through `Number` — that is the whole reason amounts are
 * bigints in the first place.
 *
 * Reads re-validate everything. A record with a broken hash or amount is DROPPED, not
 * repaired: a receipt that misstates what was sent is worse than a missing one.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAddress, isAddress, type Address, type Hash } from 'viem';

import type { SprayMode } from '../tx/gasPreflight';
import type { SendRecipientRecord, SendRecord } from './types';

const STORAGE_KEY = 'spraay.history.v1';

/** Keeps the store bounded; a phone does not need an unbounded payment log. */
const MAX_RECORDS = 500;

/* ── wire shape ─────────────────────────────────────────────────────────────── */

interface WireRecipient {
  address: string;
  name?: string;
  amount: string;
}

interface WireRecord {
  id: string;
  hash: string;
  sentAt: number;
  mode: string;
  recipients: WireRecipient[];
  recipientCount: number;
  total: string;
  fee: string;
  token: string;
  decimals: number;
}

function toWire(record: SendRecord): WireRecord {
  return {
    id: record.id,
    hash: record.hash,
    sentAt: record.sentAt,
    mode: record.mode,
    recipients: record.recipients.map((r) => ({
      address: r.address,
      ...(r.name ? { name: r.name } : {}),
      amount: r.amount.toString(),
    })),
    recipientCount: record.recipientCount,
    total: record.total.toString(),
    fee: record.fee.toString(),
    token: record.token,
    decimals: record.decimals,
  };
}

/** Base-unit integer string → bigint. Rejects anything else. */
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

function toRecord(raw: unknown): SendRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : undefined;
  const hash = typeof r.hash === 'string' ? r.hash : undefined;
  /** A receipt without a usable transaction hash cannot be linked or trusted. */
  if (!id || !hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return undefined;

  const total = toAmount(r.total);
  const fee = toAmount(r.fee);
  if (total === undefined || fee === undefined) return undefined;

  const recipientsRaw = Array.isArray(r.recipients) ? r.recipients : [];
  const recipients = recipientsRaw
    .map(toRecipient)
    .filter((x): x is SendRecipientRecord => x !== undefined);

  /**
   * If any recipient row failed to parse, the per-person breakdown would silently
   * understate the payment. Drop the record rather than show an incomplete receipt.
   */
  if (recipients.length !== recipientsRaw.length) return undefined;

  const mode: SprayMode = r.mode === 'custom' ? 'custom' : 'equal';

  const sentAt =
    typeof r.sentAt === 'number' && Number.isFinite(r.sentAt) ? r.sentAt : 0;

  const recipientCount =
    typeof r.recipientCount === 'number' && Number.isFinite(r.recipientCount)
      ? r.recipientCount
      : recipients.length;

  const decimals =
    typeof r.decimals === 'number' && Number.isFinite(r.decimals) ? r.decimals : 6;

  const token = typeof r.token === 'string' && r.token.length > 0 ? r.token : 'USDC';

  return {
    id,
    hash: hash as Hash,
    sentAt,
    mode,
    recipients,
    recipientCount,
    total,
    fee,
    token,
    decimals,
  };
}

/* ── public API ─────────────────────────────────────────────────────────────── */

/** Newest first — the order every screen wants. */
export async function loadHistory(): Promise<SendRecord[]> {
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
    .map(toRecord)
    .filter((r): r is SendRecord => r !== undefined)
    .sort((a, b) => b.sentAt - a.sentAt);
}

export async function saveHistory(records: SendRecord[]): Promise<void> {
  const bounded = [...records].sort((a, b) => b.sentAt - a.sentAt).slice(0, MAX_RECORDS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bounded.map(toWire)));
}

/**
 * Append one confirmed send. Idempotent on transaction hash, because the Success screen
 * can re-mount and a payment must never appear twice in its own history.
 *
 * Returns the full list so callers can update their cache without a second read.
 */
export async function appendSend(record: SendRecord): Promise<SendRecord[]> {
  const current = await loadHistory();
  if (current.some((r) => r.hash.toLowerCase() === record.hash.toLowerCase())) {
    return current;
  }
  const next = [record, ...current];
  await saveHistory(next);
  return next.sort((a, b) => b.sentAt - a.sentAt).slice(0, MAX_RECORDS);
}

export function newSendId(): string {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `s_${Date.now().toString(36)}_${hex}`;
}

export type { Address };
