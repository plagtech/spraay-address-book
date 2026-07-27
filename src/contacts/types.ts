/**
 * Contact model — spec §3.1.
 *
 * Contacts live ON DEVICE ONLY (spec §2): no cloud sync, no accounts, no analytics SDK
 * that sees an address. That is both a privacy selling point and what keeps the Play
 * data-safety form trivial, so nothing in this module may grow a network call.
 */
import type { Address } from 'viem';

import type { LabelKey } from '../theme';

export interface Contact {
  id: string;
  name: string;
  address: Address;
  label: LabelKey;
  /** Epoch ms, used only for stable ordering of same-named contacts. */
  createdAt: number;
}

/** What the Add Contact form produces, before an id and timestamp are assigned. */
export interface ContactDraft {
  name: string;
  address: Address;
  label: LabelKey;
}
