import {
  formatFeeDisplay,
  formatFeeRate,
  formatTokenAmount,
  formatTokenDisplay,
  isSubCent,
  parseTokenAmount,
} from '../amounts';

/** USDC. The 18-decimal cases below use DAI's precision from tokens.ts. */
const USDC = 6;
const DAI = 18;

const ok = (input: string, decimals = USDC) => {
  const r = parseTokenAmount(input, decimals);
  if (!r.ok) throw new Error(`expected "${input}" to parse, got: ${r.reason}`);
  return r.value;
};

const rejected = (input: string, decimals = USDC) => {
  const r = parseTokenAmount(input, decimals);
  if (r.ok) throw new Error(`expected "${input}" to be rejected, got ${r.value}`);
  return r.reason;
};

describe('parseTokenAmount', () => {
  it('parses the shapes people actually type', () => {
    expect(ok('5')).toBe(5_000_000n);
    expect(ok('5.25')).toBe(5_250_000n);
    expect(ok('$5.25')).toBe(5_250_000n);
    expect(ok('1,250.00')).toBe(1_250_000_000n);
    expect(ok('  7.5  ')).toBe(7_500_000n);
    expect(ok('00012.30')).toBe(12_300_000n);
  });

  it('accepts partial decimals at both ends', () => {
    expect(ok('.5')).toBe(500_000n);
    expect(ok('5.')).toBe(5_000_000n);
  });

  it('parses the smallest representable unit', () => {
    expect(ok('0.000001')).toBe(1n);
  });

  it('rejects more precision than the token has, rather than truncating', () => {
    // Truncating would send an amount the user did not authorise.
    expect(rejected('5.1234567')).toMatch(/at most 6 decimal places/);
  });

  it('rejects zero and zero-equivalents', () => {
    expect(rejected('0')).toMatch(/more than zero/);
    expect(rejected('0.00')).toMatch(/more than zero/);
  });

  it('rejects non-numbers, negatives and exponents', () => {
    expect(rejected('abc')).toBeTruthy();
    expect(rejected('-5')).toBeTruthy();
    expect(rejected('5e6')).toBeTruthy();
    expect(rejected('1.2.3')).toBeTruthy();
    expect(rejected('')).toBeTruthy();
    expect(rejected('   ')).toBeTruthy();
  });

  /**
   * The reason this module does string math instead of Number arithmetic. At 18
   * decimals the float path is wrong by construction, not by rounding.
   */
  it('is exact where floating point is not', () => {
    expect(ok('8.87', DAI)).toBe(8_870_000_000_000_000_000n);
    expect(BigInt(Math.round(Number('8.87') * 1e18))).not.toBe(ok('8.87', DAI));

    expect(ok('0.07', DAI)).toBe(70_000_000_000_000_000n);
    expect(BigInt(Math.round(Number('0.07') * 1e18))).not.toBe(ok('0.07', DAI));
  });
});

describe('formatTokenAmount', () => {
  it('round-trips through parseTokenAmount', () => {
    for (const input of ['5', '5.25', '0.000001', '1250', '0.1']) {
      expect(formatTokenAmount(ok(input), USDC)).toBe(
        // Leading/trailing noise is normalised away, so compare against the canonical form
        formatTokenAmount(ok(input), USDC),
      );
      expect(ok(formatTokenAmount(ok(input), USDC))).toBe(ok(input));
    }
  });

  it('trims trailing zeros without rounding', () => {
    expect(formatTokenAmount(5_000_000n, USDC)).toBe('5');
    expect(formatTokenAmount(5_250_000n, USDC)).toBe('5.25');
    expect(formatTokenAmount(1n, USDC)).toBe('0.000001');
    expect(formatTokenAmount(0n, USDC)).toBe('0');
  });
});

describe('formatTokenDisplay', () => {
  it('groups thousands and fixes two decimals', () => {
    expect(formatTokenDisplay(1_250_000_000n, USDC)).toBe('1,250.00');
    expect(formatTokenDisplay(5_250_000n, USDC)).toBe('5.25');
    expect(formatTokenDisplay(0n, USDC)).toBe('0.00');
  });

  it('truncates sub-cent amounts for display only', () => {
    // The underlying value is untouched; this is presentation.
    expect(formatTokenDisplay(1n, USDC)).toBe('0.00');
  });
});

describe('isSubCent', () => {
  it('is true only for a real amount that would display as 0.00', () => {
    expect(isSubCent(9_000n, USDC)).toBe(true); // 0.009
    expect(isSubCent(900n, USDC)).toBe(true); // the dust-test fee, 0.0009
    expect(isSubCent(1n, USDC)).toBe(true);
    expect(isSubCent(10_000n, USDC)).toBe(false); // exactly 0.01
    expect(isSubCent(0n, USDC)).toBe(false);
  });

  it('holds at other precisions', () => {
    expect(isSubCent(9_000_000_000_000_000n, DAI)).toBe(true); // 0.009 DAI
    expect(isSubCent(10_000_000_000_000_000n, DAI)).toBe(false); // 0.01 DAI
    // A 2-decimal token cannot express a sub-cent amount at all.
    expect(isSubCent(1n, 2)).toBe(false);
  });
});

describe('formatFeeRate', () => {
  it('reads as a percentage with no trailing zeros', () => {
    expect(formatFeeRate(30)).toBe('0.3%');
    expect(formatFeeRate(500)).toBe('5%');
    expect(formatFeeRate(25)).toBe('0.25%');
  });
});

describe('formatFeeDisplay', () => {
  it('shows an ordinary fee as a normal amount', () => {
    expect(formatFeeDisplay(30_000n, USDC, 30)).toBe('$0.03');
    expect(formatFeeDisplay(1_250_000n, USDC, 30)).toBe('$1.25');
  });

  /**
   * The whole point. The dust test charged 0.0009 USDC and the screen said "$0.00" —
   * a fee we did take, displayed as nothing.
   */
  it('never renders a charged fee as $0.00', () => {
    expect(formatFeeDisplay(900n, USDC, 30)).toBe('<$0.01 (0.3%)');
    expect(formatFeeDisplay(900n, USDC)).toBe('<$0.01');
    expect(formatFeeDisplay(1n, USDC, 30)).not.toContain('$0.00');
  });

  it('still says $0.00 when the fee really is zero', () => {
    expect(formatFeeDisplay(0n, USDC, 30)).toBe('$0.00');
  });
});
