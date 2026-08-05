/**
 * ALL WALLETS IS REMOVED FOR v1.
 *
 * This file is what AppKit's "All wallets" row resolves to. It renders nothing, so the
 * row is absent from the connect sheet — not empty, not disabled, ABSENT — and the
 * `AllWallets` route has no caller left anywhere in the bundle.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────────
 * Scrolling the explorer list crashed the app natively: black screen, no JS error, nothing
 * in Metro. A crash with no JS trace is below the layer this app can fix, and the surface it
 * sits behind is one nobody asked for — v1 sends on Base, to wallets we have verified
 * (MetaMask, Trust). So the surface is cut rather than diagnosed.
 *
 * ── Revisit only on demand ──────────────────────────────────────────────────────
 * If users ask for exotic wallet support, the v1.1 answer is a WalletConnect QR flow, NOT
 * restoring this list. A QR pairs any wallet without rendering a 500-row remote-image list
 * — it removes the reason the list existed instead of re-entering the crash.
 *
 * ── How the removal is wired ────────────────────────────────────────────────────
 * `metro.config.js` swaps AppKit's `all-wallets-button` module for this one at resolve time,
 * using the matcher in `allWalletsRemoval.js`. Bundle-level, so the button never enters the
 * tree — no runtime monkeypatch, no fork of the connect view, and no edit inside
 * `node_modules` that `npm ci` would wipe on the next EAS build.
 *
 * JS-ONLY: this is a bundling change. No native module, no config plugin, no rebuild.
 *
 * The list is also closed at the source: `wallets.ts` pins `includeWalletIds`, so the
 * explorer only ever returns the curated ids and the icon flood cannot happen even if some
 * future view reaches for `ApiController.state.wallets`.
 */

/**
 * Signature-compatible with AppKit's `AllWalletsButton` ({ itemStyle, onPress }), which is
 * why the props are accepted and ignored rather than typed away — the call site is theirs.
 */
export function AllWalletsButton(_props?: unknown): null {
  return null;
}
