/**
 * Dev-only experiment toggles. TEMPORARY — and the condition for removing them is now MET:
 * MetaMask pairs from `metamask://` and Trust from its universal link, both verified on
 * device. This file, `diagnostics.ts`, `devReset.ts` and `proposalCapture.ts` are all
 * eligible to come out.
 *
 * They are kept for now only because Base App is still unsolved and a future Mobile Wallet
 * Protocol integration is the obvious next consumer of this instrumentation. That is a
 * reason to schedule the deletion, not to leave it unstated — nothing here ships value to
 * a user.
 *
 * These exist so an experiment can be flipped ON A BUILT APK without a rebuild. Every
 * flag defaults to OFF, so a fresh install reproduces the shipping behaviour exactly —
 * which is what keeps the Trust Wallet path a valid reference while experiments run.
 *
 * Stored under a `spraay.dev.` key on purpose: `devReset` only deletes WalletConnect-
 * owned keys, so clearing pairings never silently resets the experiment you are running.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const FLAGS_KEY = 'spraay.dev.flags.v1';

export type DevFlags = {
  /**
   * Force `eip155` into the proposal's `requiredNamespaces`.
   *
   * Default OFF reproduces AppKit's stock behaviour, which sends an OPTIONAL-ONLY
   * proposal — see `proposalCapture.ts` for why that is worth testing against.
   */
  forceRequiredNamespaces: boolean;

  /** Log the full decrypted proposal and every inbound frame. Cheap; safe to leave on. */
  captureProposals: boolean;

  /**
   * `baseUniversalFirst` USED TO LIVE HERE and is gone deliberately, not mislaid.
   *
   * It A/B'd Base App's `cbwallet://` scheme against its universal link. The experiment
   * answered its question by being made irrelevant: Base App does not ingest a `wc:` uri in
   * EITHER format, because it pairs over the Coinbase Wallet Mobile SDK. Base no longer
   * passes through `Linking.openURL` at all, so there is no order left to flip — see
   * `coinbaseConnector.ts`.
   */
};

const DEFAULTS: DevFlags = {
  forceRequiredNamespaces: false,
  captureProposals: true,
};

/**
 * Read synchronously from a cache so the connect path never has to await storage.
 * `loadDevFlags()` populates it during startup, long before any wallet is tapped.
 */
let cached: DevFlags = { ...DEFAULTS };

export const getDevFlags = (): DevFlags => cached;

export async function loadDevFlags(): Promise<DevFlags> {
  try {
    const raw = await AsyncStorage.getItem(FLAGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DevFlags>;
      /** Merge over defaults so a flag added later does not read as `undefined`. */
      cached = { ...DEFAULTS, ...parsed };
    }
  } catch {
    cached = { ...DEFAULTS };
  }
  console.log(`[dev-flags] loaded ${JSON.stringify(cached)}`);
  return cached;
}

export async function setDevFlag<K extends keyof DevFlags>(
  key: K,
  value: DevFlags[K],
): Promise<DevFlags> {
  cached = { ...cached, [key]: value };
  await AsyncStorage.setItem(FLAGS_KEY, JSON.stringify(cached));
  console.log(`[dev-flags] ${String(key)} = ${String(value)}`);
  return cached;
}
