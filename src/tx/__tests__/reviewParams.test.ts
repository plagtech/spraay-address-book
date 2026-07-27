import { parseReviewParams, toReviewParams } from '../reviewParams';
import type { Address } from 'viem';

const A = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const B = '0x4200000000000000000000000000000000000006' as Address;

const parsed = (raw: Parameters<typeof parseReviewParams>[0]) => {
  const r = parseReviewParams(raw);
  if (!r.ok) throw new Error(`expected parse to succeed, got: ${r.reason}`);
  return r.value;
};

const failure = (raw: Parameters<typeof parseReviewParams>[0]) => {
  const r = parseReviewParams(raw);
  if (r.ok) throw new Error('expected parse to fail');
  return r.reason;
};

describe('parseReviewParams', () => {
  it('parses an equal-mode batch', () => {
    expect(
      parsed({ mode: 'equal', recipients: `${A},${B}`, amountPerRecipient: '5000000' }),
    ).toMatchObject({ mode: 'equal', recipients: [A, B], amountPerRecipient: 5_000_000n });
  });

  it('parses a custom-mode batch', () => {
    expect(
      parsed({ mode: 'custom', recipients: `${A},${B}`, amounts: '5000000,7500000' }),
    ).toMatchObject({ mode: 'custom', amounts: [5_000_000n, 7_500_000n] });
  });

  it('defaults to equal mode when none is given', () => {
    expect(parsed({ recipients: A, amountPerRecipient: '1' }).mode).toBe('equal');
  });

  it('tolerates whitespace and duplicated params', () => {
    expect(
      parsed({
        mode: ['equal', 'custom'],
        recipients: ` ${A} , ${B} `,
        amountPerRecipient: ['1000000'],
      }),
    ).toMatchObject({ mode: 'equal', recipients: [A, B] });
  });

  it('checksums addresses', () => {
    expect(parsed({ recipients: A.toLowerCase(), amountPerRecipient: '1' }).recipients)
      .toEqual([A]);
  });

  it('rejects a recipient/amount count mismatch', () => {
    expect(
      failure({ mode: 'custom', recipients: `${A},${B}`, amounts: '5000000' }),
    ).toMatch(/2 people but 1 amounts/);
  });

  it('rejects invalid addresses', () => {
    expect(failure({ recipients: '0xnope', amountPerRecipient: '1' })).toMatch(
      /not a valid address/,
    );
  });

  it('rejects an empty recipient list', () => {
    expect(failure({ recipients: '', amountPerRecipient: '1' })).toMatch(/No recipients/);
  });

  it('rejects an unknown mode rather than guessing', () => {
    expect(failure({ mode: 'sideways', recipients: A, amountPerRecipient: '1' })).toMatch(
      /Unknown send mode/,
    );
  });

  /**
   * Amounts cross this boundary in base units, so anything that is not a plain integer
   * string is a bug upstream and must not be coerced into a payment.
   */
  it('rejects non-integer amounts', () => {
    for (const bad of ['5.25', '-5', '5e6', 'abc', '0']) {
      expect(failure({ recipients: A, amountPerRecipient: bad })).toBeTruthy();
    }
  });
});

describe('unverified flag', () => {
  it('round-trips when set', () => {
    const params = toReviewParams({
      mode: 'equal',
      recipients: [A],
      amountPerRecipient: 5_000_000n,
      unverified: true,
    });
    expect(params.unverified).toBe('1');
    expect(parsed(params).unverified).toBe(true);
  });

  it('is omitted from params when false', () => {
    const params = toReviewParams({
      mode: 'equal',
      recipients: [A],
      amountPerRecipient: 5_000_000n,
      unverified: false,
    });
    expect(params).not.toHaveProperty('unverified');
    expect(parsed(params).unverified).toBe(false);
  });

  it('only accepts the literal "1", so junk cannot fabricate it', () => {
    expect(
      parsed({ recipients: A, amountPerRecipient: '1', unverified: 'yes' }).unverified,
    ).toBe(false);
  });
});

describe('toReviewParams', () => {
  it('survives a full round trip in custom mode', () => {
    const original = {
      mode: 'custom' as const,
      recipients: [A, B],
      amounts: [5_000_000n, 7_500_000n],
    };
    expect(parsed(toReviewParams(original))).toMatchObject(original);
  });
});
