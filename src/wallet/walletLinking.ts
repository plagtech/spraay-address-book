/**
 * Native-scheme launch with a universal-link fallback.
 *
 * ── Why this is not just a `customWallets` edit ──────────────────────────────────
 * A `CustomWallet` carries ONE `mobile_link`. There is no primary/fallback pair in the
 * AppKit config, so "try the scheme, fall back to the universal link" cannot be
 * expressed there at all — it has to happen at the moment the link is fired.
 *
 * The obvious seam, `CoreHelperUtil.openLink`, is unusable:
 *
 *     async openLink(url) {
 *       try { await Linking.openURL(url) }
 *       catch (error) { throw new Error(ConstantsUtil.LINKING_ERROR) }   // ← real error gone
 *     }
 *
 * It swallows the underlying failure and rethrows a generic string that the UI renders
 * as "not installed". By the time AppKit's own code sees a failure there is nothing left
 * to branch on. So this wraps `Linking.openURL` — one layer BELOW `openLink` — where the
 * scheme attempt either resolves or throws for a real reason.
 *
 * ── Why a native scheme is the primary at all ────────────────────────────────────
 * WalletConnect's mobile-linking guidance is to prefer the native scheme: an https
 * universal link fired from inside an app can be claimed by the browser instead of the
 * wallet. That misroute is exactly the Base App symptom — the same link tapped from a
 * note opens the wallet, tapped from inside the app it does not. A `cbwallet://` intent
 * has no browser to lose to.
 *
 * ── Why the fallback is still worth keeping ──────────────────────────────────────
 * A scheme throws when the app is absent, and then there is nothing to show the user.
 * The universal link degrades to a real web page instead, which is the behaviour the
 * previous revision was chosen for. Keeping it as a fallback keeps that safety net
 * without letting it decide the happy path.
 *
 * ── Android package visibility does NOT apply here ───────────────────────────────
 * Checked rather than assumed, because it is the standing argument against schemes.
 * React Native 0.86's `IntentModule.openURL` builds the intent and calls `sendOSIntent`
 * directly — it never calls `resolveActivity` (IntentModule.kt:113-129). Package
 * visibility filters `resolveActivity`/`queryIntentActivities`, so it constrains
 * `canOpenURL` (IntentModule.kt:137-151) but not `openURL`. No `<queries>` block, and so
 * no manifest change and no rebuild: this is JS and lands over Metro.
 *
 * (AppKit does call `canOpenURL` via `CoreHelperUtil.checkInstalled`, but only to set an
 * `isInstalled` flag for ordering in ApiController — it never gates the tap, so a
 * visibility-filtered false there costs a badge, not a launch.)
 */
import { Linking } from 'react-native';

import { WALLET_LINK_FALLBACKS } from './wallets';

/**
 * Tagged `wallet-diag` deliberately. The launch path has to be readable in the same
 * capture as the deep link and the relay frames — a separate tag would mean the one line
 * saying WHICH link actually opened the wallet is the one line missing from the log
 * everybody collects.
 */
const tag = (msg: string) => `[wallet-diag link] ${msg}`;

export type LaunchPath = 'scheme' | 'fallback' | 'passthrough';

export type LaunchRecord = {
  path: LaunchPath;
  /** The URL that actually opened, or the last one attempted if all failed. */
  url: string;
  /** Present only when the scheme attempt failed and the fallback was tried. */
  schemeError?: string;
  atMs: number;
};

let lastLaunch: LaunchRecord | undefined;

/** Read by Settings → Diagnostics → "Last launch"; also handy from the debugger. */
export function getLastLaunch(): LaunchRecord | undefined {
  return lastLaunch;
}

/**
 * Swap a native scheme prefix for its universal base, preserving everything after it.
 *
 * `formatNativeUrl` and `formatUniversalUrl` build the identical `wc?uri=<encoded>` tail
 * (CoreHelperUtil.ts:126 and :151) — they differ only in the root. So rewriting just the
 * root reproduces byte-for-byte what AppKit would have produced had the wallet been
 * declared with its https link, and the pairing URI is never re-encoded or reparsed.
 */
function toFallbackUrl(url: string, scheme: string, universalBase: string): string {
  const tail = url.slice(scheme.length);
  const base = universalBase.endsWith('/') ? universalBase : `${universalBase}/`;
  return `${base}${tail}`;
}

function findScheme(url: string): [string, string] | undefined {
  for (const [scheme, universal] of Object.entries(WALLET_LINK_FALLBACKS)) {
    if (url.startsWith(scheme)) return [scheme, universal];
  }
  return undefined;
}

const describeError = (err: unknown) => {
  const e = err as { code?: string; message?: string };
  return `${e?.code ? `[${e.code}] ` : ''}${e?.message ?? String(err)}`;
};

/**
 * Install the wrapper.
 *
 * Exported for clarity, but the side-effect call at the bottom of this module is what
 * actually runs it — `_layout.tsx` imports this module bare, AFTER `diagnostics`, so
 * that this wrapper sits OUTSIDE the diagnostic one. A fallback then runs as two separate
 * calls through the diagnostic hook, and the capture shows the full URL, timing and
 * outcome of BOTH the scheme attempt and the fallback — rather than only the first, which
 * is the one that failed.
 */
export function installWalletLinking() {
  const flagged = globalThis as { __SPRAAY_WALLET_LINKING__?: boolean };
  if (flagged.__SPRAAY_WALLET_LINKING__) return;
  flagged.__SPRAAY_WALLET_LINKING__ = true;

  const original = Linking.openURL.bind(Linking);

  Linking.openURL = async (url: string) => {
    const match = findScheme(url);

    /** Anything that is not one of our declared schemes is none of this module's business. */
    if (!match) {
      lastLaunch = { path: 'passthrough', url, atMs: Date.now() };
      return original(url);
    }

    const [scheme, universalBase] = match;

    try {
      const result = await original(url);
      lastLaunch = { path: 'scheme', url, atMs: Date.now() };
      console.log(tag(`PATH=scheme — ${scheme} launched, no fallback needed`));
      return result;
    } catch (err) {
      const schemeError = describeError(err);
      const fallbackUrl = toFallbackUrl(url, scheme, universalBase);

      console.warn(
        tag(
          `PATH=fallback — ${scheme} threw (${schemeError}); ` +
            `retrying via universal link ${universalBase}`,
        ),
      );

      try {
        const result = await original(fallbackUrl);
        lastLaunch = { path: 'fallback', url: fallbackUrl, schemeError, atMs: Date.now() };
        console.log(tag(`PATH=fallback — universal link opened after ${scheme} failed`));
        return result;
      } catch (fallbackErr) {
        lastLaunch = { path: 'fallback', url: fallbackUrl, schemeError, atMs: Date.now() };
        console.warn(
          tag(
            `PATH=fallback — BOTH failed. scheme: ${schemeError} | ` +
              `universal: ${describeError(fallbackErr)}`,
          ),
        );
        /**
         * Rethrow the FALLBACK's error, not the scheme's. AppKit converts whatever
         * arrives into its generic LINKING_ERROR, and the universal link failing is the
         * stronger signal — a scheme can throw merely for being unregistered, but an
         * https link that will not open means the wallet is genuinely unreachable.
         */
        throw fallbackErr;
      }
    }
  };

  console.log(
    tag(
      `installed — native-scheme-first for [${Object.keys(WALLET_LINK_FALLBACKS).join(', ')}]`,
    ),
  );
}

/** Runs on import, so the ordering in `_layout.tsx` is what determines wrapper nesting. */
installWalletLinking();
