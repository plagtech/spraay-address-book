/**
 * Contact export formatting (spec §3.6).
 *
 * Separate from the Settings screen so it can be tested without rendering React, and so
 * the escaping rules live somewhere they can be reasoned about on their own.
 */

/** The columns a person would want back if they re-import elsewhere. */
export interface CsvContact {
  name: string;
  address: string;
  label: string;
}

/**
 * RFC 4180 style: every field quoted, inner quotes doubled. Quoting unconditionally
 * rather than only when needed means a name containing a comma, a quote or a newline
 * cannot shift the columns — and contact names are user input, so all three happen.
 */
export function toCsv(contacts: readonly CsvContact[]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = 'name,address,label';
  const rows = [...contacts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => [escape(c.name), escape(c.address), escape(c.label)].join(','));
  return [header, ...rows].join('\n');
}
