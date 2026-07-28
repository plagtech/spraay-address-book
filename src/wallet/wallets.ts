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
 * AppKit filters out wallets with no mobile link on a phone, so Base and Phantom never
 * appear in the sheet at all no matter what you search — the listing data, not the
 * search, is what is missing. Reown knows: `@reown/appkit-common-react-native` ships
 * `PHANTOM_CUSTOM_WALLET` and `COINBASE_CUSTOM_WALLET` constants for this exact reason.
 *
 * So the four wallets we care about are declared here with links we control.
 *
 * ── Link format ─────────────────────────────────────────────────────────────────
 * `mobile_link` is a BASE, not a finished deep link. AppKit's
 * `CoreHelperUtil.formatNativeUrl` appends `wc?uri=<encoded pairing uri>`, and routes an
 * http(s) base through `formatUniversalUrl`. So:
 *
 *   'https://metamask.app.link'  →  https://metamask.app.link/wc?uri=…   (universal link)
 *   'phantom://'                 →  phantom://wc?uri=…
 *
 * Appending `wc?uri=` here ourselves would produce `…/wc?uri=/wc?uri=…` and silently
 * break every link, which is why these values stop at the base.
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
     * Native scheme, for the same reason as MetaMask: reach the app directly rather
     * than through a web hop.
     *
     * Domains checked rather than assumed:
     *   go.cb-w.com/wc  → 200, serves a real deep-link landing page, assetlinks claims
     *                     org.toshi. Valid, but it is still a web round trip.
     *   base.app/wc     → 307 that STRIPS the path, redirecting to /?uri=… . The post-
     *                     rebrand domain does not handle /wc at all, so despite being
     *                     the current brand it is the wrong target and would silently
     *                     drop the pairing.
     *   wsegue          → Coinbase Wallet SDK handshake endpoint, not WalletConnect.
     *                     This was my earlier mistake, taken from Reown's constant.
     *
     * `cbwallet://wc?uri=…` is Coinbase's documented WalletConnect scheme and is
     * registered by org.toshi, which the Base App still ships as.
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
     * Native scheme, NOT the `https://metamask.app.link` universal link.
     *
     * That domain is Branch.io infrastructure (verified: responses set a
     * `Domain=.app.link` cookie and are served by openresty). Branch decodes and
     * re-encodes query parameters as it resolves a link, which corrupts the
     * percent-encoded `wc:` uri riding in `?uri=`. MetaMask then opens, receives
     * something it cannot parse as a pairing, and sits processing forever — exactly the
     * observed behaviour.
     *
     * Trust Wallet works over a universal link because `link.trustwallet.com` is a plain
     * domain that passes the query through untouched. The Branch hop is the difference.
     *
     * `metamask://wc?uri=…` reaches the app directly with the uri intact.
     */
    mobile_link: 'metamask://',
    play_store: 'https://play.google.com/store/apps/details?id=io.metamask',
    app_store: 'https://apps.apple.com/app/id1438144202',
  },
  /**
   * PHANTOM IS DELIBERATELY ABSENT.
   *
   * Its explorer record declares `sdks: ["sign_v1"]` and `versions: ["1"]` — Phantom
   * supports WalletConnect v1 ONLY. AppKit speaks v2 exclusively, so no deep link can
   * make this pair; the two sides cannot negotiate a session at all.
   *
   * (Its links have also moved: `phantom.app/ul` now 301s to `phantom.com/ul`, which
   * breaks Android app-link verification on top of the protocol mismatch.)
   *
   * Listing it would ship a button that always fails, so it is omitted until Phantom
   * publishes sign_v2 support. Re-check the explorer record before adding it back.
   */
  {
    id: WALLET_IDS.trust,
    name: 'Trust Wallet',
    image_id: '0528ee7e-16d1-4089-21e3-bbfb41933100',
    mobile_link: 'https://link.trustwallet.com',
    play_store: 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp',
    app_store: 'https://apps.apple.com/app/id1288339409',
  },
];

/**
 * Surfaced at the top of the sheet. Same four, so the list is deterministic instead of
 * whatever the explorer happens to rank highest today.
 */
export const FEATURED_WALLET_IDS: string[] = [
  WALLET_IDS.base,
  WALLET_IDS.metaMask,
  /** Phantom omitted — WalletConnect v1 only. See CUSTOM_WALLETS. */
  WALLET_IDS.trust,
];
