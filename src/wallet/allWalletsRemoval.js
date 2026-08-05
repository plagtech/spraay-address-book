/**
 * The seam that removes AppKit's "All wallets" row from the connect sheet.
 *
 * Deliberately plain CommonJS JavaScript, because it has TWO consumers that cannot share a
 * module format: `metro.config.js` runs in bare Node before any transform exists, and the
 * jest suite imports it to pin the match. A `.ts` file would be unreadable to the first; a
 * rule inlined in `metro.config.js` would be untestable by the second.
 *
 * Reasoning for the removal itself lives in `AllWalletsButtonStub.tsx` — one copy, next to
 * the thing that does the removing.
 */
const path = require('path');

/**
 * The module that replaces AppKit's. Metro transforms it like any other project source, so
 * a `.tsx` path here is fine — the resolver deals in file paths, not built artifacts.
 */
const ALL_WALLETS_BUTTON_STUB = path.resolve(__dirname, 'AllWalletsButtonStub.tsx');

/**
 * Matches AppKit's all-wallets-button module in any of its shipped builds.
 *
 * The package publishes the same tree three times — `lib/commonjs`, `lib/module`, `src` —
 * and which one Metro picks depends on `resolverMainFields` and package exports, neither of
 * which is ours to pin. Matching on the path TAIL covers all three, so the removal cannot
 * quietly stop applying because a future Expo release changes its resolution order.
 *
 * The directory is part of the match on purpose: `all-wallet-list` (singular, the CURATED
 * list, which must keep rendering) sits in the same folder and differs by four characters.
 */
const ALL_WALLETS_BUTTON_MODULE =
  /\/@reown\/appkit-react-native\/(.*\/)?views\/w3m-connect-view\/components\/all-wallets-button(\.(js|jsx|ts|tsx))?$/;

/**
 * @param {string} filePath resolved absolute path, in whatever separator the OS uses
 * @returns {boolean} true when this file is AppKit's "All wallets" row
 */
function isAllWalletsButtonModule(filePath) {
  if (typeof filePath !== 'string') {
    return false;
  }

  // Windows resolves with backslashes; the pattern is written in POSIX form.
  return ALL_WALLETS_BUTTON_MODULE.test(filePath.replace(/\\/g, '/'));
}

module.exports = { ALL_WALLETS_BUTTON_STUB, isAllWalletsButtonModule };
