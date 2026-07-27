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
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatUnits } from 'viem';

import { Button } from '../src/components/Button';
import { GasCheckCard } from '../src/components/GasCheckCard';
import { Screen } from '../src/components/Screen';
import { Body, Display, Eyebrow, Label, Mono } from '../src/components/Text';
import { useEstimateBatch } from '../src/gateway/useEstimateBatch';
import { DEFAULT_TOKEN } from '../src/config/tokens';
import { colors, radii } from '../src/theme';
import { formatEthAmount } from '../src/tx/gasPreflight';
import { parseReviewParams, type RawReviewParams } from '../src/tx/reviewParams';
import { useSendPreflight, type BlockerKind } from '../src/tx/useSendPreflight';
import { useSpraySend, type SendPhase } from '../src/tx/useSpraySend';
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

  /** Hooks run before the parse guard below — order must not depend on params. */
  const send = useSpraySend();

  /** Hint only (spec §1.4) — the on-chain preflight above decides affordability. */
  const estimate = useEstimateBatch(batch?.recipients.length ?? 0, batch !== undefined);

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

  const { recipients, mode, amounts, amountPerRecipient, unverified } = batch!;
  const { subtotal, feeAmount, totalCost, gas, blocker, needsApproval } = preflight;

  const amountFor = (i: number) =>
    mode === 'equal' ? (amountPerRecipient ?? 0n) : (amounts?.[i] ?? 0n);

  const canSend =
    blocker === undefined &&
    totalCost !== undefined &&
    !preflight.isLoading &&
    !send.isBusy;

  /**
   * Hand off to the dedicated Success screen (spec §3.5) with the CONTRACT's figures,
   * and `replace` so the hardware back button cannot return to a review of a payment
   * that has already been sent.
   */
  if (send.phase === 'success' && send.result) {
    return (
      <SuccessRedirect
        hash={send.result.hash}
        total={send.result.totalAmount}
        count={send.result.recipientCount}
        fee={send.result.feeAmount}
        recipients={recipients}
      />
    );
  }

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
          value={
            gas
              ? estimate?.estimatedGasUSD !== undefined
                ? `${formatEthAmount(gas.totalFeeWei)} · ≈$${estimate.estimatedGasUSD.toFixed(2)}`
                : formatEthAmount(gas.totalFeeWei)
              : 'Checking…'
          }
          muted
        />
      </View>

      {unverified ? (
        <View style={styles.unverifiedCard}>
          <Label style={styles.unverifiedTitle}>Not double-checked</Label>
          <Body style={styles.unverifiedBody}>
            We couldn't reach the address-checking service for this batch. The on-chain
            safety checks above still apply — but give the addresses one more look before
            you sign.
          </Body>
        </View>
      ) : null}

      <Stepper needsApproval={needsApproval} phase={send.phase} />

      {blocker ? (
        <BlockerView
          blocker={blocker}
          preflight={preflight}
          maxRecipients={preflight.maxRecipients}
          recipientCount={recipients.length}
          feeUsd={estimate?.estimatedGasUSD}
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

      {send.phase === 'error' && send.error ? (
        <View style={styles.blockCard} accessibilityRole="alert">
          <Label style={styles.blockTitle}>Payment didn't complete</Label>
          <Body style={styles.blockBody}>{send.error}</Body>
          {send.approveHash ? (
            <Body style={styles.blockNote}>
              Your approval went through, so retrying will only ask you to sign the
              payment.
            </Body>
          ) : null}
          <Button
            title="Try again"
            variant="secondary"
            style={styles.errorAction}
            onPress={() => {
              send.reset();
              preflight.refetch();
            }}
          />
        </View>
      ) : null}

      <Button
        title={confirmTitle(send.phase, needsApproval)}
        variant="accent"
        size="lg"
        block
        style={styles.confirm}
        disabled={!canSend}
        loading={preflight.isLoading || send.isBusy}
        onPress={() => {
          if (totalCost === undefined) return;
          void send.start({
            token: token.address,
            mode,
            recipients,
            amountPerRecipient,
            amounts,
            totalCost,
            needsApproval,
          });
        }}
      />

      <Body style={styles.footnote}>
        {send.isBusy
          ? 'Keep this screen open until it finishes.'
          : `${needsApproval ? '2 transactions' : '1 transaction'} · you keep your keys`}
      </Body>
    </Screen>
  );
}

/**
 * Navigation must happen in an effect, not during render. Renders a brief confirmation
 * rather than null so the moment between mining and the success screen isn't a blank.
 */
function SuccessRedirect({
  hash,
  total,
  count,
  fee,
  recipients,
}: {
  hash: string;
  total: bigint;
  count: number;
  fee: bigint;
  recipients: readonly string[];
}) {
  const joined = recipients.join(',');

  useEffect(() => {
    router.replace({
      pathname: '/success',
      params: {
        hash,
        total: total.toString(),
        count: String(count),
        fee: fee.toString(),
        recipients: joined,
      },
    });
  }, [hash, total, count, fee, joined]);

  return (
    <Screen>
      <View style={styles.redirect}>
        <Display style={styles.redirectText}>Sent ✓</Display>
      </View>
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
function Stepper({
  needsApproval,
  phase,
}: {
  needsApproval: boolean;
  phase: SendPhase;
}) {
  const approveDone =
    phase === 'send-signing' || phase === 'send-pending' || phase === 'success';
  const approveActive = phase === 'approve-signing' || phase === 'approve-pending';
  const sendActive = phase === 'send-signing' || phase === 'send-pending';

  return (
    <View style={styles.stepper}>
      <StepPill label="Validate" done />
      {needsApproval ? (
        <StepPill label="Approve" done={approveDone} active={approveActive} />
      ) : null}
      <StepPill label="Send" done={phase === 'success'} active={sendActive} />
    </View>
  );
}

function StepPill({
  label,
  done,
  active,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <View style={[styles.pill, done && styles.pillDone, active && styles.pillActive]}>
      <Label
        style={[
          styles.pillText,
          done && styles.pillTextDone,
          active && styles.pillTextActive,
        ]}
      >
        {done ? `${label} ✓` : label}
      </Label>
    </View>
  );
}

/** Names the action the wallet is about to ask for, so the prompt is never a surprise. */
function confirmTitle(phase: SendPhase, needsApproval: boolean): string {
  switch (phase) {
    case 'approve-signing':
      return 'Confirm the approval in your wallet';
    case 'approve-pending':
      return 'Approving…';
    case 'send-signing':
      return 'Confirm the payment in your wallet';
    case 'send-pending':
      return 'Sending…';
    case 'error':
      return 'Try again';
    default:
      return needsApproval ? 'Approve and send' : 'Send payment';
  }
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
  feeUsd,
}: {
  blocker: BlockerKind;
  preflight: ReturnType<typeof useSendPreflight>;
  maxRecipients: number;
  recipientCount: number;
  feeUsd?: number;
}) {
  /** The ETH shortfall has its own card — it needs figures and a way out. */
  if (blocker === 'insufficient-eth' && preflight.gas) {
    return (
      <GasCheckCard
        budget={preflight.gas}
        feeUsd={feeUsd}
        onRetry={preflight.refetch}
      />
    );
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
  pillActive: { backgroundColor: colors.accentSoft },
  pillText: { fontSize: 13, color: colors.muted },
  pillTextDone: { color: colors.successDeep },
  pillTextActive: { color: colors.accentDeep },
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
  blockNote: { color: '#7F1D1D', fontSize: 12.5, marginTop: 8, lineHeight: 18 },
  unverifiedCard: {
    backgroundColor: colors.warnSoft,
    borderRadius: radii.lg,
    padding: 12,
    marginTop: 16,
  },
  unverifiedTitle: { color: '#92400E', fontSize: 14 },
  unverifiedBody: { color: '#92400E', fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  redirect: { alignItems: 'center', paddingVertical: 60 },
  redirectText: { fontSize: 28, color: colors.successDeep },
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
