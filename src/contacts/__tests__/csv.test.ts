import { toCsv, type CsvContact } from '../csv';

const A = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/** Minimal RFC 4180 reader, so the assertions test parseability rather than a string. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

describe('toCsv', () => {
  it('writes a header and one row per contact', () => {
    const csv = toCsv([{ name: 'Ada', address: A, label: 'team' }]);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['name', 'address', 'label']);
    expect(rows[1]).toEqual(['Ada', A, 'team']);
  });

  it('sorts by name', () => {
    const csv = toCsv([
      { name: 'Zoe', address: A, label: 'team' },
      { name: 'Ada', address: A, label: 'family' },
    ]);
    expect(parseCsv(csv).slice(1).map((r) => r[0])).toEqual(['Ada', 'Zoe']);
  });

  it('does not mutate its input', () => {
    const contacts: CsvContact[] = [
      { name: 'Zoe', address: A, label: 'team' },
      { name: 'Ada', address: A, label: 'family' },
    ];
    toCsv(contacts);
    expect(contacts.map((c) => c.name)).toEqual(['Zoe', 'Ada']);
  });

  /**
   * Contact names are user input, so all three of these happen. Any of them shifting a
   * column would corrupt the export silently.
   */
  it.each([
    ['a comma', 'Ada, Countess'],
    ['a quote', 'O"Brien'],
    ['a newline', 'Line\nBreak'],
    ['a separator run', 'a,,b'],
  ])('keeps columns intact when a name contains %s', (_label, name) => {
    const csv = toCsv([{ name, address: A, label: 'friend' }]);
    const rows = parseCsv(csv);
    expect(rows.every((r) => r.length === 3)).toBe(true);
    expect(rows[1]).toEqual([name, A, 'friend']);
  });

  it('emits only a header for an empty book', () => {
    expect(toCsv([])).toBe('name,address,label');
  });
});
