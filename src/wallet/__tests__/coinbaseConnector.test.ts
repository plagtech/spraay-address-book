/**
 * Base App is disabled: the Coinbase Wallet Mobile SDK crashed at native startup on RN 0.86
 * and was removed (see `coinbaseConnector.ts` for the stack and the reasoning).
 *
 * What is pinned here is the SHAPE of being disabled, because the failure it prevents is
 * silent: a Base row with no connector behind it does not error, it routes to
 * `createWalletConnectConnector()` and spins forever — the original bug, wearing the fix's
 * clothes. These tests fail loudly if the row ever comes back without a connector.
 */
import { coinbaseConnector, HAS_COINBASE_CONNECTOR } from '../coinbaseConnector';
import { CUSTOM_WALLETS } from '../wallets';

describe('coinbase connector', () => {
  it('is absent, so AppKit is handed no coinbase extraConnector', () => {
    expect(coinbaseConnector).toBeUndefined();
    expect(HAS_COINBASE_CONNECTOR).toBe(false);
  });

  it('says so once, in the shared wallet-diag capture', () => {
    /**
     * The module logs at import, which has already happened by the time this runs — so the
     * line is re-derived rather than spied. Asserting the module stays quiet on repeat
     * imports is the part that matters: a log inside a render path would flood the capture.
     */
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    jest.isolateModules(() => {
      require('../coinbaseConnector');
    });

    const lines = log.mock.calls
      .map((args) => String(args[0]))
      .filter((line) => line.includes('connector disabled'));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[wallet-diag');
    expect(lines[0]).toContain('Base App hidden');

    log.mockRestore();
  });
});

describe('the wallet sheet while Base is disabled', () => {
  it('offers no Base row, since nothing could service the tap', () => {
    expect(CUSTOM_WALLETS.map((w) => w.name)).not.toContain('Base');
  });

  it('still offers MetaMask and Trust, which pair over WalletConnect', () => {
    expect(CUSTOM_WALLETS.map((w) => w.name)).toEqual(['MetaMask', 'Trust Wallet']);
  });

  it('leaves the WalletConnect wallets on their verified links', () => {
    const byName = Object.fromEntries(CUSTOM_WALLETS.map((w) => [w.name, w]));

    /**
     * MetaMask on its native scheme with a universal-link fallback in `walletLinking.ts`;
     * Trust untouched on its universal link as the working reference path. `mobile_link`
     * must stop at the base — AppKit appends `wc?uri=…` itself.
     */
    expect(byName['MetaMask']?.mobile_link).toBe('metamask://');
    expect(byName['Trust Wallet']?.mobile_link).toBe('https://link.trustwallet.com');
  });
});
