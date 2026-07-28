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
     * `go.cb-w.com` is Coinbase's WALLETCONNECT universal link, yielding
     * https://go.cb-w.com/wc?uri=… once AppKit appends the pairing uri.
     *
     * NOT Reown's `COINBASE_CUSTOM_WALLET.mobile_link`, which is
     * `https://wallet.coinbase.com/wsegue` — that is the Coinbase Wallet SDK handshake
     * endpoint, used by Reown's dedicated Coinbase connector, not by the WalletConnect
     * pairing path. Feeding it a `wc?uri=` produces a URL Coinbase does not recognise as
     * a pairing, which is why tapping Base did nothing.
     */
    mobile_link: 'https://go.cb-w.com',
    play_store: 'https://play.google.com/store/apps/details?id=org.toshi',
    app_store: 'https://apps.apple.com/app/id1278383455',
  },
  {
    id: WALLET_IDS.metaMask,
    name: 'MetaMask',
    image_id: '5195e9db-94d8-4579-6f11-ef553be95100',
    /** Universal link form — resolves to https://metamask.app.link/wc?uri=… */
    mobile_link: 'https://metamask.app.link',
    play_store: 'https://play.google.com/store/apps/details?id=io.metamask',
    app_store: 'https://apps.apple.com/app/id1438144202',
  },
  {
    id: WALLET_IDS.phantom,
    name: 'Phantom',
    image_id: 'b6ec7b81-bb4f-427d-e290-7631e6e50d00',
    /**
     * Universal link, yielding https://phantom.app/ul/wc?uri=… — deliberately not
     * Reown's `PHANTOM_CUSTOM_WALLET.mobile_link` of `phantom://`.
     *
     * A custom scheme only launches if the OS has a registered handler visible to us;
     * on Android 11+ that is exactly the case that silently fails, and RN surfaces it as
     * a throw which AppKit swallows into "not installed". A universal link routes
     * through the OS app-link resolver instead and does not depend on scheme visibility.
     */
    mobile_link: 'https://phantom.app/ul',
    play_store: 'https://play.google.com/store/apps/details?id=app.phantom',
    app_store: 'https://apps.apple.com/app/id1598432977',
  },
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
  WALLET_IDS.phantom,
  WALLET_IDS.trust,
];
