/**
 * The wallet list shown in the connect sheet.
 *
 * ── Why this is pinned rather than left to the explorer ──────────────────────────
 * Verified against the live WalletConnect explorer on 2026-07-27: several major wallets
 * ship listings with NO usable mobile deep link.
 *
 *   Base (formerly Coinbase Wallet)  mobile: { native: "",           universal: null }
 *   Coinbase Wallet (older entry)    mobile: { native: "",           universal: ""   }
 *   Phantom                          mobile: { native: "",           universal: null }
 *   MetaMask                         mobile: { native: "metamask://", universal: "https://metamask.app.link" }
 *   Trust Wallet                     mobile: { native: "trust://",    universal: "https://link.trustwallet.com" }
 *
 * AppKit filters out wallets with no mobile link on a phone, so Base never appears in the
 * sheet on the explorer listing alone. For Base that missing link is not an oversight in
 * the listing — it is the listing being HONEST. Base App has no WalletConnect deep link
 * because it does not pair over WalletConnect at all; it pairs over the Coinbase Wallet
 * Mobile SDK. See `coinbaseConnector.ts`.
 *
 * So the wallets we care about are declared here with links we control.
 *
 * ── Link format ─────────────────────────────────────────────────────────────────
 * `mobile_link` is a BASE, not a finished deep link. AppKit's
 * `CoreHelperUtil.formatNativeUrl` appends `wc?uri=<encoded pairing uri>` itself
 * (CoreHelperUtil.ts:126), and routes an http(s) base through `formatUniversalUrl`
 * instead. So:
 *
 *   'metamask://'                →  metamask://wc?uri=…                  (native scheme)
 *   'https://metamask.app.link'  →  https://metamask.app.link/wc?uri=…   (universal link)
 *
 * Writing the finished `metamask://wc?uri=…` here would therefore produce
 * `metamask://wc?uri=/wc?uri=…` and silently break every link. THESE VALUES MUST STOP AT
 * THE BASE — the `wc?uri=` half is not ours to add.
 *
 * This applies to the WalletConnect wallets only. Base's entry carries the Coinbase SDK
 * handshake endpoint and is never formatted into a `wc:` link at all.
 *
 * ── Native scheme first, universal link as fallback ─────────────────────────────
 * WalletConnect's mobile-linking guidance is to prefer the native scheme, because an
 * https universal link fired from inside an app can be claimed by the browser rather than
 * the wallet.
 *
 * A `CustomWallet` has room for only ONE link, so the fallback cannot be expressed here.
 * `WALLET_LINK_FALLBACKS` below pairs each scheme with the universal link it degrades to,
 * and `walletLinking.ts` does the try-scheme-then-fall-back at the `Linking.openURL`
 * seam. Keep the two in sync: a scheme added here without an entry there loses its
 * fallback silently.
 */
import { ConstantsUtil } from '@reown/appkit-common-react-native';
import type { AppKitConfig } from '@reown/appkit-react-native';

type CustomWallet = NonNullable<AppKitConfig['customWallets']>[number];

/** Ids are the WalletConnect explorer ids, read from the live API — not guessed. */
export const WALLET_IDS = {
  metaMask: 'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
  /**
   * Base App's REAL explorer id, taken from AppKit's own constant rather than copied.
   *
   * An earlier revision replaced this with a local `'base-app-wc'` id specifically to dodge
   * AppKit's hardcoded external-wallet routing, on the theory that the routing was what
   * killed the tap. That was backwards. `WcHelpersUtil.isExternalWallet` matching this id
   * is what sends the tap to `ConnectingExternalView` → `AppKit.connect` →
   * `createConnector('coinbase')`, which is the ONLY path that reaches the Coinbase SDK.
   * The local id worked around the symptom by permanently routing Base down the
   * WalletConnect path — the one path Base App cannot answer.
   *
   * Read off `ConstantsUtil` so it cannot drift from the value AppKit actually compares
   * against; a hand-copied hex here would silently stop matching if Reown ever changed it.
   */
  base: ConstantsUtil.COINBASE_CUSTOM_WALLET.id,
  trust: '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
} as const;

/**
 * Declared in the order they should appear. Base first: it is the native wallet for the
 * chain this app sends on.
 */
export const CUSTOM_WALLETS: CustomWallet[] = [
  {
    /**
     * Reown's own Coinbase entry, relabelled.
     *
     * Spread rather than retyped so the id, the `https://wallet.coinbase.com/wsegue`
     * handshake endpoint, the store links and the install-detection fields all come from
     * the same constant AppKit routes on. Only the display name is ours: the app on the
     * user's phone is called Base, and this app sends on Base.
     *
     * ── Why it is declared here at all ──────────────────────────────────────────
     * Registering the connector stops AppKit force-excluding this id (AppKit.js:618-622),
     * but nothing then ADDS the wallet — `setCustomWallets` auto-injects Phantom and
     * Solflare and pointedly not Coinbase (AppKit.js:625-641). Left to the explorer, the
     * row would come back link-less and be filtered out on a phone, exactly as before.
     * Declaring it makes the row ours end to end.
     *
     * Deliberately NOT added to `featuredWalletIds`: those ids are sent to the explorer
     * API (`include=`), and the entry that returns would dedupe AHEAD of this one — trading
     * a complete entry for the link-less listing that started this whole investigation.
     * Position comes from install detection instead: the list is assembled as
     * [recent, installed, featured, recommended, custom] and deduped by id
     * (all-wallet-list.tsx:32-46), and `checkInstalled` reads the `android_app_id` /
     * `ios_schema` carried by the constant (CoreHelperUtil.ts:275-290), so on a device with
     * Base App installed — the only device where ordering matters — it is promoted into
     * `state.installed` and renders first with the INSTALLED badge.
     */
    ...ConstantsUtil.COINBASE_CUSTOM_WALLET,
    name: 'Base',
  },
  {
    id: WALLET_IDS.metaMask,
    name: 'MetaMask',
    image_id: '5195e9db-94d8-4579-6f11-ef553be95100',
    /**
     * Native scheme. AppKit turns this into `metamask://wc?uri=<encoded>`.
     *
     * ── This is NOT a revival of the Branch theory ──────────────────────────────
     * An earlier revision switched to `metamask://` on the theory that
     * `metamask.app.link` is Branch.io infrastructure that re-encodes query parameters
     * and corrupts the `wc:` uri, and was reverted because that theory was TESTED AND IS
     * FALSE: requesting the link with an encoded uri returns the identical url with no
     * redirect, and the response body carries the uri byte-for-byte, symKey intact. That
     * result still stands — the universal link does not mangle the payload.
     *
     * The reason for going native is a DIFFERENT mechanism: not what the link carries, but
     * who receives it. An https link fired from inside an app can be routed to the browser
     * rather than the wallet, which no amount of payload integrity fixes.
     * `https://metamask.app.link` remains the fallback, so the launch path that was known
     * to work is still reachable — see WALLET_LINK_FALLBACKS.
     *
     * ── Expectation, so this is not chased forever ──────────────────────────────
     * MetaMask receives the pairing and stalls AFTER it, which points at the proposal
     * fetch rather than the handoff — and no-prompt-after-open is a years-old documented
     * issue on MetaMask's own forum. If the scheme does not fix it, the fault is
     * wallet-side and we stop there rather than keep instrumenting.
     *
     * NOTE: unlike Base, this diagnosis is unchanged by the Coinbase SDK work. MetaMask is
     * a genuine WalletConnect wallet; its listing carries real links. Nothing in this
     * revision touches its configuration.
     */
    mobile_link: 'metamask://',
    play_store: 'https://play.google.com/store/apps/details?id=io.metamask',
    app_store: 'https://apps.apple.com/app/id1438144202',
  },
  /**
   * PHANTOM IS DELIBERATELY ABSENT — for the same reason Base needed this whole change.
   *
   * The old note said "WalletConnect v1 only", read off the stale `sdks: ["sign_v1"]` in
   * its explorer record. That framing is wrong, and wrong in a way that matters: it implies
   * Phantom is one protocol upgrade away from working in this sheet.
   *
   * It is not. Phantom's current developer path is their own Phantom Connect SDK — a
   * separate integration with its own connect flow, not a WalletConnect deep link. Nothing
   * put in `customWallets` alone can reach it.
   *
   * Base is now the worked example of what listing it would actually take: an
   * `extraConnectors` entry implementing `WalletConnector`. AppKit reserves the connector
   * type `'phantom'` for exactly this, and auto-injects `PHANTOM_CUSTOM_WALLET` once such a
   * connector is registered (AppKit.js:633-636) — but only on a Solana namespace, which
   * this Base-only app does not have. So Phantom stays a v1.1 candidate, not a config fix.
   */
  {
    id: WALLET_IDS.trust,
    name: 'Trust Wallet',
    image_id: '0528ee7e-16d1-4089-21e3-bbfb41933100',
    /**
     * LEFT ON THE UNIVERSAL LINK ON PURPOSE. Trust is the working reference path: it
     * pairs, it prompts, it settles. It gets no native scheme and no fallback wrapper,
     * so that if Base or MetaMask change behaviour there is still one wallet whose
     * configuration did not move underneath them.
     */
    mobile_link: 'https://link.trustwallet.com',
    play_store: 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp',
    app_store: 'https://apps.apple.com/app/id1288339409',
  },
];

/**
 * Native scheme → the universal link it falls back to when the scheme throws.
 *
 * Consumed by `walletLinking.ts`, which wraps `Linking.openURL`. Keys must be the exact
 * `mobile_link` values above, since matching is by string prefix on the formatted URL.
 *
 * `cbwallet://` is NOT here any more and must not be re-added. Base App never reaches
 * `Linking.openURL`: the Coinbase SDK launches it itself, on Android through
 * `startActivityForResult` against `org.toshi` rather than a URL open at all. An entry here
 * would be dead code that reads like a live fallback.
 *
 * Trust is intentionally absent for the opposite reason: it is the untouched reference path.
 */
export const WALLET_LINK_FALLBACKS: Record<string, string> = {
  'metamask://': 'https://metamask.app.link',
};

/**
 * Surfaced at the top of the sheet, so the list is deterministic instead of whatever the
 * explorer happens to rank highest today.
 */
export const FEATURED_WALLET_IDS: string[] = [
  /** Base is absent by design — see the note on its CUSTOM_WALLETS entry. */
  WALLET_IDS.metaMask,
  /** Phantom omitted — needs its own Connect SDK. See CUSTOM_WALLETS. */
  WALLET_IDS.trust,
];
