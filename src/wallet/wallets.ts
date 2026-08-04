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
 * sheet at all no matter what you search — the listing data, not the search, is what is
 * missing. Reown knows: `@reown/appkit-common-react-native` ships `COINBASE_CUSTOM_WALLET`
 * for this exact reason.
 *
 * So the wallets we care about are declared here with links we control.
 *
 * ── Link format ─────────────────────────────────────────────────────────────────
 * `mobile_link` is a BASE, not a finished deep link. AppKit's
 * `CoreHelperUtil.formatNativeUrl` appends `wc?uri=<encoded pairing uri>` itself
 * (CoreHelperUtil.ts:126), and routes an http(s) base through `formatUniversalUrl`
 * instead. So:
 *
 *   'cbwallet://'                →  cbwallet://wc?uri=…                  (native scheme)
 *   'https://metamask.app.link'  →  https://metamask.app.link/wc?uri=…   (universal link)
 *
 * Writing the finished `cbwallet://wc?uri=…` here would therefore produce
 * `cbwallet://wc?uri=/wc?uri=…` and silently break every link. THESE VALUES MUST STOP AT
 * THE BASE — the `wc?uri=` half is not ours to add.
 *
 * ── Native scheme first, universal link as fallback ─────────────────────────────
 * WalletConnect's mobile-linking guidance is to prefer the native scheme, because an
 * https universal link fired from inside an app can be claimed by the browser rather than
 * the wallet. That is precisely the Base App symptom: the same link opens the wallet when
 * tapped from a note, and does not when tapped in-app.
 *
 * A `CustomWallet` has room for only ONE link, so the fallback cannot be expressed here.
 * `WALLET_LINK_FALLBACKS` below pairs each scheme with the universal link it degrades to,
 * and `walletLinking.ts` does the try-scheme-then-fall-back at the `Linking.openURL`
 * seam. Keep the two in sync: a scheme added here without an entry there loses its
 * fallback silently.
 */
import type { AppKitConfig } from '@reown/appkit-react-native';

type CustomWallet = NonNullable<AppKitConfig['customWallets']>[number];

/** Ids are the WalletConnect explorer ids, read from the live API — not guessed. */
export const WALLET_IDS = {
  metaMask: 'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
  /** Explorer name: "Base (formerly Coinbase Wallet)". */
  base: 'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
  phantom: 'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393',
  trust: '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
} as const;

/**
 * Declared in the order they should appear. Base first: it is the native wallet for the
 * chain this app sends on.
 */
export const CUSTOM_WALLETS: CustomWallet[] = [
  {
    id: WALLET_IDS.base,
    name: 'Base',
    /** Explorer image ids still resolve even when the listing's links do not. */
    image_id: 'a5ebc364-8f91-4200-fcc6-be81310a0000',
    /**
     * Native scheme, package org.toshi. AppKit turns this into
     * `cbwallet://wc?uri=<encoded>`.
     *
     * This is the fix for the in-app tap doing nothing while the SAME link tapped from a
     * note works: a universal link fired from inside an app can be handed to the browser
     * instead of the wallet, and an intent to a scheme has no browser to lose to.
     *
     * The old argument for the universal link — that a scheme needs a package-visibility
     * declaration — does not hold on this RN version. `IntentModule.openURL` calls
     * `sendOSIntent` without ever calling `resolveActivity` (IntentModule.kt:113-129);
     * visibility filtering only constrains `canOpenURL`. See `walletLinking.ts`.
     *
     * `https://go.cb-w.com` stays as the FALLBACK (see WALLET_LINK_FALLBACKS), which
     * preserves the other half of that argument — graceful degradation to a web page when
     * the app is absent. Domains were checked, not assumed:
     *
     *   go.cb-w.com/wc  → 200, serves a real deep-link landing page, and its
     *                     assetlinks.json claims org.toshi — the package the Base App
     *                     still ships as. Contrary to the theory that it stopped
     *                     routing after the rebrand, it works.
     *   base.app/wc     → 307 that STRIPS the path down to /?uri=… . The current brand
     *                     domain does not handle /wc at all and would silently drop the
     *                     pairing, so it is not a candidate for either slot.
     *   wsegue          → Coinbase Wallet SDK handshake endpoint, not WalletConnect.
     *                     My earlier mistake, taken from Reown's constant.
     */
    mobile_link: 'cbwallet://',
    play_store: 'https://play.google.com/store/apps/details?id=org.toshi',
    app_store: 'https://apps.apple.com/app/id1278383455',
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
     * The reason for going native now is a DIFFERENT mechanism: not what the link
     * carries, but who receives it. An https link fired from inside an app can be routed
     * to the browser rather than the wallet, which no amount of payload integrity fixes.
     * `https://metamask.app.link` remains the fallback, so the launch path that was known
     * to work is still reachable — see WALLET_LINK_FALLBACKS.
     *
     * ── Expectation, so this is not chased forever ──────────────────────────────
     * MetaMask receives the pairing and stalls AFTER it, which points at the proposal
     * fetch rather than the handoff — and no-prompt-after-open is a years-old documented
     * issue on MetaMask's own forum. If the scheme does not fix it, the fault is
     * wallet-side and we stop here rather than keep instrumenting.
     */
    mobile_link: 'metamask://',
    play_store: 'https://play.google.com/store/apps/details?id=io.metamask',
    app_store: 'https://apps.apple.com/app/id1438144202',
  },
  /**
   * PHANTOM IS DELIBERATELY ABSENT — and the reason is not the one previously recorded
   * here.
   *
   * The old note said "WalletConnect v1 only", read off the stale `sdks: ["sign_v1"]` in
   * its explorer record. That framing is wrong, and it is wrong in a way that matters: it
   * implies Phantom is one protocol upgrade away from working in this sheet.
   *
   * It is not. Phantom's current developer path is their own Phantom Connect SDK, which
   * has a React Native SDK — a separate integration with its own connect flow, not a
   * WalletConnect deep link. Nothing put in `customWallets` can reach it, because an
   * AppKit picker only brokers WalletConnect sessions. No entry here, however the links
   * are written, will ever make Phantom pair.
   *
   * So this is not "wait for Phantom to ship sign_v2" — it is a v1.1 candidate as its own
   * SDK integration alongside AppKit. Until that is built, listing it would ship a button
   * that always fails.
   */
  {
    id: WALLET_IDS.trust,
    name: 'Trust Wallet',
    image_id: '0528ee7e-16d1-4089-21e3-bbfb41933100',
    /**
     * LEFT ON THE UNIVERSAL LINK ON PURPOSE. Trust is the working reference path: it
     * pairs, it prompts, it settles. It gets no native scheme and no fallback wrapper,
     * so that if Base or MetaMask change behaviour there is still one wallet whose
     * configuration did not move underneath the experiment.
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
 * Trust is intentionally not listed: it is the untouched reference path.
 */
export const WALLET_LINK_FALLBACKS: Record<string, string> = {
  'cbwallet://': 'https://go.cb-w.com',
  'metamask://': 'https://metamask.app.link',
};

/**
 * Surfaced at the top of the sheet, so the list is deterministic instead of whatever the
 * explorer happens to rank highest today.
 */
export const FEATURED_WALLET_IDS: string[] = [
  WALLET_IDS.base,
  WALLET_IDS.metaMask,
  /** Phantom omitted — needs its own Connect SDK, not WalletConnect. See CUSTOM_WALLETS. */
  WALLET_IDS.trust,
];
