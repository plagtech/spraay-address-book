/**
 * Base App pairing via the Coinbase Wallet Mobile SDK.
 *
 * ── Why Base App is not a WalletConnect wallet ──────────────────────────────────
 * Every previous attempt treated Base App as a WalletConnect peer and tried to fix the
 * DEEP LINK: universal link, then native scheme, then A/B-ing the order. All of them
 * launched the app; none of them ever produced an approval prompt, because Base App does
 * not ingest a `wc:` pairing uri at all. It pairs over Coinbase's own SDK handshake.
 *
 * AppKit knew this the whole time. `ConstantsUtil.COINBASE_CUSTOM_WALLET.mobile_link` is
 * `https://wallet.coinbase.com/wsegue` — the Coinbase SDK handshake endpoint, not a
 * WalletConnect link — and `WcHelpersUtil.getConnectorTypeByWallet` maps that wallet id to
 * connector type `'coinbase'` (HelpersUtil.js:157-158). The hardcoded external routing that
 * looked like the bug was the correct route; what was missing was the connector at the end
 * of it. AppKit even guards for that absence: it force-excludes the Coinbase wallet from
 * the sheet unless an `extraConnectors` entry of type `'coinbase'` is registered
 * (AppKit.js:618-622). So the row could not have worked without this file.
 *
 * ── Package choice ──────────────────────────────────────────────────────────────
 * `@reown/appkit-coinbase-react-native@2.0.6`, version-matched to our AppKit RN 2.0.6.
 *
 * NOT `@reown/appkit-coinbase-wagmi-react-native`. That package (1.3.2, and its
 * 2.0.0-alpha.0 republish) is a wagmi `createConnector` factory built for AppKit RN v1,
 * where the app owned the wagmi config. AppKit RN 2.x inverted that: `extraConnectors`
 * takes `WalletConnector` subclasses — `init/connect/getNamespaces/restoreSession` — and
 * the WagmiAdapter wraps the chosen one in a `UniversalConnector` and injects it into
 * wagmi itself (adapter.js:125-127). A wagmi connector has none of those methods and would
 * never match the `connector.type === 'coinbase'` lookup. `CoinbaseConnector` here does
 * extend `WalletConnector` and passes `type: 'coinbase'` to `super`.
 */
import type { KVStorage } from '@coinbase/wallet-mobile-sdk/build/WalletMobileSDKEVMProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CoinbaseConnector } from '@reown/appkit-coinbase-react-native';

import { BASE_RPC_URL } from '../config/chain';

/** Namespaced like `storage.ts` so `devReset` can tell these apart from WalletConnect keys. */
const PREFIX = '@spraay/coinbase-sdk:';

/**
 * Synchronous mirror of the SDK's slice of AsyncStorage.
 *
 * `KVStorage` is a SYNCHRONOUS three-method interface (`set`/`getString`/`delete`), which
 * AsyncStorage cannot satisfy directly — hence the in-memory map with write-through.
 */
const cache = new Map<string, string>();

/**
 * Storage for the Coinbase SDK provider — supplied rather than defaulted, on purpose.
 *
 * `WalletMobileSDKEVMProvider` falls back to `new MMKV({ id: 'mobile_sdk.store' })` when no
 * storage is passed (WalletMobileSDKEVMProvider.ts:112). That would make Base App pairing
 * depend at RUNTIME on `react-native-mmkv@2.12.2`, an old-generation JSI module that
 * arrives transitively and is the least certain part of this integration under RN 0.86's
 * New Architecture. MMKV's native bridge is only touched inside its constructor
 * (`createMMKV.js` checks `global.mmkvCreateNewInstance` lazily), so passing our own store
 * means that constructor never runs and the dependency stays build-time only.
 *
 * The SDK keeps exactly two values here — the cached account list and the chain id
 * (WalletMobileSDKEVMProvider.ts:770-794). They are what lets a returning user skip a
 * second handshake, so they do have to survive a restart: see `hydrateCoinbaseStorage`.
 */
export const coinbaseSdkStorage: KVStorage = {
  set(key, value) {
    /**
     * `NativeMMKV.set` accepts ArrayBuffer, which has no faithful string form. The SDK
     * only ever stores strings, so drop anything else loudly rather than persist garbage.
     */
    if (value instanceof ArrayBuffer) {
      console.warn(`[coinbase-sdk] ignored non-string value for ${key}`);
      return;
    }
    const asString = String(value);
    cache.set(key, asString);
    AsyncStorage.setItem(`${PREFIX}${key}`, asString).catch(() => {
      /** In-memory write already succeeded; this only costs persistence across a restart. */
    });
  },

  getString(key) {
    return cache.get(key);
  },

  delete(key) {
    cache.delete(key);
    AsyncStorage.removeItem(`${PREFIX}${key}`).catch(() => {});
  },
};

/**
 * Load the persisted SDK values into the synchronous cache.
 *
 * Must finish before the first wallet tap, or a returning user's cached address reads as
 * absent and they are asked to approve a handshake they already approved. `_layout.tsx`
 * awaits this during startup, behind the splash screen — the same guarantee `loadDevFlags`
 * relies on.
 */
export async function hydrateCoinbaseStorage(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length === 0) return;

    for (const [key, value] of await AsyncStorage.multiGet(keys)) {
      if (value !== null) cache.set(key.slice(PREFIX.length), value);
    }
  } catch {
    /**
     * An empty cache is correct-but-forgetful: the user re-approves once. Failing startup
     * over it would be worse.
     */
  }
}

/**
 * The connector handed to AppKit as `extraConnectors`.
 *
 * Safe to build at module scope: the constructor only records config. Everything native —
 * `configure()`, the provider, the intent launcher — happens in `init()`, which AppKit
 * calls at connect time (`AppKit.createConnector`, AppKit.js:270-280). So importing this
 * module does not touch the Coinbase SDK, and a device without Base App installed pays
 * nothing until the row is actually tapped.
 *
 * `init()` reads its callback URL from `APP_METADATA.redirect` (`universal ?? native`) and
 * THROWS if both are absent — see `src/config/env.ts`, where both are set.
 */
export const coinbaseConnector = new CoinbaseConnector({
  storage: coinbaseSdkStorage,
  /** Pinned Base RPC (spec §1.1) for the provider's read-only calls — never guessed. */
  jsonRpcUrl: BASE_RPC_URL,
});
