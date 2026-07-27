import { findDuplicateAddresses, parseImportedList } from '../importList';
import type { Address } from 'viem';

const USDC = 6;
const A = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const B = '0x4200000000000000000000000000000000000006' as Address;

describe('parseImportedList', () => {
  it('accepts all three documented line shapes', () => {
    const { rows, errors } = parseImportedList(
      [A, `Ada,${B}`, `Grace,${B},25`].join('\n'),
      USDC,
    );

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);

    // Exact equality: optional fields are omitted, not set to undefined.
    expect(rows[0]).toEqual({ line: 1, address: A });
    expect(rows[1]).toEqual({ line: 2, address: B, name: 'Ada' });
    expect(rows[2]).toEqual({ line: 3, address: B, name: 'Grace', amount: 25_000_000n });
  });

  it('accepts comma, semicolon and tab separators', () => {
    const { rows } = parseImportedList(
      [`Ada,${A},1`, `Bo;${A};2`, `Cy\t${A}\t3`].join('\n'),
      USDC,
    );
    expect(rows.map((r) => r.name)).toEqual(['Ada', 'Bo', 'Cy']);
    expect(rows.map((r) => r.amount)).toEqual([1_000_000n, 2_000_000n, 3_000_000n]);
  });

  it('skips blank lines without reporting them', () => {
    const { rows, errors } = parseImportedList(`\n\n${A}\n   \n`, USDC);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  /**
   * The important behaviour: a bad row is REPORTED, never silently dropped. A skipped
   * line in a pasted payroll means someone goes unpaid and nobody notices.
   */
  it('reports bad lines instead of skipping them', () => {
    const { rows, errors } = parseImportedList(
      [A, 'Mallory,0xnotanaddress', `Eve,${B},5.1234567`, 'a,b,c,d'].join('\n'),
      USDC,
    );

    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errors[0]?.reason).toMatch(/valid address/);
    expect(errors[1]?.reason).toMatch(/at most 6 decimal places/);
    expect(errors[2]?.reason).toMatch(/Too many columns/);
  });

  it('reports 1-based line numbers matching what the user pasted', () => {
    const { errors } = parseImportedList(`${A}\n\nbad-line`, USDC);
    expect(errors[0]?.line).toBe(3);
  });

  it('checksums addresses so downstream comparisons agree', () => {
    const { rows } = parseImportedList(A.toLowerCase(), USDC);
    expect(rows[0]?.address).toBe(A);
  });

  /**
   * Position, not sniffing, decides which field is the address — so a name that looks
   * hex-ish cannot be mistaken for a destination.
   */
  it('takes the address from its column, not by guessing', () => {
    const { rows, errors } = parseImportedList(`0xdeadbeef,${A}`, USDC);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({ name: '0xdeadbeef', address: A });
  });

  it('rejects a row whose amount is zero', () => {
    const { rows, errors } = parseImportedList(`Ada,${A},0`, USDC);
    expect(rows).toHaveLength(0);
    expect(errors[0]?.reason).toMatch(/more than zero/);
  });
});

describe('findDuplicateAddresses', () => {
  it('finds addresses appearing more than once, case-insensitively', () => {
    expect(findDuplicateAddresses([A, B, A])).toEqual([A]);
    expect(findDuplicateAddresses([A, B, A.toLowerCase() as Address])).toEqual([A]);
  });

  it('returns each duplicated address once', () => {
    expect(findDuplicateAddresses([A, A, A])).toEqual([A]);
  });

  it('returns nothing when every address is unique', () => {
    expect(findDuplicateAddresses([A, B])).toEqual([]);
    expect(findDuplicateAddresses([])).toEqual([]);
  });
});
