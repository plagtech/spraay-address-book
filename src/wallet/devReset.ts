/**
 * Clear WalletConnect / AppKit persisted state. TEMPORARY diagnostic tooling.
 *
 * ── Why this is needed ───────────────────────────────────────────────────────────
 * A `batchSubscribe` on connect showed ~8 topics carried over from earlier debug runs.
 * WalletConnect never garbage-collects pairings that were created but never settled, so
 * every failed attempt leaves another dead mailbox that the client re-subscribes to on
 * the next launch. That makes "did the wallet subscribe to OUR topic" much harder to
 * read, and stale mailboxes are a known confuser for wallet-side clients.
 *
 * ── Which keys are WalletConnect's ───────────────────────────────────────────────
 * Verified against the installed packages (@walletconnect/core 2.21.10), not assumed:
 *
 *   wc@2:core:0.3:*     pairing, keychain, messages, subscription, expirer, history
 *   wc@2:client:0.3:*   sign-client sessions and proposals
 *   WALLETCONNECT_CLIENT_ID
 *   WALLETCONNECT_LINK_MODE_APPS
 *   WALLETCONNECT_DEEPLINK_CHOICE   ← the wallet the app last handed off to
 *
 * The `wc@2:` keys may appear BARE or wrapped in this app's `@spraay/wallet:` prefix:
 * `WalletConnectConnector` passes AppKit's storage adapter straight to
 * `UniversalProvider.init`, so core writes through `storage.ts` and inherits its prefix.
 * Matching on a substring rather than a leading anchor covers both layouts.
 *
 * ── Safety ───────────────────────────────────────────────────────────────────────
 * This deletes by ALLOWLIST, never by denylist. Contacts (`spraay.contacts.v1`), history
 * (`spraay.history.v1`) and the dev flags (`spraay.dev.*`) match none of the patterns
 * below, so no amount of resetting can take a user's address book with it. Every key
 * examined is logged with its verdict, so the allowlist is auditable from the run itself.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** A key is WalletConnect-owned if it matches ANY of these. */
const WC_PATTERNS: readonly RegExp[] = [
  /wc@2:/,
  /^@spraay\/wallet:/,
  /WALLETCONNECT_/,
];

const isWalletConnectKey = (key: string) => WC_PATTERNS.some((p) => p.test(key));

/** Rough classification, only so the log reads usefully. */
function classify(key: string): string {
  if (/keychain/i.test(key)) return 'keychain';
  if (/pairing/i.test(key)) return 'pairing';
  if (/session/i.test(key)) return 'session';
  if (/proposal/i.test(key)) return 'proposal';
  if (/subscription/i.test(key)) return 'subscription';
  if (/messages/i.test(key)) return 'messages';
  if (/expirer/i.test(key)) return 'expirer';
  if (/history/i.test(key)) return 'history';
  if (/DEEPLINK_CHOICE/.test(key)) return 'deeplink-choice';
  return 'other';
}

export type ResetReport = {
  scanned: number;
  removed: string[];
  kept: string[];
  byCategory: Record<string, number>;
};

/**
 * Inspect storage without changing it. Run this BEFORE a reset to see what a connect
 * attempt is actually starting from — the count of live pairings is the number this is
 * meant to drive to zero.
 */
export async function inspectWalletStorage(): Promise<ResetReport> {
  const keys = await AsyncStorage.getAllKeys();
  const removed: string[] = [];
  const kept: string[] = [];
  const byCategory: Record<string, number> = {};

  for (const key of keys) {
    if (isWalletConnectKey(key)) {
      removed.push(key);
      const cat = classify(key);
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    } else {
      kept.push(key);
    }
  }

  return { scanned: keys.length, removed, kept, byCategory };
}

/**
 * Delete every WalletConnect-owned key.
 *
 * Returns the report so a caller can show the counts; also logs each key, because when
 * the next connect still fails the first question is always "did this actually clear?"
 */
export async function clearWalletConnectStorage(): Promise<ResetReport> {
  const report = await inspectWalletStorage();

  console.log(
    `[dev-reset] scanned ${report.scanned} keys — ` +
      `${report.removed.length} WalletConnect-owned, ${report.kept.length} untouched`,
  );
  console.log(`[dev-reset] by category: ${JSON.stringify(report.byCategory)}`);

  for (const key of report.removed) {
    console.log(`[dev-reset]   REMOVING [${classify(key)}] ${key}`);
  }
  /**
   * Log what survives too. This is the line that proves contacts and history were never
   * in scope, which is worth having in the transcript rather than trusting the regex.
   */
  for (const key of report.kept) {
    console.log(`[dev-reset]   keeping  ${key}`);
  }

  if (report.removed.length > 0) {
    await AsyncStorage.multiRemove(report.removed);
  }

  /**
   * Verify rather than assume. `multiRemove` can partially fail, and a reset that
   * silently left three pairings behind would send the next debugging round down a
   * false trail.
   */
  const after = await inspectWalletStorage();
  if (after.removed.length > 0) {
    console.warn(
      `[dev-reset] INCOMPLETE — ${after.removed.length} WalletConnect keys survived: ` +
        `${after.removed.join(', ')}`,
    );
  } else {
    console.log('[dev-reset] verified clean — no WalletConnect keys remain');
  }

  /**
   * The app must be relaunched. The live `Core` instance holds its pairings and keychain
   * in memory and will happily write them all back on the next publish, which would
   * undo this within seconds.
   */
  console.log('[dev-reset] RESTART THE APP before the next connect attempt');

  return report;
}
