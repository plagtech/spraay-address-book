/**
 * SETTINGS — spec §3.6.
 *
 * Wallet, network, contact export, version, and the support links.
 *
 * Export uses React Native's built-in Share with the CSV as text rather than writing a
 * file: expo-file-system + expo-sharing would be two new NATIVE modules, and adding a
 * native module invalidates every tester's dev client. Text sharing reaches mail, notes
 * and messaging apps, which covers "get my contacts off this phone".
 */
import { useState } from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';

import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { Body, Display, Eyebrow, Label, Mono } from '../src/components/Text';
import { BASE_CHAIN_ID } from '../src/config/chain';
import { SUPPORT_EMAIL, WEBSITE_URL } from '../src/config/env';
import { toCsv } from '../src/contacts/csv';
import { useContacts } from '../src/contacts/useContacts';
import { colors, radii } from '../src/theme';
import { getDevFlags, setDevFlag } from '../src/wallet/devFlags';
import { clearWalletConnectStorage, inspectWalletStorage } from '../src/wallet/devReset';
import { diffCaptures } from '../src/wallet/proposalCapture';
import { useWallet } from '../src/wallet/useWallet';
import { getLastLaunch } from '../src/wallet/walletLinking';

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function SettingsScreen() {
  const { address, isConnected, isOnBase, chainId, connect, openAccount, disconnect } =
    useWallet();
  const { contacts } = useContacts();
  const [exportError, setExportError] = useState<string | undefined>();

  const version =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown';

  const exportContacts = async () => {
    setExportError(undefined);
    if (contacts.length === 0) return;
    try {
      await Share.share({
        title: 'Spraay contacts',
        message: toCsv(contacts),
      });
    } catch {
      setExportError("Couldn't open the share sheet. Try again.");
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Display style={styles.title}>Settings</Display>
        <Button title="Back" variant="link" onPress={() => router.back()} />
      </View>

      <Eyebrow style={styles.eyebrow}>Wallet</Eyebrow>
      <View style={styles.card}>
        {isConnected && address ? (
          <>
            <Label style={styles.cardLabel}>Connected</Label>
            <Mono style={styles.address}>{shortAddress(address)}</Mono>
            <View style={styles.networkRow}>
              <View
                style={[styles.dot, isOnBase ? styles.dotOn : styles.dotOff]}
              />
              <Body style={styles.meta}>
                {isOnBase ? `Base · ${BASE_CHAIN_ID}` : `Chain ${chainId ?? 'unknown'}`}
              </Body>
            </View>
            <View style={styles.actions}>
              <Button title="Wallet details" variant="secondary" onPress={openAccount} />
              <Button title="Disconnect" variant="secondary" onPress={disconnect} />
            </View>
          </>
        ) : (
          <>
            <Label style={styles.cardLabel}>Not connected</Label>
            <Body style={styles.meta}>
              Spraay never holds your funds. It prepares payments that you approve and
              sign yourself.
            </Body>
            <Button
              title="Connect wallet"
              variant="accent"
              block
              style={styles.connect}
              onPress={connect}
            />
          </>
        )}
      </View>

      <Eyebrow style={styles.eyebrow}>Your book</Eyebrow>
      <View style={styles.card}>
        <Body style={styles.meta}>
          {contacts.length === 0
            ? 'No contacts saved yet.'
            : `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}, stored only on this phone.`}
        </Body>
        <Button
          title="Export contacts"
          variant="secondary"
          style={styles.exportButton}
          disabled={contacts.length === 0}
          onPress={() => void exportContacts()}
        />
        {exportError ? (
          <Body style={styles.error} accessibilityRole="alert">
            {exportError}
          </Body>
        ) : null}
      </View>

      <Eyebrow style={styles.eyebrow}>About</Eyebrow>
      <View style={styles.card}>
        <Row label="Version" value={String(version)} />
        <Row label="Network" value="Base mainnet" />
        <View style={styles.links}>
          <Button
            title="spraay.app ↗"
            variant="link"
            onPress={() => {
              void Linking.openURL(WEBSITE_URL);
            }}
          />
          <Button
            title="Contact support"
            variant="link"
            onPress={() => {
              void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
            }}
          />
        </View>
      </View>

      <WalletDiagnosticsPanel />

      <Body style={styles.disclosure}>
        Spraay is a non-custodial sending tool. Your funds stay in your own wallet at all
        times; Spraay prepares group transactions that you approve and sign yourself. We
        cannot access, hold, freeze, or recover your funds.
      </Body>
    </Screen>
  );
}

/**
 * TEMPORARY — wallet-connect diagnostics. Remove together with `src/wallet/diagnostics.ts`,
 * `devReset.ts`, `devFlags.ts` and `proposalCapture.ts` once MetaMask pairing is resolved.
 *
 * NOT `src/wallet/walletLinking.ts`, despite the "Last launch" button reading from it.
 * That module is the shipping native-scheme-first launch path, not instrumentation —
 * deleting it would silently revert Base to universal links. Drop the button, keep it.
 *
 * Deliberately NOT gated on `__DEV__`: testing happens on installed EAS builds, where
 * `__DEV__` is false and a gated panel would never appear. `diagnostics.ts` already ships
 * in every build for the same reason, so these come out together.
 */
function WalletDiagnosticsPanel() {
  const [status, setStatus] = useState<string | undefined>();
  const [forceRequired, setForceRequired] = useState(getDevFlags().forceRequiredNamespaces);
  const [baseUniversalFirst, setBaseUniversalFirst] = useState(
    getDevFlags().baseUniversalFirst,
  );

  const inspect = async () => {
    const r = await inspectWalletStorage();
    const cats = Object.entries(r.byCategory)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    setStatus(
      `${r.removed.length} WalletConnect keys (${cats || 'none'}); ` +
        `${r.kept.length} other keys untouched. Full list in the log.`,
    );
  };

  const reset = async () => {
    const r = await clearWalletConnectStorage();
    setStatus(
      `Cleared ${r.removed.length} keys. RESTART THE APP before connecting — the live ` +
        `client still holds these in memory and will write them back.`,
    );
  };

  const diff = async () => {
    const diffs = await diffCaptures('metamask', 'trust');
    setStatus(
      diffs.length === 0
        ? 'Proposals identical apart from keys/ids (or a capture is missing — check the log).'
        : `${diffs.length} difference(s) between the MetaMask and Trust proposals. See log.`,
    );
  };

  /**
   * Which link actually opened the wallet on the last attempt.
   *
   * The same fact is logged, but the log is only reachable over a cable — and the whole
   * point of the native-scheme change is that the failure only reproduces on a real
   * installed build. Reading it off the device is what makes it testable where it breaks.
   */
  const launch = () => {
    const l = getLastLaunch();
    if (!l) {
      setStatus('No wallet launch yet this session. Tap a wallet, then check again.');
      return;
    }
    const when = `${Math.round((Date.now() - l.atMs) / 1000)}s ago`;
    if (l.variant === 'passthrough') {
      setStatus(`Last link was not a wallet scheme (${when}) — ${l.url.split('?')[0]}`);
      return;
    }
    const order = l.reversed ? 'universal-first (experiment)' : 'scheme-first (default)';
    setStatus(
      `${l.variant === 'scheme' ? 'Native scheme' : 'Universal link'} opened the wallet ` +
        `as ${l.position} (${when}, ${order}) — ${l.url.split('?')[0]}` +
        (l.primaryError ? `. First attempt failed: ${l.primaryError}` : ''),
    );
  };

  /**
   * A/B Base App's link format. Base only — MetaMask and Trust both pair and are left on
   * their working formats, so they stay valid references while this runs.
   */
  const toggleBaseOrder = async () => {
    const next = !baseUniversalFirst;
    setBaseUniversalFirst(next);
    await setDevFlag('baseUniversalFirst', next);
    setStatus(
      next
        ? 'Base App will launch via the UNIVERSAL LINK first, cbwallet:// as fallback. ' +
            'Takes effect on the next tap — no restart needed.'
        : 'Base App back to cbwallet:// first (shipping order). Takes effect on the next tap.',
    );
  };

  const toggleRequired = async () => {
    const next = !forceRequired;
    setForceRequired(next);
    await setDevFlag('forceRequiredNamespaces', next);
    setStatus(
      next
        ? 'requiredNamespaces experiment ON. Restart the app, then connect.'
        : 'requiredNamespaces experiment OFF (stock behaviour). Restart the app.',
    );
  };

  return (
    <>
      <Eyebrow style={styles.eyebrow}>Diagnostics (temporary)</Eyebrow>
      <View style={styles.card}>
        <Body style={styles.meta}>
          Wallet pairing debug tools. These never touch contacts or history.
        </Body>
        <View style={styles.diagActions}>
          <Button title="Inspect storage" variant="secondary" onPress={() => void inspect()} />
          <Button title="Clear pairings" variant="secondary" onPress={() => void reset()} />
          <Button title="Diff proposals" variant="secondary" onPress={() => void diff()} />
          <Button title="Last launch" variant="secondary" onPress={launch} />
          <Button
            title={baseUniversalFirst ? 'Base: universal 1st' : 'Base: scheme 1st'}
            variant="secondary"
            onPress={() => void toggleBaseOrder()}
          />
          <Button
            title={forceRequired ? 'requiredNS: ON' : 'requiredNS: off'}
            variant="secondary"
            onPress={() => void toggleRequired()}
          />
        </View>
        {status ? <Body style={styles.diagStatus}>{status}</Body> : null}
      </View>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Body style={styles.rowLabel}>{label}</Body>
      <Label style={styles.rowValue}>{value}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 25 },
  eyebrow: { marginTop: 20, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.xxl,
    padding: 16,
  },
  cardLabel: { fontSize: 13, color: colors.faint, marginBottom: 4 },
  address: { fontSize: 17, color: colors.ink, marginBottom: 8 },
  networkRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: colors.success },
  dotOff: { backgroundColor: colors.warn },
  meta: { fontSize: 13.5, color: colors.muted, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  connect: { marginTop: 14 },
  exportButton: { marginTop: 12, alignSelf: 'flex-start' },
  error: { color: colors.danger, fontSize: 12.5, marginTop: 8 },
  diagActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  diagStatus: { fontSize: 12, color: colors.inkSoft, lineHeight: 18, marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.inkSoft },
  links: { marginTop: 6, alignItems: 'flex-start' },
  disclosure: {
    fontSize: 11.5,
    color: colors.faint,
    lineHeight: 17,
    marginTop: 22,
  },
});
