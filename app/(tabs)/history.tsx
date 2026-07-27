/**
 * HISTORY — past sends, newest first.
 *
 * Every row here is a payment that provably completed: records are written only after
 * `SprayTokenExecuted` was decoded from the receipt, so there is nothing pending or
 * failed to represent.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '../../src/components/Screen';
import { Body, Display, Label } from '../../src/components/Text';
import { useHistory } from '../../src/history/useHistory';
import { formatReceiptDate } from '../../src/history/receipt';
import type { SendRecord } from '../../src/history/types';
import { colors, radii } from '../../src/theme';
import { formatTokenDisplay } from '../../src/tx/amounts';

export default function HistoryScreen() {
  const { records, isLoading } = useHistory();

  return (
    <Screen>
      <View style={styles.header}>
        <Display style={styles.title}>History</Display>
      </View>

      {isLoading ? (
        <Body style={styles.stateText}>Loading…</Body>
      ) : records.length === 0 ? (
        <View style={styles.empty}>
          <Display style={styles.emptyTitle}>No payments yet</Display>
          <Body style={styles.emptyBody}>
            Once you send to a group, it shows up here with a receipt you can share.
          </Body>
        </View>
      ) : (
        records.map((record) => <HistoryRow key={record.id} record={record} />)
      )}
    </Screen>
  );
}

function HistoryRow({ record }: { record: SendRecord }) {
  const people = record.recipientCount === 1 ? 'person' : 'people';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Receipt for $${formatTokenDisplay(record.total, record.decimals)} to ${record.recipientCount} ${people}`}
      onPress={() => router.push({ pathname: '/receipt', params: { id: record.id } })}
      style={styles.row}
    >
      <View style={styles.rowBody}>
        <Label style={styles.rowAmount}>
          ${formatTokenDisplay(record.total, record.decimals)} {record.token}
        </Label>
        <Body style={styles.rowMeta}>
          {record.recipientCount} {people} · {formatReceiptDate(record.sentAt)}
        </Body>
      </View>
      <Label style={styles.chevron}>›</Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  title: { fontSize: 25 },
  stateText: { color: colors.muted, fontSize: 14, paddingVertical: 18 },
  empty: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radii.xxl,
    padding: 22,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 19 },
  emptyBody: {
    fontSize: 13.5,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 14,
    marginBottom: 10,
  },
  rowBody: { flex: 1 },
  rowAmount: { fontSize: 16, color: colors.ink },
  rowMeta: { fontSize: 13, color: colors.muted, marginTop: 3 },
  chevron: { fontSize: 20, color: colors.faint },
});
