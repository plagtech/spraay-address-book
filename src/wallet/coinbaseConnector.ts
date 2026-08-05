/**
 * Base App support, currently DISABLED — the Coinbase Wallet Mobile SDK is not shipped.
 *
 * ── Why the SDK is gone ─────────────────────────────────────────────────────────
 * The diagnosis that produced it still stands and is not what failed: Base App does not
 * pair over WalletConnect. It never ingests a `wc:` uri in any link format, which is why
 * every link-level fix launched the app and none produced an approval. It pairs over the
 * Coinbase Wallet Mobile SDK, reached through AppKit's `extraConnectors`.
 *
 * What failed was the SDK's Android Expo module, at native startup, before JS loads:
 *
 *     java.lang.UnsupportedOperationException: This function has a reified type parameter
 *     and thus can only be inlined at compilation time, not called directly.
 *       at expo.modules.coinbasewalletsdkexpo.CoinbaseWalletSDKModule.definition(...)
 *       at expo.modules.kotlin.ModuleRegistry.register(...)
 *
 * That is NOT a fixable call-site mistake. `CoinbaseWalletSDKModule.kt` is 133 lines; the
 * reported line is a synthetic number from expo-modules-core's inline DSL being mapped back
 * onto the caller. The module's `Function(name) { … }` usage still matches
 * expo-modules-core 57's `inline fun <reified R> Function(...)` exactly — which is why it
 * COMPILED. The inline body was simply emitted as a real call, so the reified marker throws
 * at runtime: a Kotlin binary-compatibility failure in the build toolchain, which no edit
 * to the module's source can reach.
 *
 * Behind it sat more of the same era: the crash path runs through `NativeModulesProxy`, the
 * legacy bridge that RN 0.86's New Architecture deprecates; `compileSdkVersion 33` /
 * `targetSdkVersion 31` fallbacks; an `ActivityLifecycleListener` that hard-requires
 * `AppCompatActivity`; and no publish since 2025-03-25, across Expo 53→57.
 *
 * ── What replaces it, when it does ──────────────────────────────────────────────
 * Not this package. Coinbase's current path is the Mobile Wallet Protocol client, which is
 * a separate integration to scope deliberately — not a retrofit. Until then Base App has no
 * path in this app, and saying so in one log line beats shipping a button that cannot work.
 *
 * ── Why this module still exists ────────────────────────────────────────────────
 * It is the seam. `wallets.ts` reads `HAS_COINBASE_CONNECTOR` to decide whether the Base
 * row is offered and `appkit.ts` reads `coinbaseConnector` for `extraConnectors`, so
 * re-enabling Base is a change to this file rather than a change spread across three.
 *
 * There is deliberately NO `require` of a connector package here. Metro resolves literal
 * requires STATICALLY, at bundle time — a require of an uninstalled package fails the
 * build, and a try/catch around it never gets the chance to run. Optional native
 * dependencies cannot be expressed that way; the honest form is this constant.
 */
import type { AppKitConfig } from '@reown/appkit-react-native';

/** Shares the `[wallet-diag …]` prefix so this line lands in the usual capture. */
const tag = (msg: string) => `[wallet-diag coinbase] ${msg}`;

type ExtraConnector = NonNullable<AppKitConfig['extraConnectors']>[number];

/**
 * Undefined until a working Base App connector ships. `appkit.ts` passes an empty
 * `extraConnectors` when this is absent, which also lets AppKit apply its own Coinbase
 * exclusion to the explorer results it fetches (AppKit.js:618-622).
 */
export const coinbaseConnector: ExtraConnector | undefined = undefined;

/**
 * False while Base App cannot be paired. Typed as `boolean` rather than the inferred
 * literal so the guards that read it stay live code to the reader and the type checker.
 */
export const HAS_COINBASE_CONNECTOR: boolean = coinbaseConnector !== undefined;

if (!HAS_COINBASE_CONNECTOR) {
  console.log(tag('coinbase SDK not bundled — connector disabled, Base App hidden.'));
}
