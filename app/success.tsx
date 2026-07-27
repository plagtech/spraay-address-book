/**
 * SUCCESS — spec §3.5 / §2 step 7.
 *
 * Reached only after `SprayTokenExecuted` was decoded from the receipt, so the figures
 * shown here are the CONTRACT's account of what happened, not what the app intended to
 * send. That distinction matters: the receipt is the truth.
 *
 * Offers the two follow-ups the spec asks for — saving unknown addresses to the book,
 * and repeating the payout. Repeat pre-fills the entry screen; there is no scheduling
 * in v1 (spec §3.5).
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Linking, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { isAddress, type Address } from 'viem';

import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { Body, Display, Eyebrow, Label, Mono } from '../src/components/Text';
import { BASESCAN_TX_URL } from '../src/config/chain';
import { DEFAULT_TOKEN } from '../src/config/tokens';
import { useContacts } from '../src/contacts/useContacts';
import { colors, radii } from '../src/theme';
import { formatTokenDisplay } from '../src/tx/amounts';

const token = DEFAULT_TOKEN;
const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

interface RawSuccessParams {
  hash?: string | string[];
  total?: string | string[];
  count?: string | string[];
  fee?: string | string[];
  recipients?: string | string[];
  mode?: string | string[];
  amounts?: string | string[];
  amountPerRecipient?: string | string[];
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const toBigInt = (v: string | undefined): bigint => {
  if (!v || !/^\d+$/.test(v)) return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
};

export default function SuccessScreen() {
  const raw = useLocalSearchParams() as RawSuccessParams;
  const { contacts } = useContacts();

  const hash = one(raw.hash) ?? '';
  const total = toBigInt(one(raw.total));
  const fee = toBigInt(one(raw.fee));
  const count = Number(one(raw.count) ?? '0') || 0;

  const recipients = useMemo(
    () =>
      (one(raw.recipients) ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter((a): a is Address => isAddress(a)),
    [raw.recipients],
  );

  /** Spec §3.5: offer to save anyone who isn't already in the book. */
  const unsaved = useMemo(() => {
    const known = new Set(contacts.map((c) => c.address.toLowerCase()));
    return recipients.filter((a) => !known.has(a.toLowerCase()));
  }, [contacts, recipients]);

  const repeat = () => {
    const params: Record<string, string> = {
      prefill: recipients.join(','),
    };
    router.replace({ pathname: '/pay', params });
  };

  return (
    <Screen>
      <SprayAnimation />

      <View style={styles.headline}>
        <Display style={styles.amount}>
          ${formatTokenDisplay(total, token.decimals)}
        </Display>
        <Body style={styles.sub}>
          sent to {count} {count === 1 ? 'person' : 'people'}
        </Body>
        {fee > 0n ? (
          <Body style={styles.fee}>
            includes ${formatTokenDisplay(fee, token.decimals)} protocol fee
          </Body>
        ) : null}
      </View>

      {hash ? (
        <View style={styles.hashCard}>
          <Label style={styles.hashLabel}>Transaction</Label>
          <Mono style={styles.hash}>{shortAddress(hash)}</Mono>
          <Button
            title="View on Basescan ↗"
            variant="secondary"
            size="sm"
            style={styles.hashAction}
            onPress={() => {
              void Linking.openURL(BASESCAN_TX_URL(hash));
            }}
          />
        </View>
      ) : null}

      {unsaved.length > 0 ? (
        <>
          <Eyebrow style={styles.eyebrow}>Save these people to your book</Eyebrow>
          <View style={styles.card}>
            {unsaved.map((address, i) => (
              <View
                key={address}
                style={[styles.saveRow, i === unsaved.length - 1 && styles.saveRowLast]}
              >
                <Mono style={styles.saveAddress}>{shortAddress(address)}</Mono>
                <Button
                  title="Save"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    router.push({ pathname: '/contact', params: { address } })
                  }
                />
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Button
        title="Repeat this payout"
        variant="secondary"
        block
        style={styles.repeat}
        disabled={recipients.length === 0}
        onPress={repeat}
      />

      <Button
        title="Done"
        variant="primary"
        size="lg"
        block
        style={styles.done}
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}

/**
 * The 💧 spray from the gifts prototype. Deliberately built on the core Animated API —
 * a reanimated dependency for one celebratory flourish would be a native module, and a
 * new native module means every tester needs a fresh dev build.
 */
function SprayAnimation() {
  const drops = useRef(
    [0, 1, 2, 3, 4].map(() => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const animations = drops.map((value, i) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 900,
        delay: i * 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    Animated.stagger(60, animations).start();
  }, [drops]);

  return (
    <View style={styles.spray} accessibilityElementsHidden importantForAccessibility="no">
      {drops.map((value, i) => {
        /** Fan the drops out from centre, arcing down as they fade. */
        const offset = (i - 2) * 34;
        return (
          <Animated.Text
            key={i}
            style={[
              styles.drop,
              {
                opacity: value.interpolate({
                  inputRange: [0, 0.7, 1],
                  outputRange: [0, 1, 0.85],
                }),
                transform: [
                  {
                    translateX: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, offset],
                    }),
                  },
                  {
                    translateY: value.interpolate({
                      inputRange: [0, 0.6, 1],
                      outputRange: [10, -14, 0],
                    }),
                  },
                  {
                    scale: value.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.4, 1.15, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            💧
          </Animated.Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  spray: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  drop: { fontSize: 26, position: 'absolute' },
  headline: { alignItems: 'center', marginTop: 6 },
  amount: { fontSize: 40, color: colors.ink },
  sub: { fontSize: 15, color: colors.muted, marginTop: 6 },
  fee: { fontSize: 12.5, color: colors.faint, marginTop: 4 },
  hashCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 16,
    marginTop: 22,
    alignItems: 'center',
  },
  hashLabel: { fontSize: 12.5, color: colors.faint },
  hash: { fontSize: 14, color: colors.inkSoft, marginTop: 4 },
  hashAction: { marginTop: 12 },
  eyebrow: { marginTop: 24, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.xxl,
    paddingHorizontal: 16,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  saveRowLast: { borderBottomWidth: 0 },
  saveAddress: { fontSize: 13, color: colors.muted },
  repeat: { marginTop: 22 },
  done: { marginTop: 10 },
});
