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
import { useWallet } from '../src/wallet/useWallet';

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

      <Body style={styles.disclosure}>
        Spraay is a non-custodial sending tool. Your funds stay in your own wallet at all
        times; Spraay prepares group transactions that you approve and sign yourself. We
        cannot access, hold, freeze, or recover your funds.
      </Body>
    </Screen>
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
