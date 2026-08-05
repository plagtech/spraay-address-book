/**
 * Reown AppKit + wagmi setup. Base mainnet only (spec §1.1, §2).
 *
 * Non-custodial: AppKit brokers a WalletConnect session to the user's own wallet app.
 * This module never sees a private key or a seed phrase (spec §4).
 *
 * NOTE on import order: `@walletconnect/react-native-compat` installs the JS polyfills
 * (TextEncoder, Buffer, crypto shims) that wagmi/viem need, so it must be imported
 * before anything that touches them. `react-native-get-random-values` provides
 * crypto.getRandomValues. Both are imported at the top of app/_layout.tsx as well so
 * the ordering is guaranteed regardless of which module Metro reaches first.
 */
import '@walletconnect/react-native-compat';
import 'react-native-get-random-values';

import { createAppKit } from '@reown/appkit-react-native';
import { WagmiAdapter } from '@reown/appkit-wagmi-react-native';
import * as Clipboard from 'expo-clipboard';

import { base, SUPPORTED_CHAINS } from '../config/chain';
import { APP_METADATA, HAS_REOWN_PROJECT_ID, REOWN_PROJECT_ID } from '../config/env';
import { colors } from '../theme';
import { coinbaseConnector } from './coinbaseConnector';
import { appKitStorage } from './storage';
import { CUSTOM_WALLETS, FEATURED_WALLET_IDS } from './wallets';

/**
 * wagmi adapter — its `wagmiConfig` is what `<WagmiProvider>` consumes, so the
 * contract layer (step 4) and AppKit share one connection and one signer.
 */
export const wagmiAdapter = new WagmiAdapter({
  projectId: REOWN_PROJECT_ID,
  networks: [...SUPPORTED_CHAINS],
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

/**
 * `createAppKit` is a singleton — calling it twice returns the first instance and
 * silently ignores the second config. Build it once at module scope.
 */
export const appKit = createAppKit({
  projectId: REOWN_PROJECT_ID,
  metadata: APP_METADATA,
  adapters: [wagmiAdapter],
  networks: [...SUPPORTED_CHAINS],
  defaultNetwork: base,
  storage: appKitStorage,
  /**
   * Declared explicitly because the explorer listings for Base and (historically) others
   * carry no usable mobile deep link, so AppKit filters them out of the sheet entirely —
   * see `wallets.ts` for the verified listing data. `customWallets` supplies entries we
   * control; `featuredWalletIds` fixes the order so it does not drift with explorer
   * ranking.
   *
   * MetaMask is declared with a NATIVE SCHEME; `walletLinking.ts` supplies the
   * universal-link fallback that `customWallets` has no field for. Base is not a
   * WalletConnect wallet at all — its entry routes to `coinbaseConnector` below.
   */
  customWallets: CUSTOM_WALLETS,
  featuredWalletIds: FEATURED_WALLET_IDS,
  /**
   * Base App pairs over the Coinbase Wallet Mobile SDK, not WalletConnect — see
   * `coinbaseConnector.ts` for the evidence and the package choice.
   *
   * Registering it is also what makes the Base row appear: without a connector of type
   * `'coinbase'` here, AppKit appends `COINBASE_CUSTOM_WALLET.id` to `excludeWalletIds`
   * itself and the row is suppressed no matter what `customWallets` says
   * (AppKit.js:618-622). That self-managed exclusion is why we no longer pass an
   * `excludeWalletIds` of our own: the entry it used to suppress is now the entry we want.
   */
  extraConnectors: [coinbaseConnector],
  clipboardClient: {
    setString: async (value: string) => {
      await Clipboard.setStringAsync(value);
    },
  },
  themeMode: 'light',
  themeVariables: {
    accent: colors.accent,
  },
  /**
   * Spec §2 / §5: no analytics SDK collecting addresses; the Play data-safety form
   * says contacts never leave the device. Keep this off.
   */
  enableAnalytics: false,
  debug: __DEV__,
  features: {
    // v1 is a sending tool only — no onramp, no swaps, no "earn" surfaces (spec §5).
    onramp: false,
    swaps: false,
  },
});

export { HAS_REOWN_PROJECT_ID };
