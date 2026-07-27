/**
 * Chain-switch handling (spec §2: "chain-switch to Base (8453) if connected elsewhere").
 *
 * Renders nothing when the wallet is on Base. When it's connected to any other chain
 * this shows a blocking-looking banner with a one-tap switch, and surfaces rejection
 * without crashing.
 */
import { StyleSheet, View } from 'react-native';

import { colors, radii } from '../theme';
import { Button } from '../components/Button';
import { Body, Label } from '../components/Text';
import { useWallet } from './useWallet';

export function NetworkBanner() {
  const { isWrongNetwork, chainId, switchToBase, isSwitching, switchError } = useWallet();

  if (!isWrongNetwork) return null;

  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={styles.row}>
        <View style={styles.copy}>
          <Label style={styles.title}>Wrong network</Label>
          <Body style={styles.body}>
            Your wallet is on chain {chainId ?? 'unknown'}. Spraay sends on Base.
          </Body>
        </View>
        <Button
          title="Switch"
          size="sm"
          variant="accent"
          loading={isSwitching}
          onPress={() => {
            void switchToBase();
          }}
        />
      </View>
      {switchError ? <Body style={styles.error}>{switchError}</Body> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.warnSoft,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.warn,
    padding: 12,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: { flex: 1 },
  title: { color: '#92400E', fontSize: 14.5 },
  body: { color: '#92400E', fontSize: 13, marginTop: 2 },
  error: { color: colors.danger, fontSize: 12.5, marginTop: 8 },
});
