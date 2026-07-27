/**
 * Gas hint for the Review screen (spec §3.4, §1.4).
 *
 * This is a HINT. The on-chain preflight in `useGasPreflight` decides whether the user
 * can actually afford to send; this only supplies a USD figure to sit next to it, since
 * "0.000006 ETH" means little on its own.
 *
 * Never blocks: a failure here leaves the fee shown in ETH alone.
 */
import { useQuery } from '@tanstack/react-query';

import { estimateBatch, type BatchEstimate } from './endpoints';

export function useEstimateBatch(
  recipientCount: number,
  enabled = true,
): BatchEstimate | undefined {
  const query = useQuery({
    enabled: enabled && recipientCount > 0,
    queryKey: ['estimate-batch', recipientCount],
    /** Depends only on the count, so it caches well across edits. */
    staleTime: 5 * 60_000,
    retry: 0,
    queryFn: () => estimateBatch(recipientCount),
  });

  return query.data;
}
