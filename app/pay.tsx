/**
 * PAYOUT ENTRY (spec §3.3) — who gets paid and how much.
 *
 * Builds its own layout rather than using <Screen>, because the spec calls for a sticky
 * bottom bar showing the live count and total, which a plain scrolling column can't do.
 *
 * All amount parsing goes through `src/tx/amounts.ts`; no float ever touches a payment
 * figure here. Rows keep the user's raw text so a half-typed address or amount is never
 * silently rewritten under the cursor.
 */
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isAddress, getAddress, type Address } from 'viem';

import { Button } from '../src/components/Button';
import { TextField } from '../src/components/TextField';
import { Body, Display, Eyebrow, Label } from '../src/components/Text';
import { GatewayBanner } from '../src/gateway/GatewayBanner';
import { useValidateBatch } from '../src/gateway/useValidateBatch';
import { DEFAULT_TOKEN } from '../src/config/tokens';
import { colors, CONTENT_MAX_WIDTH, radii } from '../src/theme';
import { formatTokenDisplay, parseTokenAmount } from '../src/tx/amounts';
import { findDuplicateAddresses, parseImportedList } from '../src/tx/importList';
import { toReviewParams } from '../src/tx/reviewParams';
import type { SprayMode } from '../src/tx/gasPreflight';

const token = DEFAULT_TOKEN;

interface Row {
  id: string;
  name?: string;
  /** Raw text as typed — validated, never rewritten. */
  address: string;
  /** Raw text, custom mode only. */
  amount: string;
}

let nextId = 0;
const newRow = (): Row => ({ id: `r${nextId++}`, address: '', amount: '' });

/** Spec §3.3: "3 empty numbered rows by default". */
const initialRows = (): Row[] => [newRow(), newRow(), newRow()];

export default function PayoutEntryScreen() {
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<SprayMode>('equal');
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [sharedAmount, setSharedAmount] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((rs) => {
      const next = rs.filter((r) => r.id !== id);
      /** Never leave the list empty — an entry screen with no rows has no way back. */
      return next.length > 0 ? next : [newRow()];
    });
  };

  const applyImport = () => {
    const { rows: imported, errors } = parseImportedList(importText, token.decimals);
    setImportErrors(errors.map((e) => `Line ${e.line}: ${e.reason}`));

    if (imported.length === 0) return;

    const asRows: Row[] = imported.map((r) => ({
      id: `r${nextId++}`,
      name: r.name,
      address: r.address,
      amount: r.amount !== undefined ? formatAmountForField(r.amount) : '',
    }));

    /** Replace only the untouched starter rows; never discard typed work. */
    setRows((rs) => {
      const kept = rs.filter((r) => r.address.trim() !== '' || r.amount.trim() !== '');
      return [...kept, ...asRows];
    });

    /** Any line carrying its own amount implies per-person amounts. */
    if (imported.some((r) => r.amount !== undefined)) setMode('custom');

    setImportText('');
    setShowImport(false);
  };

  const parsed = useMemo(
    () => parseRows(rows, mode, sharedAmount),
    [rows, mode, sharedAmount],
  );

  /**
   * Spec §2 step 1 / §1.4: the gateway must return `valid: true` before Review opens.
   * Amounts are per-recipient, so equal mode fans the shared amount out across rows.
   */
  const batchForValidation = useMemo(
    () =>
      parsed.recipients.map((address, i) => ({
        address,
        amount: mode === 'equal' ? parsed.sharedValue : (parsed.amounts[i] ?? 0n),
      })),
    [parsed.recipients, parsed.amounts, parsed.sharedValue, mode],
  );

  const validation = useValidateBatch(
    batchForValidation,
    token.decimals,
    token.symbol,
    parsed.recipients.length > 0,
  );

  const locallyValid = parsed.recipients.length > 0 && parsed.rowErrors.every((e) => !e);
  const canReview = locallyValid && validation.isValid;

  const goToReview = () => {
    if (!canReview) return;
    const params =
      mode === 'equal'
        ? toReviewParams({
            mode: 'equal',
            recipients: parsed.recipients,
            amountPerRecipient: parsed.sharedValue,
          })
        : toReviewParams({
            mode: 'custom',
            recipients: parsed.recipients,
            amounts: parsed.amounts,
          });
    router.push({ pathname: '/review', params });
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ paddingTop: insets.top }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          <View style={styles.header}>
            <Display style={styles.title}>Pay people</Display>
            <Button title="Back" variant="link" onPress={() => router.back()} />
          </View>

          <GatewayBanner />

          <View style={styles.toggle}>
            <ToggleOption
              label="Same amount each"
              active={mode === 'equal'}
              onPress={() => setMode('equal')}
            />
            <ToggleOption
              label="Custom per person"
              active={mode === 'custom'}
              onPress={() => setMode('custom')}
            />
          </View>

          {mode === 'equal' ? (
            <View style={styles.sharedBlock}>
              <Eyebrow style={styles.eyebrow}>Amount each</Eyebrow>
              <TextField
                value={sharedAmount}
                onChangeText={setSharedAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                error={parsed.sharedError}
              />
            </View>
          ) : null}

          <Eyebrow style={styles.eyebrow}>Who's getting paid</Eyebrow>

          {rows.map((row, i) => (
            <View key={row.id} style={styles.row}>
              <View style={styles.rowHead}>
                <Label style={styles.rowNumber}>{i + 1}</Label>
                {row.name ? <Label style={styles.rowName}>{row.name}</Label> : null}
                <View style={styles.rowSpacer} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove person ${i + 1}`}
                  onPress={() => removeRow(row.id)}
                  style={styles.removeButton}
                >
                  <Label style={styles.removeText}>×</Label>
                </Pressable>
              </View>

              <TextField
                value={row.address}
                onChangeText={(t) => updateRow(row.id, { address: t, name: undefined })}
                placeholder="0x… wallet address"
                mono
                error={parsed.rowErrors[i]}
              />

              {mode === 'custom' ? (
                <View style={styles.amountWrap}>
                  <TextField
                    value={row.amount}
                    onChangeText={(t) => updateRow(row.id, { amount: t })}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    error={parsed.amountErrors[i]}
                  />
                </View>
              ) : null}
            </View>
          ))}

          <Button
            title="+ Add person"
            variant="dashed"
            block
            style={styles.addButton}
            onPress={() => setRows((rs) => [...rs, newRow()])}
          />

          <Button
            title={showImport ? 'Close import' : '📄 Import list'}
            variant="link"
            onPress={() => setShowImport((v) => !v)}
          />

          {showImport ? (
            <View style={styles.importBlock}>
              <Body style={styles.importHelp}>
                One per line: an address, or name and address, or name, address and
                amount. Commas, tabs or semicolons all work.
              </Body>
              <TextField
                value={importText}
                onChangeText={setImportText}
                placeholder={'Ada,0x1234…,25\n0xabcd…'}
                multiline
                numberOfLines={5}
                style={styles.importInput}
                mono
              />
              <Button
                title="Add these people"
                variant="secondary"
                style={styles.importAction}
                disabled={importText.trim().length === 0}
                onPress={applyImport}
              />
              {importErrors.length > 0 ? (
                <View style={styles.importErrors} accessibilityRole="alert">
                  {importErrors.map((e) => (
                    <Body key={e} style={styles.importError}>
                      {e}
                    </Body>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {validation.transportError && locallyValid ? (
            <View style={styles.checkCard} accessibilityRole="alert">
              <Label style={styles.checkTitle}>Couldn't check this payout</Label>
              <Body style={styles.checkBody}>{validation.transportError}</Body>
              <Button
                title="Check again"
                variant="secondary"
                style={styles.checkAction}
                onPress={validation.refetch}
              />
            </View>
          ) : null}

          {validation.result && !validation.result.valid ? (
            <View style={styles.errorCard} accessibilityRole="alert">
              <Label style={styles.errorCardTitle}>This payout needs a fix</Label>
              {validation.result.errors.length > 0 ? (
                validation.result.errors.map((e, i) => (
                  <Body key={`${e.message}-${i}`} style={styles.errorCardLine}>
                    {e.index !== undefined ? `Person ${e.index + 1}: ` : ''}
                    {e.message}
                  </Body>
                ))
              ) : (
                <Body style={styles.errorCardLine}>
                  One of these addresses or amounts can't be paid. Double-check them.
                </Body>
              )}
            </View>
          ) : null}

          {validation.result?.warnings.length ? (
            <View style={styles.noticeCard}>
              {validation.result.warnings.map((w, i) => (
                <Body key={`${w.message}-${i}`} style={styles.noticeText}>
                  {w.index !== undefined ? `Person ${w.index + 1}: ` : ''}
                  {w.message}
                </Body>
              ))}
            </View>
          ) : null}

          {parsed.duplicates.length > 0 ? (
            <View style={styles.noticeCard}>
              <Body style={styles.noticeText}>
                {parsed.duplicates.length === 1
                  ? 'One address appears more than once — they’ll be paid twice.'
                  : `${parsed.duplicates.length} addresses appear more than once — they’ll each be paid more than once.`}
              </Body>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky summary — spec §3.3: "live count + total + Review →". */}
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.barInner}>
          <View>
            <Label style={styles.barCount}>
              {parsed.recipients.length}{' '}
              {parsed.recipients.length === 1 ? 'person' : 'people'}
            </Label>
            <Display style={styles.barTotal}>
              ${formatTokenDisplay(parsed.total, token.decimals)}
            </Display>
          </View>
          <Button
            title={validation.isChecking && locallyValid ? 'Checking…' : 'Review →'}
            variant="accent"
            disabled={!canReview}
            loading={validation.isChecking && locallyValid}
            onPress={goToReview}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ToggleOption({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.toggleOption, active && styles.toggleOptionActive]}
    >
      <Label style={[styles.toggleText, active && styles.toggleTextActive]}>
        {label}
      </Label>
    </Pressable>
  );
}

/** Base units → a field-friendly string (no thousands separators, no forced decimals). */
function formatAmountForField(value: bigint): string {
  const digits = value.toString().padStart(token.decimals + 1, '0');
  const whole = digits.slice(0, digits.length - token.decimals);
  const fraction = digits.slice(digits.length - token.decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

interface ParsedRows {
  recipients: Address[];
  amounts: bigint[];
  total: bigint;
  /** Index-aligned with `rows`; undefined where the row is fine or still empty. */
  rowErrors: (string | undefined)[];
  amountErrors: (string | undefined)[];
  sharedValue: bigint;
  sharedError: string | undefined;
  duplicates: Address[];
}

/**
 * Turn raw row text into payable values.
 *
 * Empty rows are ignored rather than flagged — three blank rows on first paint must not
 * look like three errors. A row only complains once it has something in it.
 */
function parseRows(rows: Row[], mode: SprayMode, sharedAmount: string): ParsedRows {
  const rowErrors: (string | undefined)[] = [];
  const amountErrors: (string | undefined)[] = [];
  const recipients: Address[] = [];
  const amounts: bigint[] = [];

  const sharedParsed =
    sharedAmount.trim().length > 0
      ? parseTokenAmount(sharedAmount, token.decimals)
      : undefined;
  const sharedValue = sharedParsed?.ok ? sharedParsed.value : 0n;
  const sharedError =
    mode === 'equal' && sharedParsed && !sharedParsed.ok ? sharedParsed.reason : undefined;

  rows.forEach((row, i) => {
    const address = row.address.trim();
    const amountText = row.amount.trim();

    if (address.length === 0) {
      rowErrors[i] = undefined;
      amountErrors[i] = undefined;
      return;
    }

    if (!isAddress(address)) {
      rowErrors[i] = 'That doesn’t look like a wallet address.';
      amountErrors[i] = undefined;
      return;
    }

    rowErrors[i] = undefined;

    if (mode === 'custom') {
      if (amountText.length === 0) {
        amountErrors[i] = 'Enter an amount.';
        return;
      }
      const parsedAmount = parseTokenAmount(amountText, token.decimals);
      if (!parsedAmount.ok) {
        amountErrors[i] = parsedAmount.reason;
        return;
      }
      amountErrors[i] = undefined;
      recipients.push(getAddress(address));
      amounts.push(parsedAmount.value);
      return;
    }

    amountErrors[i] = undefined;
    recipients.push(getAddress(address));
  });

  /** In equal mode a missing shared amount is what blocks Review, not the rows. */
  const equalIncomplete = mode === 'equal' && sharedValue === 0n;

  const total =
    mode === 'equal'
      ? sharedValue * BigInt(recipients.length)
      : amounts.reduce((sum, a) => sum + a, 0n);

  return {
    recipients: equalIncomplete ? [] : recipients,
    amounts,
    total,
    rowErrors,
    amountErrors,
    sharedValue,
    sharedError,
    duplicates: findDuplicateAddresses(recipients),
  };
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { alignItems: 'center', paddingBottom: 140 },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    paddingHorizontal: 18,
    paddingTop: 26,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { fontSize: 25 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.fill,
    borderRadius: radii.pill,
    padding: 4,
    gap: 4,
  },
  toggleOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radii.pill,
  },
  toggleOptionActive: { backgroundColor: colors.surface },
  toggleText: { fontSize: 13, color: colors.muted },
  toggleTextActive: { color: colors.ink },
  sharedBlock: { marginTop: 6 },
  eyebrow: { marginTop: 18, marginBottom: 8 },
  row: { marginBottom: 14 },
  rowHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  rowNumber: { fontSize: 13, color: colors.faint },
  rowName: { fontSize: 13.5, color: colors.inkSoft },
  rowSpacer: { flex: 1 },
  removeButton: { paddingHorizontal: 8, paddingVertical: 2 },
  removeText: { fontSize: 20, color: colors.faint, lineHeight: 22 },
  amountWrap: { marginTop: 8 },
  addButton: { marginTop: 4 },
  importBlock: { marginTop: 6 },
  importHelp: { fontSize: 12.5, color: colors.muted, lineHeight: 18, marginBottom: 8 },
  importInput: { minHeight: 110, textAlignVertical: 'top' },
  importAction: { marginTop: 10, alignSelf: 'flex-start' },
  importErrors: {
    marginTop: 10,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 10,
    gap: 3,
  },
  importError: { color: '#7F1D1D', fontSize: 12.5, lineHeight: 18 },
  noticeCard: {
    marginTop: 14,
    backgroundColor: colors.warnSoft,
    borderRadius: radii.md,
    padding: 12,
  },
  noticeText: { color: '#92400E', fontSize: 13, lineHeight: 19 },
  checkCard: {
    marginTop: 14,
    backgroundColor: colors.fill,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
  },
  checkTitle: { color: colors.ink, fontSize: 14 },
  checkBody: { color: colors.muted, fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  checkAction: { marginTop: 10, alignSelf: 'flex-start' },
  errorCard: {
    marginTop: 14,
    backgroundColor: colors.dangerSoft,
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: radii.md,
    padding: 12,
    gap: 4,
  },
  errorCardTitle: { color: '#7F1D1D', fontSize: 14.5 },
  errorCardLine: { color: '#7F1D1D', fontSize: 12.5, lineHeight: 18 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.ink,
    paddingTop: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  barInner: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barCount: { color: colors.faint, fontSize: 12.5 },
  barTotal: { color: '#FFFFFF', fontSize: 24, marginTop: 2 },
});
