/**
 * Batch validation for the Payout Entry screen — spec §2 step 1 / §1.4:
 * "Call this before enabling the Review button."
 *
 * Debounced, because the recipient list changes on every keystroke and the gateway
 * allows 60 requests/min per IP.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { GatewayError } from './client';
import { validateBatch, type BatchRecipientInput, type ValidateBatchResult } from './endpoints';

/** Long enough that ordinary typing produces one call, short enough to feel live. */
const DEBOUNCE_MS = 600;

export interface UseValidateBatch {
  result: ValidateBatchResult | undefined;
  isChecking: boolean;
  /** Transport failure, already phrased for a user. Distinct from `valid: false`. */
  transportError: string | undefined;
  /** True once a check has returned `valid: true` for the CURRENT list. */
  isValid: boolean;
  /** True while the debounce is still settling — the list has changed since the check. */
  isStale: boolean;
  refetch: () => void;
}

export function useValidateBatch(
  recipients: BatchRecipientInput[],
  decimals: number,
  tokenSymbol: string,
  enabled = true,
): UseValidateBatch {
  /**
   * Serialise the list into a stable key so the query re-runs on any real change but
   * not on a new array identity with identical contents.
   */
  const key = useMemo(
    () => recipients.map((r) => `${r.address}:${r.amount.toString()}`).join('|'),
    [recipients],
  );

  const debouncedKey = useDebouncedValue(key, DEBOUNCE_MS);
  const isSettling = debouncedKey !== key;

  /** Rebuild the payload from the DEBOUNCED key so request and key never disagree. */
  const debouncedRecipients = useMemo(() => {
    if (debouncedKey.length === 0) return [];
    return debouncedKey.split('|').map((entry) => {
      const [address = '', amount = '0'] = entry.split(':');
      return { address, amount: BigInt(amount) } as BatchRecipientInput;
    });
  }, [debouncedKey]);

  const isEnabled = enabled && debouncedRecipients.length > 0;

  const query = useQuery({
    enabled: isEnabled,
    queryKey: ['validate-batch', debouncedKey, tokenSymbol],
    /** Validation of an unchanged list stays good for a while — no need to re-ask. */
    staleTime: 60_000,
    retry: (failureCount, error) =>
      /** Retrying into a 429 only deepens the hole. */
      !(error instanceof GatewayError && error.kind === 'rate-limit') && failureCount < 1,
    queryFn: () => validateBatch(debouncedRecipients, decimals, tokenSymbol),
  });

  const transportError =
    query.error instanceof GatewayError
      ? query.error.userMessage
      : query.error
        ? 'Could not check this payout. Try again in a moment.'
        : undefined;

  return {
    result: query.data,
    isChecking: (query.isPending && isEnabled) || isSettling,
    transportError,
    isValid: query.data?.valid === true && !isSettling,
    isStale: isSettling,
    refetch: () => {
      void query.refetch();
    },
  };
}
