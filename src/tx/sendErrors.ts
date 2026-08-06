/**
 * Turning a wallet's failure into something true.
 *
 * Split out of `useSpraySend` because these are the decisions that got dust test run 1
 * wrong, and a decision that important should be testable without a React renderer, a
 * wagmi provider and an AppKit session behind it.
 *
 * Two separate questions live here, and conflating them is the original bug:
 *
 *   · WHAT HAPPENED — `provesNothingWasSent`, which gates whether the send journal is
 *     torn down or left standing for recovery. Getting this wrong loses a payment.
 *   · WHAT TO SAY — `describeSendError`, which is only ever reached once the first
 *     question has been answered "nothing was sent".
 */

/** Errors whose message is already fit to show the user. */
export class SendError extends Error {}

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Does this failure PROVE the transaction never reached the network?
 *
 * The bar is deliberately high and the default is deliberately "we don't know". Telling
 * someone nothing was sent when it was is the failure the whole send journal exists to
 * stop, and it costs far more than a needless "we're checking".
 *
 * Two families clear the bar:
 *
 *   · A REJECTION. The wallet answered, and the answer was no. 4001 is the EIP-1193 code;
 *     wallets phrase the prose several ways.
 *   · A REVERT OR SHORTFALL. These surface from a simulation or a gas estimate — work
 *     that happens before anything is signed — so they cannot coexist with a broadcast.
 *
 * Everything else leaves the entry standing, and that emphatically includes transport and
 * relay failures: a socket the OS closed under a backgrounded app tells you about the
 * socket, not about the transaction.
 */
export function provesNothingWasSent(err: unknown): boolean {
  if (err instanceof SendError) return true;

  const message = messageOf(err);
  const name = (err as { name?: string })?.name ?? '';

  if (/user rejected|user denied|4001|rejected the request/i.test(message)) return true;
  if (
    /execution reverted|insufficient funds|exceeds balance|insufficient allowance/i.test(
      message,
    )
  ) {
    return true;
  }
  if (/EstimateGas|ContractFunctionRevert|CallExecution/i.test(name)) return true;

  return false;
}

export function describeSendError(err: unknown): string {
  if (err instanceof SendError) return err.message;

  const message = messageOf(err);

  if (/user rejected|user denied|4001|rejected the request/i.test(message)) {
    return 'You cancelled in your wallet. Nothing was sent.';
  }
  if (/insufficient funds/i.test(message)) {
    return 'Not enough ETH to cover the network fee. Top up and try again.';
  }
  if (/transfer amount exceeds balance|insufficient allowance/i.test(message)) {
    return 'Your USDC balance or approval changed. Go back and check the amounts.';
  }
  if (/paused/i.test(message)) {
    return 'Sending is paused right now. Your funds are untouched — try again later.';
  }
  /**
   * Reachable only from the APPROVE leg now. A timeout waiting on the payment no longer
   * lands here at all — it becomes `unconfirmed`, because by then the transaction is
   * broadcast and this copy would be describing the wrong thing.
   */
  if (/timed out|timeout|network request failed/i.test(message)) {
    return 'The network took too long to answer. Check Basescan before resending — the payment may still be on its way.';
  }
  return 'The payment could not be completed. Nothing was sent from your wallet.';
}
