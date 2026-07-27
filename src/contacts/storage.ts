/**
 * On-device contact storage (spec §2: "Contacts stored on-device only").
 *
 * AsyncStorage rather than SQLite: the data is a small flat list, and avoiding a native
 * module keeps the dependency surface — and the Play data-safety story — smaller.
 *
 * Everything read back is re-validated. Stored JSON can be corrupt, truncated by a kill
 * mid-write, or written by an older build, and a bad address silently surviving into a
 * payment screen is the failure this guards against. Bad entries are DROPPED rather than
 * repaired: a half-recovered address is worse than a missing contact.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAddress, isAddress } from 'viem';

import { LABEL_KEYS, type LabelKey } from '../theme';
import type { Contact } from './types';

/** Versioned so a future shape change can migrate instead of guessing. */
const STORAGE_KEY = 'spraay.contacts.v1';

export async function loadContacts(): Promise<Contact[]> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    /** Storage unavailable — an empty book is better than a crash on cold start. */
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

  return parsed.map(toContact).filter((c): c is Contact => c !== undefined);
}

export async function saveContacts(contacts: Contact[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

/** Narrow one stored record, or reject it entirely. */
function toContact(raw: unknown): Contact | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : undefined;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const address = typeof r.address === 'string' ? r.address : undefined;

  if (!id || name.length === 0 || !address || !isAddress(address)) return undefined;

  const label: LabelKey =
    typeof r.label === 'string' && (LABEL_KEYS as string[]).includes(r.label)
      ? (r.label as LabelKey)
      : 'friend';

  const createdAt = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt)
    ? r.createdAt
    : 0;

  return { id, name, address: getAddress(address), label, createdAt };
}

/**
 * Collision-resistant enough for a local list. `react-native-get-random-values` is
 * already installed for WalletConnect, so real randomness is available.
 */
export function newContactId(): string {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    /** Fallback keeps the app usable if the polyfill ever fails to install. */
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `c_${Date.now().toString(36)}_${hex}`;
}
