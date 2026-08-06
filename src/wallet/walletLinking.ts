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
 * wallet. A `metamask://` intent has no browser to lose to.
 *
 * This module used to cover Base App as well. It no longer does, and the reason is worth
 * keeping: no link format was ever going to work there. Base App pairs over the Coinbase
 * Wallet Mobile SDK and never ingests a `wc:` uri, so both formats "worked" at launching
 * it and neither could produce an approval. It now connects through
 * `coinbaseConnector.ts`, which does not route through `Linking.openURL` at all.
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
 * Kept as `wallet-diag` after the diagnostics modules came out. The tag no longer groups
 * this with relay-frame logging, but it is what every note, log capture and support
 * thread greps for, and renaming it would strand all of them to no benefit.
 *
 * These lines stay in shipping builds on purpose: which link format opened the wallet is
 * the first question when a pairing fails on someone else's handset.
 */
const tag = (msg: string) => `[wallet-diag link] ${msg}`;

/** Which link FORMAT opened the wallet, independent of which was tried first. */
export type LaunchVariant = 'scheme' | 'universal' | 'passthrough';

export type LaunchRecord = {
  variant: LaunchVariant;
  /** Whether the winning variant was the first choice or the fallback. */
  position: 'primary' | 'fallback';
  /** The URL that actually opened, or the last one attempted if all failed. */
  url: string;
  /** Set when an earlier attempt failed before this one succeeded. */
  primaryError?: string;
  atMs: number;
};

type Attempt = { variant: Exclude<LaunchVariant, 'passthrough'>; url: string };

let lastLaunch: LaunchRecord | undefined;

/**
 * No UI reads this since the Diagnostics panel was removed — it is kept as a debugger
 * handle, because the launch record is the one piece of state that says which format
 * won and it costs nothing to hold.
 */
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
 * Decide the order to try the two link formats in.
 *
 * A list rather than an if/else pair: it kept the `baseUniversalFirst` A/B down to one
 * `reverse()`, and it still earns its place — the loop below reports position
 * (primary/fallback) and per-attempt errors uniformly however many formats there are.
 * Scheme-first is the shipping order for every wallet in `WALLET_LINK_FALLBACKS`.
 */
function planAttempts(url: string, scheme: string, universalBase: string): Attempt[] {
  return [
    { variant: 'scheme', url },
    { variant: 'universal', url: toFallbackUrl(url, scheme, universalBase) },
  ];
}

/**
 * Install the wrapper.
 *
 * Exported for clarity, but the side-effect call at the bottom of this module is what
 * actually runs it — `_layout.tsx` imports this module bare so the wrapper is installed
 * before anything can import AppKit and capture the unwrapped `Linking.openURL`.
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
      lastLaunch = {
        variant: 'passthrough',
        position: 'primary',
        url,
        atMs: Date.now(),
      };
      return original(url);
    }

    const [scheme, universalBase] = match;
    const attempts = planAttempts(url, scheme, universalBase);

    /**
     * Announce the plan BEFORE launching, not after. The app is backgrounded the instant
     * the wallet opens, and on a slow handoff the success line can land after the log has
     * already been scrolled past — so which format was sent has to be recorded first.
     */
    console.log(
      tag(`${scheme} — trying ${attempts.map((a) => a.variant).join(' then ')}`),
    );

    let primaryError: string | undefined;

    for (let i = 0; i < attempts.length; i += 1) {
      const attempt = attempts[i]!;
      const position = i === 0 ? 'primary' : 'fallback';

      try {
        const result = await original(attempt.url);
        lastLaunch = {
          variant: attempt.variant,
          position,
          url: attempt.url,
          primaryError,
          atMs: Date.now(),
        };
        console.log(
          tag(
            `PATH=${attempt.variant} (${position}) — opened${
              primaryError ? ` after the ${attempts[0]!.variant} attempt failed` : ''
            }`,
          ),
        );
        return result;
      } catch (err) {
        const message = describeError(err);
        const isLast = i === attempts.length - 1;

        if (!isLast) {
          primaryError = message;
          console.warn(
            tag(
              `PATH=${attempt.variant} (${position}) threw (${message}); ` +
                `falling back to ${attempts[i + 1]!.variant}`,
            ),
          );
          continue;
        }

        lastLaunch = {
          variant: attempt.variant,
          position,
          url: attempt.url,
          primaryError,
          atMs: Date.now(),
        };
        console.warn(
          tag(
            `PATH=none — every variant failed. ` +
              `${attempts[0]!.variant}: ${primaryError ?? 'n/a'} | ${attempt.variant}: ${message}`,
          ),
        );
        /**
         * Rethrow the LAST error. AppKit converts whatever arrives into its generic
         * LINKING_ERROR, and the final failure is the stronger signal — an unregistered
         * scheme throws cheaply, but exhausting every format means the wallet is
         * genuinely unreachable.
         */
        throw err;
      }
    }

    /** Unreachable: the loop either returns or throws. Satisfies the type checker. */
    throw new Error('walletLinking: no launch attempts were planned');
  };

  console.log(
    tag(
      `installed — native-scheme-first for [${Object.keys(WALLET_LINK_FALLBACKS).join(', ')}]`,
    ),
  );
}

/** Runs on import, so the ordering in `_layout.tsx` is what determines wrapper nesting. */
installWalletLinking();
