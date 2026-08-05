/**
 * Dev-only experiment toggles. TEMPORARY — remove with the rest of the wallet
 * diagnostics once MetaMask pairing is resolved.
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
   * Reverse Base App's launch order: universal link FIRST, `cbwallet://` as the fallback.
   *
   * The A/B this exists for. Base App now launches from the scheme and still shows no
   * approval prompt, which is the symptom class MetaMask had — and until the routing fix
   * in a004088 the tap never fired a link at all, so the universal link was never
   * genuinely tested from inside the app. Its earlier "working" evidence is all from
   * tapping a link outside the app, which is a different code path in the wallet.
   *
   * Flipping the order tells us whether Base App's WalletConnect handler ingests one
   * format and not the other, or neither — which separates a link-format fault from a
   * proposal fault. Default OFF keeps the shipping order.
   *
   * Base only. MetaMask pairs from its scheme and Trust from its universal link; both are
   * working references and neither is touched by this flag.
   */
  baseUniversalFirst: boolean;
};

const DEFAULTS: DevFlags = {
  forceRequiredNamespaces: false,
  captureProposals: true,
  baseUniversalFirst: false,
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
