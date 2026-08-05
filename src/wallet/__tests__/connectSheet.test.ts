/**
 * The connect sheet is exactly two rows: MetaMask and Trust. No "All wallets".
 *
 * That row was removed for v1 because scrolling the explorer list crashed the app natively —
 * black screen, nothing in Metro. `AllWalletsButtonStub.tsx` carries the full reasoning.
 * These tests exist because BOTH halves of the removal are silent when they break:
 *
 *   • the config half (`includeWalletIds`) — drop it and the sheet still renders, just with
 *     four explorer-ranked wallets nobody verified,
 *   • the bundle half (the Metro swap) — break the path match and the row comes back with
 *     the crash behind it, and nothing throws.
 */
import path from 'path';

import { ALL_WALLETS_BUTTON_STUB, isAllWalletsButtonModule } from '../allWalletsRemoval';
import { AllWalletsButton } from '../AllWalletsButtonStub';
import { CURATED_WALLET_IDS, CUSTOM_WALLETS, WALLET_IDS } from '../wallets';

/**
 * `appkit.ts` builds the AppKit singleton at module scope, so the config it hands over is
 * only observable by standing in for `createAppKit`. Capturing it is the point: these
 * assertions are against the object AppKit actually receives, not a restatement of the
 * constants next door.
 */
const mockCreateAppKit = jest.fn((_config: Record<string, unknown>) => ({}) as never);

jest.mock('@reown/appkit-react-native', () => ({
  createAppKit: (config: unknown) => mockCreateAppKit(config as Record<string, unknown>),
}));

jest.mock('@reown/appkit-wagmi-react-native', () => ({
  WagmiAdapter: class {
    wagmiConfig = {};
  },
}));

jest.mock('@walletconnect/react-native-compat', () => ({}));
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

/** Typed loosely: this is AppKit's option bag, asserted field by field below. */
const appKitConfig = (): Record<string, unknown> => {
  require('../appkit');

  expect(mockCreateAppKit).toHaveBeenCalledTimes(1);

  return mockCreateAppKit.mock.calls[0]![0];
};

describe('the curated connect sheet', () => {
  it('offers exactly MetaMask and Trust — the two wallets pairing is verified against', () => {
    expect(CUSTOM_WALLETS.map((w) => w.name)).toEqual(['MetaMask', 'Trust Wallet']);
  });

  it('hands AppKit those two as its custom wallets, in that order', () => {
    const custom = appKitConfig()['customWallets'] as { name: string }[];

    expect(custom.map((w) => w.name)).toEqual(['MetaMask', 'Trust Wallet']);
  });

  it('renders its icons from explicit image ids, not from whatever the explorer returns', () => {
    /**
     * `AssetUtil.getWalletImage` resolves `image_id` against the images AppKit prefetches
     * with `fetchCustomWalletImages` — a path that ignores `includeWalletIds` entirely. So
     * closing the explorer list cannot blank these rows, PROVIDED each row carries its own
     * id. A row without one falls back to the explorer entry's image and goes grey the day
     * that listing changes.
     */
    for (const wallet of CUSTOM_WALLETS) {
      expect(wallet.image_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    }
  });

  it('leaves both pairing paths on their verified links', () => {
    const byName = Object.fromEntries(CUSTOM_WALLETS.map((w) => [w.name, w]));

    /**
     * Unchanged by the All Wallets removal, and pinned here so it stays that way: MetaMask
     * on its native scheme (universal link as fallback in `walletLinking.ts`), Trust on its
     * universal link as the untouched reference path. Both stop at the BASE — AppKit appends
     * `wc?uri=…` itself.
     */
    expect(byName['MetaMask']?.mobile_link).toBe('metamask://');
    expect(byName['Trust Wallet']?.mobile_link).toBe('https://link.trustwallet.com');
  });
});

describe('the explorer list, closed at the source', () => {
  it('restricts every explorer request to the curated ids', () => {
    expect(CURATED_WALLET_IDS).toEqual([WALLET_IDS.metaMask, WALLET_IDS.trust]);
    expect(appKitConfig()['includeWalletIds']).toEqual(CURATED_WALLET_IDS);
  });

  it('keeps featured and included identical, so nothing returns as "recommended"', () => {
    /**
     * `fetchRecommendedWallets` requests `include=<included>` while excluding `<featured>`.
     * Identical lists make that request empty by construction; drift between them is how an
     * uncurated row gets in. Asserted as SAME ARRAY, since equal-today is what drifts.
     */
    const config = appKitConfig();

    expect(config['featuredWalletIds']).toBe(config['includeWalletIds']);
  });
});

describe('the All wallets row', () => {
  it('renders nothing, so the row is absent rather than empty', () => {
    expect(AllWalletsButton()).toBeNull();
  });

  it('is what AppKit\u2019s own button module resolves to, in every build it ships', () => {
    /**
     * The package publishes the same tree three times and Metro picks one; matching only the
     * flavour that happens to win today is how this silently stops applying.
     */
    for (const build of ['lib/commonjs', 'lib/module', 'src']) {
      const modulePath = `/app/node_modules/@reown/appkit-react-native/${build}/views/w3m-connect-view/components/all-wallets-button.js`;

      expect(isAllWalletsButtonModule(modulePath)).toBe(true);
    }
  });

  it('matches on Windows-resolved paths too', () => {
    const modulePath = String.raw`C:\app\node_modules\@reown\appkit-react-native\lib\commonjs\views\w3m-connect-view\components\all-wallets-button.js`;

    expect(isAllWalletsButtonModule(modulePath)).toBe(true);
  });

  it('leaves the curated list module alone — it differs by four characters', () => {
    /**
     * `all-wallet-list` (singular) IS the curated sheet. Matching it too would blank the
     * whole connect view, which is exactly the kind of near-miss a loose pattern makes.
     */
    const curatedList =
      '/app/node_modules/@reown/appkit-react-native/lib/commonjs/views/w3m-connect-view/components/all-wallet-list.js';

    expect(isAllWalletsButtonModule(curatedList)).toBe(false);
  });

  it('points Metro at a stub that exists', () => {
    expect(ALL_WALLETS_BUTTON_STUB).toBe(
      path.resolve(__dirname, '..', 'AllWalletsButtonStub.tsx'),
    );
    expect(() => require(ALL_WALLETS_BUTTON_STUB)).not.toThrow();
  });
});
