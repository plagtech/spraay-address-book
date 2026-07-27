/**
 * RECEIPT — detail for one past send.
 *
 * Shows the full per-person breakdown, which is on-device data the sender already owns.
 * The SHARE button is narrower on purpose: shared text carries no addresses and no
 * names. See `receipt.ts` for why.
 */
import { useState } from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { Body, Display, Eyebrow, Label, Mono } from '../src/components/Text';
import { BASESCAN_TX_URL } from '../src/config/chain';
import { formatReceipt, formatReceiptDate } from '../src/history/receipt';
import { useHistory } from '../src/history/useHistory';
import { colors, radii } from '../src/theme';
import { formatTokenDisplay } from '../src/tx/amounts';

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function ReceiptScreen() {
  const params = useLocalSearchParams() as { id?: string | string[] };
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { findById, isLoading } = useHistory();
  const record = id ? findById(id) : undefined;
  const [shareError, setShareError] = useState<string | undefined>();

  if (isLoading) {
    return (
      <Screen>
        <Header />
        <Body style={styles.stateText}>Loading…</Body>
      </Screen>
    );
  }

  if (!record) {
    return (
      <Screen>
        <Header />
        <View style={styles.missing}>
          <Label style={styles.missingTitle}>Receipt not found</Label>
          <Body style={styles.missingBody}>
            This payment isn’t in your history on this device.
          </Body>
        </View>
      </Screen>
    );
  }

  const people = record.recipientCount === 1 ? 'person' : 'people';

  const share = async () => {
    setShareError(undefined);
    try {
      await Share.share({ message: formatReceipt(record) });
    } catch {
      setShareError("Couldn't open the share sheet. Try again.");
    }
  };

  return (
    <Screen>
      <Header />

      <View style={styles.headline}>
        <Display style={styles.amount}>
          ${formatTokenDisplay(record.total, record.decimals)}
        </Display>
        <Body style={styles.sub}>
          to {record.recipientCount} {people} · {formatReceiptDate(record.sentAt)}
        </Body>
        {record.fee > 0n ? (
          <Body style={styles.fee}>
            includes ${formatTokenDisplay(record.fee, record.decimals)} protocol fee
          </Body>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button title="Share receipt" variant="accent" onPress={() => void share()} />
        <Button
          title="Basescan ↗"
          variant="secondary"
          onPress={() => {
            void Linking.openURL(BASESCAN_TX_URL(record.hash));
          }}
        />
      </View>

      {shareError ? (
        <Body style={styles.error} accessibilityRole="alert">
          {shareError}
        </Body>
      ) : null}

      <Eyebrow style={styles.eyebrow}>
        Who was paid ({record.mode === 'equal' ? 'same amount each' : 'custom amounts'})
      </Eyebrow>
      <View style={styles.card}>
        {record.recipients.map((r, i) => (
          <View
            key={`${r.address}-${i}`}
            style={[styles.row, i === record.recipients.length - 1 && styles.rowLast]}
          >
            <View style={styles.rowBody}>
              {r.name ? <Label style={styles.rowName}>{r.name}</Label> : null}
              <Mono style={styles.rowAddress}>{shortAddress(r.address)}</Mono>
            </View>
            <Label style={styles.rowAmount}>
              ${formatTokenDisplay(r.amount, record.decimals)}
            </Label>
          </View>
        ))}
      </View>

      <Eyebrow style={styles.eyebrow}>Transaction</Eyebrow>
      <View style={styles.card}>
        <Mono style={styles.hash}>{record.hash}</Mono>
      </View>

      <Body style={styles.footnote}>
        Shared receipts include the date, the number of people, the total and the
        transaction link — never wallet addresses.
      </Body>
    </Screen>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Display style={styles.title}>Receipt</Display>
      <Button title="Back" variant="link" onPress={() => router.back()} />
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
  headline: { alignItems: 'center', marginTop: 12 },
  amount: { fontSize: 36, color: colors.ink },
  sub: { fontSize: 14, color: colors.muted, marginTop: 6, textAlign: 'center' },
  fee: { fontSize: 12.5, color: colors.faint, marginTop: 4 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  error: { color: colors.danger, fontSize: 12.5, marginTop: 10, textAlign: 'center' },
  eyebrow: { marginTop: 24, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.xxl,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowLast: { borderBottomWidth: 0 },
  rowBody: { flex: 1 },
  rowName: { fontSize: 14, color: colors.ink },
  rowAddress: { fontSize: 12.5, marginTop: 2 },
  rowAmount: { fontSize: 14.5, color: colors.inkSoft },
  hash: { fontSize: 11.5, color: colors.muted, paddingVertical: 10, lineHeight: 17 },
  stateText: { color: colors.muted, fontSize: 14, paddingVertical: 18 },
  missing: {
    backgroundColor: colors.fill,
    borderRadius: radii.xl,
    padding: 18,
    marginTop: 14,
  },
  missingTitle: { color: colors.ink, fontSize: 15 },
  missingBody: { color: colors.muted, fontSize: 13.5, marginTop: 6, lineHeight: 20 },
  footnote: {
    fontSize: 11.5,
    color: colors.faint,
    lineHeight: 17,
    marginTop: 22,
    textAlign: 'center',
  },
});
