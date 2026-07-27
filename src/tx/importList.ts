/**
 * `📄 Import list` paste parsing — spec §3.3.
 *
 * Accepts, one per line:
 *   0xabc…                     address only
 *   Ada,0xabc…                 name + address
 *   Ada,0xabc…,25              name + address + amount
 * Fields may be separated by comma, tab, or semicolon.
 *
 * Bad lines are REPORTED, never skipped. Silently dropping a row from a pasted payroll
 * means someone doesn't get paid and nobody notices until they say so.
 */
import { getAddress, isAddress, type Address } from 'viem';

import { parseTokenAmount } from './amounts';

export interface ImportedRow {
  /** 1-based line number in the pasted text, for error messages. */
  line: number;
  name?: string;
  address: Address;
  /** Base units. Present only when the line carried a third field. */
  amount?: bigint;
}

export interface ImportError {
  line: number;
  text: string;
  reason: string;
}

export interface ImportResult {
  rows: ImportedRow[];
  errors: ImportError[];
}

const SEPARATORS = /[,;\t]/;

export function parseImportedList(input: string, decimals: number): ImportResult {
  const rows: ImportedRow[] = [];
  const errors: ImportError[] = [];

  const lines = input.split(/\r?\n/);

  lines.forEach((rawLine, i) => {
    const line = i + 1;
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) return;

    const fields = trimmed
      .split(SEPARATORS)
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    if (fields.length === 0) return;

    if (fields.length > 3) {
      errors.push({
        line,
        text: trimmed,
        reason: 'Too many columns — expected name, address, amount.',
      });
      return;
    }

    /**
     * One field is an address. Two or three is name-first. Finding the address by
     * position rather than by sniffing keeps a name that happens to look hex-ish from
     * being mistaken for a destination.
     */
    const addressField = fields.length === 1 ? fields[0] : fields[1];
    const nameField = fields.length === 1 ? undefined : fields[0];
    const amountField = fields.length === 3 ? fields[2] : undefined;

    if (!addressField || !isAddress(addressField)) {
      errors.push({
        line,
        text: trimmed,
        reason: addressField
          ? `"${addressField}" isn't a valid address.`
          : 'No address on this line.',
      });
      return;
    }

    const row: ImportedRow = { line, address: getAddress(addressField) };
    if (nameField) row.name = nameField;

    if (amountField !== undefined) {
      const parsed = parseTokenAmount(amountField, decimals);
      if (!parsed.ok) {
        errors.push({ line, text: trimmed, reason: parsed.reason });
        return;
      }
      row.amount = parsed.value;
    }

    rows.push(row);
  });

  return { rows, errors };
}

/**
 * Flag addresses that appear more than once. Not an error — paying the same person
 * twice in one batch is legitimate — but worth surfacing, since it is usually a
 * copy-paste slip.
 */
export function findDuplicateAddresses(addresses: Address[]): Address[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const a of addresses) {
    const key = a.toLowerCase();
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return addresses.filter((a) => dupes.has(a.toLowerCase()) && dupes.delete(a.toLowerCase()));
}
