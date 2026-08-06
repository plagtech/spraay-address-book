/**
 * The classification that dust test run 1 got wrong.
 *
 * `provesNothingWasSent` decides whether the send journal is torn down or left standing
 * for recovery, so a false positive here is how a payment gets lost. The tests are written
 * from that direction: the interesting cases are the ones that must NOT be treated as
 * proof.
 */
import { describeSendError, provesNothingWasSent, SendError } from '../sendErrors';

const named = (name: string, message = 'boom') => {
  const err = new Error(message);
  err.name = name;
  return err;
};

describe('provesNothingWasSent', () => {
  describe('the wallet answered no', () => {
    it.each([
      'User rejected the request.',
      'user denied transaction signature',
      'MetaMask Tx Signature: User denied transaction signature.',
      'Request failed with code 4001',
    ])('treats %j as proof', (message) => {
      expect(provesNothingWasSent(new Error(message))).toBe(true);
    });
  });

  describe('the transaction could not have been broadcast', () => {
    it('treats a revert during estimation as proof', () => {
      expect(
        provesNothingWasSent(new Error('execution reverted: Pausable: paused')),
      ).toBe(true);
    });

    it('treats a gas shortfall as proof', () => {
      expect(provesNothingWasSent(new Error('insufficient funds for gas'))).toBe(true);
    });

    it('treats an EstimateGasExecutionError by name as proof', () => {
      expect(provesNothingWasSent(named('EstimateGasExecutionError'))).toBe(true);
    });

    it('treats our own pre-flight guards as proof', () => {
      expect(provesNothingWasSent(new SendError('Missing the amount for each person.'))).toBe(
        true,
      );
    });
  });

  describe('we simply do not know', () => {
    /**
     * These are the shapes a backgrounded app sees when the relay socket dies — which is
     * the leading theory for how run 1's answer went missing. Every one of them must
     * leave the journal entry standing.
     */
    it.each([
      'Connection interrupted while trying to subscribe',
      'socket stalled when trying to connect to wss://relay.walletconnect.org',
      'Request expired. Please try again.',
      'No matching key. session topic doesn’t exist',
      'Network request failed',
      'Timed out while waiting for transaction with hash "0xabc" to be confirmed.',
      'websocket connection closed abnormally',
    ])('does not treat %j as proof', (message) => {
      expect(provesNothingWasSent(new Error(message))).toBe(false);
    });

    it('does not treat an unrecognised value as proof', () => {
      expect(provesNothingWasSent(undefined)).toBe(false);
      expect(provesNothingWasSent({ nope: true })).toBe(false);
    });
  });
});

describe('describeSendError', () => {
  it('passes our own messages through untouched', () => {
    expect(describeSendError(new SendError('Something specific.'))).toBe(
      'Something specific.',
    );
  });

  it('names cancellation as cancellation', () => {
    expect(describeSendError(new Error('User rejected the request.'))).toBe(
      'You cancelled in your wallet. Nothing was sent.',
    );
  });

  it('never claims funds are safe without saying what to check', () => {
    /**
     * The approve leg can still time out. Whatever else that copy does, it must send the
     * user to the explorer rather than assert the payment did not happen.
     */
    const copy = describeSendError(new Error('Timed out waiting for the receipt'));
    expect(copy).toMatch(/Basescan/);
    expect(copy).toMatch(/may still be on its way/);
  });
});
