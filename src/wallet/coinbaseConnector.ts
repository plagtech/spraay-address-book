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
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppKitConfig } from '@reown/appkit-react-native';

import { BASE_RPC_URL } from '../config/chain';

/** Shares the `[wallet-diag …]` prefix so the one line below lands in the usual capture. */
const tag = (msg: string) => `[wallet-diag coinbase] ${msg}`;

/**
 * `KVStorage` structurally, declared here rather than imported.
 *
 * The real type lives at `@coinbase/wallet-mobile-sdk/build/WalletMobileSDKEVMProvider`.
 * A type-only import of it would erase at build time and be harmless TODAY — but this
 * module's whole contract is that nothing on the startup path reaches the SDK, and an
 * `import type` sitting at the top is one dropped keyword away from bricking launch again.
 * Three methods are cheap insurance.
 */
type CoinbaseKVStorage = {
  set: (key: string, value: boolean | string | number | ArrayBuffer) => void;
  getString: (key: string) => string | undefined;
  delete: (key: string) => void;
};

/** The connector is loaded untyped through `require`; this is all AppKit needs of it. */
type ExtraConnector = NonNullable<AppKitConfig['extraConnectors']>[number];

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
export const coinbaseSdkStorage: CoinbaseKVStorage = {
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
 * Build the connector, or return undefined if the native module is not in this binary.
 *
 * ── Why this cannot be a top-level import ───────────────────────────────────────
 * `@coinbase/wallet-mobile-sdk` resolves its native module AT MODULE SCOPE:
 *
 *     // CoinbaseWalletSDKModule.ts — the whole file
 *     export default requireNativeModule('CoinbaseWalletSDK');
 *
 * and the import chain `@reown/appkit-coinbase-react-native` → `CoinbaseConnector` →
 * `CoinbaseProvider` → `@coinbase/wallet-mobile-sdk` reaches it. So merely IMPORTING the
 * connector throws "Cannot find native module 'CoinbaseWalletSDK'" on any binary built
 * before the module was added — which, via `appkit.ts` → `_layout.tsx`, is a crash at
 * launch rather than a degraded wallet sheet.
 *
 * An earlier revision of this comment claimed importing was safe because `configure()` only
 * runs in `init()`. The `configure()` CALL is indeed deferred; the native module LOOKUP is
 * not, and the lookup is what throws. `require` inside the try/catch is what actually
 * defers it.
 *
 * ── Why this outlives the stale dev-client that exposed it ──────────────────────
 * A JS bundle can always outrun the binary underneath it: OTA updates, a reused dev client,
 * or autolinking quietly failing in some future build. None of those should cost a launch.
 * The app boots, Base App simply has no SDK connector, and one line says so.
 */
function loadCoinbaseConnector(): ExtraConnector | undefined {
  try {
    /**
     * `require`, not `import` — evaluation has to happen inside this `try`. The module is
     * still bundled by Metro either way; what changes is WHEN it is evaluated and whether
     * a throw is survivable. Same idiom as the lazy controller requires in `diagnostics.ts`.
     */
    const {
      CoinbaseConnector,
    } = require('@reown/appkit-coinbase-react-native') as {
      CoinbaseConnector: new (config: {
        storage?: CoinbaseKVStorage;
        jsonRpcUrl?: string;
      }) => ExtraConnector;
    };

    /**
     * The constructor itself only records config. Everything else native — `configure()`,
     * the provider, the intent launcher — happens in `init()`, which AppKit calls at
     * connect time (`AppKit.createConnector`, AppKit.js:270-280), so a device without Base
     * App installed still pays nothing until the row is actually tapped.
     *
     * `init()` reads its callback URL from `APP_METADATA.redirect` (`universal ?? native`)
     * and THROWS if both are absent — see `src/config/env.ts`, where both are set.
     */
    return new CoinbaseConnector({
      storage: coinbaseSdkStorage,
      /** Pinned Base RPC (spec §1.1) for the provider's read-only calls — never guessed. */
      jsonRpcUrl: BASE_RPC_URL,
    });
  } catch (err) {
    const message = (err as { message?: string })?.message ?? String(err);
    /**
     * One line, unconditionally — the absent native module is the expected cause and needs
     * no stack. Anything else is appended so an unexpected failure cannot hide behind the
     * expected wording.
     */
    const unexpected = message.includes('CoinbaseWalletSDK') ? '' : ` (${message})`;
    console.log(tag(`coinbase SDK native module absent — connector disabled.${unexpected}`));

    return undefined;
  }
}

/**
 * The connector handed to AppKit as `extraConnectors`, or undefined on a binary without
 * the native module.
 *
 * Resolved once at module scope because `appkit.ts` builds `createAppKit` at module scope
 * and needs the answer synchronously. `wallets.ts` reads the same value to decide whether
 * the Base row is offered at all — AppKit's own Coinbase exclusion does not cover
 * `customWallets` (ApiController.js:126-180 filters them by install state only), so
 * without that check a connector-less client would render a Base button that falls through
 * to `createWalletConnectConnector()` and spins forever.
 */
export const coinbaseConnector: ExtraConnector | undefined = loadCoinbaseConnector();

/** True when Base App can actually be paired on this binary. */
export const HAS_COINBASE_CONNECTOR = coinbaseConnector !== undefined;
