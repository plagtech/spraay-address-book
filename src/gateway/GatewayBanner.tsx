/**
 * "Ping on app start, show a banner if unhealthy" — spec §1.4.
 *
 * Deliberately non-blocking and quiet: an unhealthy gateway degrades address checking
 * and the gas hint, but the wallet, the Base RPC and the contract are all independent
 * of it. Overstating this as an outage would be wrong.
 */
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { Body, Label } from '../components/Text';
import { colors, radii } from '../theme';
import { checkHealth } from './endpoints';

export function useGatewayHealth(): { isUnhealthy: boolean } {
  const query = useQuery({
    queryKey: ['gateway-health'],
    staleTime: 2 * 60_000,
    retry: 1,
    queryFn: checkHealth,
  });

  /**
   * Only an explicit unhealthy answer or a failed ping counts. While the ping is in
   * flight we say nothing — a banner that flashes on every cold start trains users to
   * ignore it.
   */
  return { isUnhealthy: query.isError || query.data === false };
}

export function GatewayBanner() {
  const { isUnhealthy } = useGatewayHealth();

  if (!isUnhealthy) return null;

  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Label style={styles.title}>Address checking is offline</Label>
      <Body style={styles.body}>
        We can't double-check addresses right now. Your wallet and payments still work —
        just be extra sure the addresses are right.
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.fill,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 14,
  },
  title: { color: colors.inkSoft, fontSize: 14 },
  body: { color: colors.muted, fontSize: 12.5, marginTop: 3, lineHeight: 18 },
});
