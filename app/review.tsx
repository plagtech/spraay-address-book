/**
 * REVIEW (spec §3.4) — the last screen before money moves.
 *
 * Shows what will be sent, what it costs including the protocol fee, and runs every
 * read-side guard from spec §2 steps 2-5 before the confirm button becomes live. The
 * checks themselves live in `useSendPreflight`; this screen is presentation plus the
 * blocked states.
 *
 * Recipients and amounts arrive as router params in BASE UNITS — see `reviewParams.ts`.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatUnits } from 'viem';

import { Button } from '../src/components/Button';
import { GasCheckCard } from '../src/components/GasCheckCard';
import { Screen } from '../src/components/Screen';
import { Body, Display, Eyebrow, Label, Mono } from '../src/components/Text';
import { DEFAULT_TOKEN } from '../src/config/tokens';
import { colors, radii } from '../src/theme';
import { formatEthAmount } from '../src/tx/gasPreflight';
import { parseReviewParams, type RawReviewParams } from '../src/tx/reviewParams';
import { useSendPreflight, type BlockerKind } from '../src/tx/useSendPreflight';
import { NetworkBanner } from '../src/wallet/NetworkBanner';
import { useWallet } from '../src/wallet/useWallet';

const token = DEFAULT_TOKEN;

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const formatToken = (v: bigint) => {
  const n = Number(formatUnits(v, token.decimals));
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function ReviewScreen() {
  /**
   * With `typedRoutes` on, the generic slot on `useLocalSearchParams` is the route path,
   * not the param shape — so the cast is where the raw params get their type. The
   * parser treats every field as untrusted anyway.
   */
  const raw = useLocalSearchParams() as RawReviewParams;
  const { address, isOnBase } = useWallet();

  /** Parse once per param change — it validates every address and amount. */
  const parsed = useMemo(() => parseReviewParams(raw), [raw]);

  const batch = parsed.ok ? parsed.value : undefined;

  const preflight = useSendPreflight({
    sender: address,
    isOnBase,
    token: token.address,
    tokenDecimals: token.decimals,
    mode: batch?.mode ?? 'equal',
    recipients: batch?.recipients ?? [],
    amountPerRecipient: batch?.amountPerRecipient,
    amounts: batch?.amounts,
  });

  if (!parsed.ok) {
    return (
      <Screen>
        <Header />
        <View style={styles.errorCard} accessibilityRole="alert">
          <Label style={styles.errorTitle}>Something's off with this payout</Label>
          <Body style={styles.errorBody}>{parsed.reason}</Body>
          <Button
            title="Go back and fix it"
            variant="secondary"
            style={styles.errorAction}
            onPress={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  const { recipients, mode, amounts, amountPerRecipient } = batch!;
  const { subtotal, feeAmount, totalCost, gas, blocker, needsApproval } = preflight;

  const amountFor = (i: number) =>
    mode === 'equal' ? (amountPerRecipient ?? 0n) : (amounts?.[i] ?? 0n);

  const canSend = blocker === undefined && totalCost !== undefined && !preflight.isLoading;

  return (
    <Screen bottomInset={32}>
      <Header />
      <NetworkBanner />

      <Eyebrow style={styles.eyebrow}>
        {recipients.length} {recipients.length === 1 ? 'person' : 'people'}
      </Eyebrow>

      <View style={styles.card}>
        {recipients.map((recipient, i) => (
          <View
            key={recipient}
            style={[styles.row, i === recipients.length - 1 && styles.rowLast]}
          >
            <Mono style={styles.rowAddress}>{shortAddress(recipient)}</Mono>
            <Label style={styles.rowAmount}>${formatToken(amountFor(i))}</Label>
          </View>
        ))}
      </View>

      <Eyebrow style={styles.eyebrow}>What it costs</Eyebrow>

      <View style={styles.card}>
        <CostRow label="Subtotal" value={`$${formatToken(subtotal)}`} />
        <CostRow
          label="Protocol fee"
          value={feeAmount !== undefined ? `$${formatToken(feeAmount)}` : '—'}
        />
        <View style={styles.divider} />
        <CostRow
          label="Total"
          value={totalCost !== undefined ? `$${formatToken(totalCost)}` : '—'}
          strong
        />
        <CostRow
          label={`Network fee${gas?.approximate ? ' (approx.)' : ''}`}
          value={gas ? formatEthAmount(gas.totalFeeWei) : 'Checking…'}
          muted
        />
      </View>

      <Stepper needsApproval={needsApproval} />

      {blocker ? (
        <BlockerView
          blocker={blocker}
          preflight={preflight}
          maxRecipients={preflight.maxRecipients}
          recipientCount={recipients.length}
        />
      ) : null}

      {preflight.error && !blocker ? (
        <View style={styles.errorCard} accessibilityRole="alert">
          <Label style={styles.errorTitle}>Couldn't check the network</Label>
          <Body style={styles.errorBody}>
            We couldn't reach Base to confirm your balances. Check your connection and
            try again — nothing has been sent.
          </Body>
          <Button
            title="Try again"
            variant="secondary"
            style={styles.errorAction}
            onPress={preflight.refetch}
          />
        </View>
      ) : null}

      <Button
        title={needsApproval ? 'Approve and send' : 'Send payment'}
        variant="accent"
        size="lg"
        block
        style={styles.confirm}
        disabled={!canSend}
        loading={preflight.isLoading}
        onPress={() => {
          /**
           * Signing (approve → spray, spec §2 steps 5-6) is the next build step. The
           * button stays inert rather than pretending to send.
           */
        }}
      />

      <Body style={styles.footnote}>
        1 transaction · you keep your keys
        {needsApproval ? ' · approval first, then the payment' : ''}
      </Body>
    </Screen>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Display style={styles.title}>Review</Display>
      <Button title="Back" variant="link" onPress={() => router.back()} />
    </View>
  );
}

/** Spec §3.4: "Show stepper: Validate ✓ → Approve → Send". */
function Stepper({ needsApproval }: { needsApproval: boolean }) {
  return (
    <View style={styles.stepper}>
      <StepPill label="Validate" done />
      {needsApproval ? <StepPill label="Approve" /> : null}
      <StepPill label="Send" />
    </View>
  );
}

function StepPill({ label, done }: { label: string; done?: boolean }) {
  return (
    <View style={[styles.pill, done && styles.pillDone]}>
      <Label style={[styles.pillText, done && styles.pillTextDone]}>
        {done ? `${label} ✓` : label}
      </Label>
    </View>
  );
}

function CostRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.costRow}>
      <Body style={[styles.costLabel, muted && styles.costLabelMuted]}>{label}</Body>
      <Label style={[styles.costValue, strong && styles.costValueStrong]}>{value}</Label>
    </View>
  );
}

function BlockerView({
  blocker,
  preflight,
  maxRecipients,
  recipientCount,
}: {
  blocker: BlockerKind;
  preflight: ReturnType<typeof useSendPreflight>;
  maxRecipients: number;
  recipientCount: number;
}) {
  /** The ETH shortfall has its own card — it needs figures and a way out. */
  if (blocker === 'insufficient-eth' && preflight.gas) {
    return <GasCheckCard budget={preflight.gas} onRetry={preflight.refetch} />;
  }

  const copy = blockerCopy(blocker, {
    maxRecipients,
    recipientCount,
    shortBy:
      preflight.totalCost !== undefined && preflight.tokenBalance !== undefined
        ? preflight.totalCost - preflight.tokenBalance
        : undefined,
  });

  if (!copy) return null;

  return (
    <View style={styles.blockCard} accessibilityRole="alert">
      <Label style={styles.blockTitle}>{copy.title}</Label>
      <Body style={styles.blockBody}>{copy.body}</Body>
    </View>
  );
}

function blockerCopy(
  blocker: BlockerKind,
  ctx: { maxRecipients: number; recipientCount: number; shortBy: bigint | undefined },
): { title: string; body: string } | undefined {
  switch (blocker) {
    case 'not-connected':
      return {
        title: 'Connect your wallet',
        body: 'Connect the wallet you want to pay from, then come back to this screen.',
      };
    /** The NetworkBanner already offers a one-tap switch, so no second card. */
    case 'wrong-network':
      return undefined;
    case 'paused':
      return {
        title: 'Sending is paused right now',
        body: 'Payments are temporarily paused. Your funds are untouched — try again a little later.',
      };
    case 'too-many-recipients':
      return {
        title: 'Too many people at once',
        body: `You can pay up to ${ctx.maxRecipients} people in one go. This payout has ${ctx.recipientCount} — split it into smaller batches.`,
      };
    case 'insufficient-usdc':
      return {
        title: 'Not enough USDC',
        body:
          ctx.shortBy !== undefined
            ? `You need $${formatToken(ctx.shortBy)} more USDC to cover this payout and its fee.`
            : 'This wallet does not hold enough USDC to cover the payout and its fee.',
      };
    default:
      return undefined;
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 25 },
  eyebrow: { marginTop: 18, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.xxl,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowLast: { borderBottomWidth: 0 },
  rowAddress: { fontSize: 13.5, color: colors.muted },
  rowAmount: { fontSize: 15, color: colors.ink },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  costLabel: { fontSize: 14, color: colors.muted },
  costLabelMuted: { fontSize: 13, color: colors.faint },
  costValue: { fontSize: 14.5, color: colors.inkSoft },
  costValueStrong: { fontSize: 18, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.hairline },
  stepper: { flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap' },
  pill: {
    backgroundColor: colors.fill,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillDone: { backgroundColor: colors.successSoft },
  pillText: { fontSize: 13, color: colors.muted },
  pillTextDone: { color: colors.successDeep },
  blockCard: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: radii.xl,
    padding: 16,
    marginTop: 14,
  },
  blockTitle: { color: '#7F1D1D', fontSize: 15 },
  blockBody: { color: '#7F1D1D', fontSize: 13.5, marginTop: 6, lineHeight: 20 },
  errorCard: {
    backgroundColor: colors.fill,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 16,
    marginTop: 14,
  },
  errorTitle: { color: colors.ink, fontSize: 15 },
  errorBody: { color: colors.muted, fontSize: 13.5, marginTop: 6, lineHeight: 20 },
  errorAction: { marginTop: 12, alignSelf: 'flex-start' },
  confirm: { marginTop: 20 },
  footnote: {
    fontSize: 12.5,
    color: colors.faint,
    textAlign: 'center',
    marginTop: 12,
  },
});
