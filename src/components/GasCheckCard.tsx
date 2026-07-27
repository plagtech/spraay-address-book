/**
 * Blocking explainer shown when the wallet holds enough USDC but not enough ETH to pay
 * the network fee on Base (spec §2 step 4, alongside the "Not enough USDC" block).
 *
 * Tone per spec §3: plain verbs, no jargon. "Network fee" rather than "gas", and the
 * routes to get ETH are concrete actions, not an explanation of what ETH is. A user who
 * hits this is stuck until they act, so the card's job is to make the next step obvious.
 */
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../theme';
import { Body, Label } from './Text';
import { formatEthAmount, type GasBudget } from '../tx/gasPreflight';

/** Base's official bridge — spec §5 keeps the app free of onramp/swap surfaces, so we
 *  hand off to the wallet or the bridge rather than embedding either. */
const BASE_BRIDGE_URL = 'https://bridge.base.org';

export interface GasCheckCardProps {
  budget: GasBudget;
  /** Optional USD figure for the fee, e.g. from `/free/estimate-batch` (spec §1.4). */
  feeUsd?: number;
  /** Rendered under the card when the caller wants a retry affordance. */
  onRetry?: () => void;
}

export function GasCheckCard({ budget, feeUsd, onRetry }: GasCheckCardProps) {
  if (budget.status === 'ok') return null;

  const fee = formatEthAmount(budget.totalFeeWei);
  const have = formatEthAmount(budget.ethBalanceWei);
  const short = formatEthAmount(budget.shortfallWei);

  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Label style={styles.title}>You need a little ETH on Base</Label>

      <Body style={styles.body}>
        Your USDC is ready, but sending on Base costs a small network fee paid in ETH —
        and this wallet doesn&apos;t have enough yet.
      </Body>

      <View style={styles.figures}>
        <FigureRow
          label={
            budget.needsApproval
              ? `Network fee ${budget.approximate ? '(approx., 2 steps)' : '(2 steps)'}`
              : `Network fee ${budget.approximate ? '(approx.)' : ''}`.trim()
          }
          value={feeUsd !== undefined ? `${fee} · ≈$${feeUsd.toFixed(2)}` : fee}
          emphasis
        />
        <FigureRow label="Your ETH on Base" value={have} />
        <FigureRow label="Still needed" value={short} />
      </View>

      {budget.needsApproval ? (
        <Body style={styles.note}>
          This payment takes two steps — one to allow the amount, one to send it — so the
          fee covers both.
        </Body>
      ) : null}

      <Label style={styles.howTitle}>How to get ETH on Base</Label>
      <View style={styles.steps}>
        <Step text="Buy ETH straight inside your wallet app — most offer this on Base." />
        <Step text="Or send ETH from an exchange, choosing Base as the network." />
        <Step text="Or move ETH you already hold on Ethereum across with the Base bridge." />
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="link"
          style={styles.link}
          onPress={() => {
            void Linking.openURL(BASE_BRIDGE_URL);
          }}
        >
          <Label style={styles.linkText}>Open the Base bridge ↗</Label>
        </Pressable>

        {onRetry ? (
          <Pressable accessibilityRole="button" style={styles.link} onPress={onRetry}>
            <Label style={styles.linkText}>Check again</Label>
          </Pressable>
        ) : null}
      </View>

      <Body style={styles.footnote}>
        Nothing has been sent, and your funds stay in your wallet the whole time.
      </Body>
    </View>
  );
}

function FigureRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.figureRow}>
      <Body style={styles.figureLabel}>{label}</Body>
      <Label style={[styles.figureValue, emphasis ? styles.figureValueStrong : null]}>
        {value}
      </Label>
    </View>
  );
}

function Step({ text }: { text: string }) {
  return (
    <View style={styles.step}>
      <Body style={styles.bullet}>•</Body>
      <Body style={styles.stepText}>{text}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.warnSoft,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: colors.warn,
    padding: 16,
    marginTop: 14,
  },
  title: { color: '#92400E', fontSize: 15.5 },
  body: { color: '#92400E', fontSize: 13.5, marginTop: 6, lineHeight: 20 },
  figures: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 12,
  },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  figureLabel: { color: colors.muted, fontSize: 13, flexShrink: 1, paddingRight: 10 },
  figureValue: { color: colors.inkSoft, fontSize: 13.5 },
  figureValueStrong: { color: colors.ink, fontSize: 14.5 },
  note: { color: '#92400E', fontSize: 12.5, marginTop: 10, lineHeight: 18 },
  howTitle: { color: '#92400E', fontSize: 14, marginTop: 16 },
  steps: { marginTop: 6, gap: 5 },
  step: { flexDirection: 'row', gap: 8 },
  bullet: { color: '#92400E', fontSize: 13 },
  stepText: { color: '#92400E', fontSize: 13, flex: 1, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  link: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  linkText: { color: '#92400E', fontSize: 13 },
  footnote: { color: '#92400E', fontSize: 12, marginTop: 12, lineHeight: 17 },
});
