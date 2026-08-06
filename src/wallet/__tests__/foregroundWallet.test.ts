/**
 * Which link raises the connected wallet.
 *
 * The ordering is the whole behaviour: the session's own redirect first, so every wallet
 * works on one code path, and `wallets.ts` only as a fallback for a peer that sent none.
 */
import { resolveWalletLink } from '../foregroundWallet';

describe('resolveWalletLink', () => {
  it('prefers the native scheme the wallet advertised in its session', () => {
    expect(
      resolveWalletLink({
        name: 'MetaMask',
        type: 'walletconnect',
        redirect: { native: 'metamask://', universal: 'https://metamask.app.link' },
      }),
    ).toBe('metamask://');
  });

  it('falls back to the wallet´s universal link when it advertised no scheme', () => {
    expect(
      resolveWalletLink({
        name: 'Trust Wallet',
        type: 'walletconnect',
        redirect: { universal: 'https://link.trustwallet.com' },
      }),
    ).toBe('https://link.trustwallet.com');
  });

  it('treats an empty redirect field as absent', () => {
    expect(
      resolveWalletLink({
        name: 'Trust Wallet',
        type: 'walletconnect',
        redirect: { native: '   ', universal: 'https://link.trustwallet.com' },
      }),
    ).toBe('https://link.trustwallet.com');
  });

  it('falls back to the pairing link for a session that carried no redirect', () => {
    /** Matched by name against `CUSTOM_WALLETS`, which is where MetaMask´s lives. */
    expect(resolveWalletLink({ name: 'MetaMask', type: 'walletconnect' })).toBe(
      'metamask://',
    );
    expect(resolveWalletLink({ name: 'trust wallet', type: 'walletconnect' })).toBe(
      'https://link.trustwallet.com',
    );
  });

  /**
   * The Coinbase SDK launches Base App itself, through `startActivityForResult` against
   * `org.toshi` rather than a URL. A link fired here would be a second, competing launch.
   */
  it('never links out for an external connector', () => {
    expect(
      resolveWalletLink({
        name: 'Base',
        type: 'external',
        redirect: { native: 'cbwallet://' },
      }),
    ).toBeUndefined();
  });

  it('returns nothing for a wallet it cannot place', () => {
    expect(resolveWalletLink(undefined)).toBeUndefined();
    expect(resolveWalletLink({})).toBeUndefined();
    expect(resolveWalletLink({ name: 'Some Wallet', type: 'walletconnect' })).toBeUndefined();
  });
});
