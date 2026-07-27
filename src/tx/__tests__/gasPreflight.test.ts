import {
  APPROVE_GAS,
  applyBuffer,
  evaluateGasBudget,
  formatEthAmount,
  modelSprayGas,
  SPRAY_BASE_OVERHEAD_GAS,
  SPRAY_PER_RECIPIENT_GAS,
} from '../gasPreflight';

const GWEI = 1_000_000_000n;
/** Base mainnet sits around 0.01 gwei. */
const TYPICAL_FEE = GWEI / 100n;

describe('modelSprayGas', () => {
  it('scales linearly with recipient count', () => {
    expect(modelSprayGas(0, 'equal')).toBe(SPRAY_BASE_OVERHEAD_GAS);
    expect(modelSprayGas(1, 'equal')).toBe(
      SPRAY_BASE_OVERHEAD_GAS + SPRAY_PER_RECIPIENT_GAS,
    );
    expect(modelSprayGas(10, 'equal')).toBe(
      SPRAY_BASE_OVERHEAD_GAS + SPRAY_PER_RECIPIENT_GAS * 10n,
    );
  });

  it('charges custom mode more per recipient than equal mode', () => {
    // sprayToken carries an extra amount word per recipient.
    expect(modelSprayGas(10, 'custom')).toBeGreaterThan(modelSprayGas(10, 'equal'));
  });

  it('degrades safely on nonsense counts', () => {
    expect(modelSprayGas(-5, 'equal')).toBe(SPRAY_BASE_OVERHEAD_GAS);
  });
});

describe('applyBuffer', () => {
  it('adds the default margin', () => {
    expect(applyBuffer(100_000n)).toBe(120_000n);
  });

  it('accepts an explicit percentage', () => {
    expect(applyBuffer(100_000n, 50n)).toBe(150_000n);
    expect(applyBuffer(100_000n, 0n)).toBe(100_000n);
  });
});

describe('evaluateGasBudget', () => {
  const budget = (ethBalanceWei: bigint, approveGas = 0n) =>
    evaluateGasBudget({
      sprayGas: 500_000n,
      approveGas,
      maxFeePerGas: TYPICAL_FEE,
      ethBalanceWei,
      approximate: true,
    });

  it('passes when the balance covers the fee', () => {
    const b = budget(10n ** 16n);
    expect(b.status).toBe('ok');
    expect(b.shortfallWei).toBe(0n);
  });

  it('treats an exactly-sufficient balance as ok', () => {
    const fee = budget(0n).totalFeeWei;
    expect(budget(fee).status).toBe('ok');
  });

  it('blocks when one wei short', () => {
    const fee = budget(0n).totalFeeWei;
    const b = budget(fee - 1n);
    expect(b.status).toBe('insufficient');
    expect(b.shortfallWei).toBe(1n);
  });

  /**
   * When an approval is due the user pays for BOTH transactions. Checking only the
   * spray leg would wave through a wallet that runs dry on the approve.
   */
  it('includes the approve leg when approval is needed', () => {
    const withApprove = budget(0n, applyBuffer(APPROVE_GAS));
    const without = budget(0n);

    expect(withApprove.needsApproval).toBe(true);
    expect(without.needsApproval).toBe(false);
    expect(withApprove.totalFeeWei).toBeGreaterThan(without.totalFeeWei);
    expect(withApprove.totalFeeWei).toBe(
      withApprove.approveFeeWei + withApprove.sprayFeeWei,
    );
  });

  it('reports no approve fee when the allowance already covers it', () => {
    expect(budget(0n).approveFeeWei).toBe(0n);
  });

  it('carries the approximate flag through untouched', () => {
    const measured = evaluateGasBudget({
      sprayGas: 500_000n,
      maxFeePerGas: TYPICAL_FEE,
      ethBalanceWei: 0n,
      approximate: false,
    });
    expect(measured.approximate).toBe(false);
  });
});

describe('formatEthAmount', () => {
  it('renders zero plainly', () => {
    expect(formatEthAmount(0n)).toBe('0 ETH');
  });

  it('never renders a real fee as a row of zeros', () => {
    // The reason this exists: 4dp formatting turns typical Base fees into "0.0000".
    expect(formatEthAmount(6_072_000_000_000n)).toBe('0.000006 ETH');
  });

  it('bounds amounts too small to show', () => {
    expect(formatEthAmount(1n)).toBe('<0.000001 ETH');
  });

  it('trims trailing zeros at larger magnitudes', () => {
    expect(formatEthAmount(10n ** 15n)).toBe('0.001 ETH');
    expect(formatEthAmount(10n ** 16n)).toBe('0.01 ETH');
    expect(formatEthAmount(25n * 10n ** 16n)).toBe('0.25 ETH');
  });
});
