/**
 * STEP 1 SCREEN — wallet connect smoke test.
 *
 * This route becomes the Address Book (spec §3.1) in build step 2; the wallet controls
 * below move to Settings (spec §3.6). Everything it renders comes from `useWallet`, so
 * that move is a copy-paste, not a rewrite.
 */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { Body, Display, Eyebrow, Label, Mono } from '../src/components/Text';
import { BASE_CHAIN_ID, SPRAY_CONTRACT_ADDRESS } from '../src/config/chain';
import { HAS_REOWN_PROJECT_ID } from '../src/config/env';
import { DEFAULT_TOKEN } from '../src/config/tokens';
import { NetworkBanner } from '../src/wallet/NetworkBanner';
import { useWallet } from '../src/wallet/useWallet';

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function WalletScreen() {
  const { address, isConnected, chainId, isOnBase, connect, openAccount, disconnect } =
    useWallet();

  return (
    <Screen>
      <View style={styles.header}>
        <Display style={styles.wordmark}>
          spraay<Display style={styles.wordmarkAccent}> book</Display>
        </Display>
        <View style={styles.chip}>
          <Label style={styles.chipText}>{DEFAULT_TOKEN.label} · Base</Label>
        </View>
      </View>

      <NetworkBanner />

      {!HAS_REOWN_PROJECT_ID ? (
        <View style={styles.setupCard} accessibilityRole="alert">
          <Label style={styles.setupTitle}>Wallet connect not configured</Label>
          <Body style={styles.setupBody}>
            Add a Reown project id to <Mono style={styles.inlineMono}>.env</Mono> as{' '}
            <Mono style={styles.inlineMono}>EXPO_PUBLIC_REOWN_PROJECT_ID</Mono>, then
            restart the dev server. See README → Setup.
          </Body>
        </View>
      ) : null}

      <Eyebrow style={styles.eyebrow}>Your wallet</Eyebrow>

      {isConnected ? (
        <View style={styles.card}>
          <Label style={styles.cardLabel}>Connected</Label>
          <Mono style={styles.address}>{address ? shortAddress(address) : '—'}</Mono>
          <Body style={styles.meta}>
            {isOnBase ? 'Base mainnet' : `Chain ${chainId ?? 'unknown'}`} · you keep your
            keys
          </Body>
          <View style={styles.actions}>
            <Button title="Wallet details" variant="secondary" onPress={openAccount} />
            <Button title="Disconnect" variant="secondary" onPress={disconnect} />
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Label style={styles.cardLabel}>Not connected</Label>
          <Body style={styles.meta}>
            Connect the wallet you already use. Spraay never holds your funds — it
            prepares payments that you approve and sign yourself.
          </Body>
          <Button
            title="Connect wallet"
            variant="accent"
            size="lg"
            block
            style={styles.connectButton}
            disabled={!HAS_REOWN_PROJECT_ID}
            onPress={connect}
          />
        </View>
      )}

      <Button
        title="Pay people →"
        variant="primary"
        size="lg"
        block
        style={styles.payButton}
        disabled={!isConnected}
        onPress={() => router.push('/pay')}
      />

      <Eyebrow style={styles.eyebrow}>Build check</Eyebrow>
      <View style={styles.card}>
        <Body style={styles.factRow}>
          Network: Base <Mono style={styles.inlineMono}>{BASE_CHAIN_ID}</Mono>
        </Body>
        <Body style={styles.factRow}>
          Contract: <Mono style={styles.inlineMono}>{shortAddress(SPRAY_CONTRACT_ADDRESS)}</Mono>
        </Body>
        <Body style={styles.factRow}>
          Token: <Mono style={styles.inlineMono}>{shortAddress(DEFAULT_TOKEN.address)}</Mono>{' '}
          ({DEFAULT_TOKEN.decimals} decimals)
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  wordmark: { fontSize: 25 },
  wordmarkAccent: { fontSize: 25, color: '#0EA5E9' },
  chip: {
    backgroundColor: '#F2F4F7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chipText: { fontSize: 12, color: '#667085' },
  eyebrow: { marginTop: 20, marginBottom: 8 },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#EAECF0',
    borderRadius: 18,
    padding: 16,
  },
  cardLabel: { fontSize: 13, color: '#98A2B3', marginBottom: 4 },
  address: { fontSize: 17, color: '#101828', marginBottom: 6 },
  meta: { fontSize: 13.5, color: '#667085', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  connectButton: { marginTop: 16 },
  payButton: { marginTop: 22 },
  setupCard: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#D92D20',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  setupTitle: { color: '#7F1D1D', fontSize: 14.5 },
  setupBody: { color: '#7F1D1D', fontSize: 13, marginTop: 4, lineHeight: 19 },
  inlineMono: { fontSize: 12.5, color: '#344054' },
  factRow: { fontSize: 13.5, color: '#344054', marginBottom: 4 },
});
