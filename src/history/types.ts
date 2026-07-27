/**
 * Send history model.
 *
 * Like contacts, history lives ON DEVICE ONLY (spec §2) — no cloud sync, nothing that
 * sees an address leaves the phone.
 *
 * A record is written only after `SprayTokenExecuted` was decoded from the receipt, so
 * everything here describes a payment that provably happened. There are deliberately no
 * pending or failed states: a history that can show "maybe sent" is worse than one that
 * only shows what did.
 */
import type { Address, Hash } from 'viem';

import type { SprayMode } from '../tx/gasPreflight';

export interface SendRecipientRecord {
  address: Address;
  /** Name copied from the book AT SEND TIME, so the receipt reflects what the user saw. */
  name?: string;
  /** Base units. */
  amount: bigint;
}

export interface SendRecord {
  id: string;
  hash: Hash;
  /** Epoch ms when the record was written, i.e. when the receipt confirmed. */
  sentAt: number;
  mode: SprayMode;
  recipients: SendRecipientRecord[];
  /** From the contract event, which is authoritative over the local list length. */
  recipientCount: number;
  /** Total and fee as the CONTRACT reported them, in base units. */
  total: bigint;
  fee: bigint;
  /** Token symbol, so history stays readable if the app later sends more than USDC. */
  token: string;
  /** Decimals at send time — never re-derive from today's config for an old record. */
  decimals: number;
}
