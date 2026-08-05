/**
 * Reading a mined spray back out of its receipt.
 *
 * The live path already did half of this inline: `useSpraySend` decoded
 * `SprayTokenExecuted` to prove the transaction did what was meant, then the Review
 * screen rebuilt the per-person rows from the batch it still had in memory. Recovery has
 * no such memory — a payment found on the chain a day later, or after the process was
 * killed, exists only as logs. So the decode moves here and both paths use it.
 *
 * Pure and React-free, and it takes a receipt rather than fetching one, so the matching
 * rules below can be tested against a fixture.
 *
 * ── What the contract actually emits ────────────────────────────────────────────
 * Read off the live dust-test transaction `0xcb617e88…c615`, not assumed. A `sprayEqual`
 * to three people produces, in order:
 *
 *   Transfer  sender    → SprayContract   0.3009   (the pull-in: subtotal + fee)
 *   Transfer  Spray     → recipient 1     0.1
 *   Transfer  Spray     → recipient 2     0.1
 *   Transfer  Spray     → recipient 3     0.1
 *   Transfer  Spray     → fee collector   0.0009
 *   SprayTokenExecuted(sender, token, total 0.3, recipientCount 3, fee 0.0009, timestamp)
 *
 * So the contract pools first and distributes second, and the fee rides out on the same
 * leg type as a payee. `recipientCount` from the event is what separates them.
 */
import {
  decodeEventLog,
  getAddress,
  type Address,
  type Hash,
  type Log,
  type TransactionReceipt,
} from 'viem';

import { SPRAY_CONTRACT_ADDRESS } from '../config/chain';
import { TOKENS, type TokenConfig } from '../config/tokens';
import { ERC20_ABI, SPRAY_ABI } from '../contracts/abi';
import type { SendRecipientRecord, SendRecord } from '../history/types';
import type { SprayMode } from './gasPreflight';

export interface SprayExecuted {
  sender: Address;
  token: Address;
  /** Paid to recipients, excluding the fee — the figure the fee is charged ON TOP of. */
  totalAmount: bigint;
  recipientCount: number;
  feeAmount: bigint;
  /** The contract's own block timestamp, in seconds. */
  timestamp: bigint;
}

const sameAddress = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** Case-insensitive lookup, because an address off the chain is not checksummed. */
export function tokenByAddress(address: string): TokenConfig | undefined {
  return Object.values(TOKENS).find((t) => sameAddress(t.address, address));
}

/**
 * Pull `SprayTokenExecuted` out of a receipt's logs.
 *
 * The ERC-20 transfers share the receipt, so decoding is attempted per log and anything
 * that isn't ours is skipped rather than treated as a failure.
 */
export function findSprayExecuted(logs: readonly Log[]): SprayExecuted | undefined {
  for (const log of logs) {
    if (!sameAddress(log.address, SPRAY_CONTRACT_ADDRESS)) continue;
    try {
      const decoded = decodeEventLog({
        abi: SPRAY_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'SprayTokenExecuted') continue;

      const args = decoded.args as unknown as {
        sender: Address;
        token: Address;
        totalAmount: bigint;
        recipientCount: bigint;
        feeAmount: bigint;
        timestamp: bigint;
      };

      return {
        sender: getAddress(args.sender),
        token: getAddress(args.token),
        totalAmount: args.totalAmount,
        recipientCount: Number(args.recipientCount),
        feeAmount: args.feeAmount,
        timestamp: args.timestamp,
      };
    } catch {
      /** Not one of ours, or a different event — keep looking. */
    }
  }
  return undefined;
}

interface TransferLeg {
  from: Address;
  to: Address;
  amount: bigint;
}

function decodeTransfers(logs: readonly Log[], token: Address): TransferLeg[] {
  const legs: TransferLeg[] = [];
  for (const log of logs) {
    if (!sameAddress(log.address, token)) continue;
    try {
      const decoded = decodeEventLog({
        abi: ERC20_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'Transfer') continue;
      const args = decoded.args as unknown as {
        from: Address;
        to: Address;
        value: bigint;
      };
      legs.push({
        from: getAddress(args.from),
        to: getAddress(args.to),
        amount: args.value,
      });
    } catch {
      /** Some other event on the same token contract. */
    }
  }
  return legs;
}

const sum = (legs: TransferLeg[]) => legs.reduce((total, leg) => total + leg.amount, 0n);

const toRows = (legs: TransferLeg[]): SendRecipientRecord[] =>
  legs.map((leg) => ({ address: leg.to, amount: leg.amount }));

/**
 * Who got paid, from the transfer legs alone.
 *
 * Returns undefined rather than a guess when the legs cannot be made to agree with the
 * event's `totalAmount`. A receipt that misstates who was paid is worse than one that
 * only states the total, and the total is never in doubt — it comes from the event.
 */
export function reconstructRecipients(
  logs: readonly Log[],
  executed: SprayExecuted,
): SendRecipientRecord[] | undefined {
  const transfers = decodeTransfers(logs, executed.token);

  /**
   * Handles the pooled shape the contract actually uses, and a hypothetical direct
   * `transferFrom(sender → payee)` one, without needing to know which it is: whichever
   * set is non-empty is the distribution, and the sum check below is what decides
   * whether we read it correctly.
   */
  const pooled = transfers.filter((t) => sameAddress(t.from, SPRAY_CONTRACT_ADDRESS));
  const direct = transfers.filter(
    (t) =>
      sameAddress(t.from, executed.sender) && !sameAddress(t.to, SPRAY_CONTRACT_ADDRESS),
  );
  const legs = pooled.length > 0 ? pooled : direct;
  if (legs.length < executed.recipientCount) return undefined;

  /** The live layout: payees first, fee last, so the first N legs are the payees. */
  const inOrder = legs.slice(0, executed.recipientCount);
  if (sum(inOrder) === executed.totalAmount) return toRows(inOrder);

  /**
   * Same set with the fee leg lifted out, in case the fee is ever emitted first or in
   * the middle. Only reached when the straightforward read did not balance, so it cannot
   * misfire on a payee who happens to be owed exactly the fee amount.
   */
  const withoutFee = legs
    .filter((t) => t.amount !== executed.feeAmount)
    .slice(0, executed.recipientCount);
  if (
    withoutFee.length === executed.recipientCount &&
    sum(withoutFee) === executed.totalAmount
  ) {
    return toRows(withoutFee);
  }

  return undefined;
}

export interface BuildRecordParams {
  receipt: Pick<TransactionReceipt, 'logs' | 'transactionHash' | 'status'>;
  /** History id for the new record — callers own id generation. */
  id: string;
  /**
   * The rows as the app knew them at send time, names included. Used for the names, and
   * as the breakdown of last resort if the logs cannot be reconciled.
   */
  known?: SendRecipientRecord[];
  /** Resolves a saved contact name, for a payment recovered without its `known` rows. */
  nameFor?: (address: Address) => string | undefined;
  mode?: SprayMode;
}

/**
 * Turn a mined, successful receipt into the history record for it.
 *
 * Undefined when the receipt is not a spray we can vouch for: reverted, missing the
 * event, or on a token this build does not know how to denominate. The caller shows the
 * user the explorer instead of inventing a receipt.
 */
export function buildSendRecordFromReceipt(
  params: BuildRecordParams,
): SendRecord | undefined {
  const { receipt, id, known, nameFor, mode = 'equal' } = params;

  if (receipt.status !== 'success') return undefined;

  const executed = findSprayExecuted(receipt.logs);
  if (!executed) return undefined;

  const token = tokenByAddress(executed.token);
  if (!token) return undefined;

  const nameOf = (address: Address): string | undefined => {
    const remembered = known?.find((r) => sameAddress(r.address, address))?.name;
    return remembered ?? nameFor?.(address);
  };

  const decoded = reconstructRecipients(receipt.logs, executed);

  /**
   * Preference order: what the chain says, then what the app remembered sending, then
   * nothing. An empty breakdown still makes a valid record — the totals come from the
   * event and are the part a receipt must never get wrong.
   */
  const rows: SendRecipientRecord[] =
    decoded?.map((r) => {
      const name = nameOf(r.address);
      return { address: r.address, ...(name ? { name } : {}), amount: r.amount };
    }) ??
    (known && known.length === executed.recipientCount ? known : []);

  /**
   * The contract's timestamp, so a recovered payment is dated when it HAPPENED rather
   * than when the app got round to noticing. Guarded because a zero would date the
   * receipt to 1970.
   */
  const seconds = Number(executed.timestamp);
  const sentAt =
    Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now();

  return {
    id,
    hash: receipt.transactionHash as Hash,
    sentAt,
    mode,
    recipients: rows,
    recipientCount: executed.recipientCount,
    total: executed.totalAmount,
    fee: executed.feeAmount,
    token: token.symbol,
    decimals: token.decimals,
  };
}
