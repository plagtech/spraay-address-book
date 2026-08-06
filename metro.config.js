/**
 * Metro config. It exists for one reason: to delete AppKit's "All wallets" row from the
 * connect sheet at bundle time. See `src/wallet/AllWalletsButtonStub.tsx` for why the
 * surface is gone (native crash on scroll, no JS trace) and what replaces it if it is ever
 * asked for again (a WalletConnect QR flow — not this list).
 *
 * Everything else is Expo's default config, untouched.
 */
const { getDefaultConfig } = require('expo/metro-config');

const {
  ALL_WALLETS_BUTTON_STUB,
  isAllWalletsButtonModule,
} = require('./src/wallet/allWalletsRemoval');

const config = getDefaultConfig(__dirname);

/**
 * Expo does not set a custom resolver today, but it may; capture whatever is there so this
 * hook layers on top of it instead of replacing it. When nothing is there,
 * `context.resolveRequest` is Metro's own resolver — Metro swaps it in before calling us,
 * so this does not recurse.
 */
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolveUpstream = upstreamResolveRequest ?? context.resolveRequest;
  const resolution = resolveUpstream(context, moduleName, platform);

  /**
   * Matched on the RESOLVED path rather than the request string: AppKit imports the button
   * as a relative `./components/all-wallets-button`, and only the resolved path says which
   * package that relative request landed in.
   */
  if (
    resolution &&
    resolution.type === 'sourceFile' &&
    isAllWalletsButtonModule(resolution.filePath)
  ) {
    return { type: 'sourceFile', filePath: ALL_WALLETS_BUTTON_STUB };
  }

  return resolution;
};

module.exports = config;
