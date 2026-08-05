/**
 * Send-history access, backed by react-query so the History tab and a just-completed
 * send share one cache.
 */
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { appendSend, loadHistory, newSendId } from './storage';
import type { SendRecord } from './types';

/**
 * Exported because history is no longer written only from a screen: `tx/reconcile.ts` and
 * `history/backfill.ts` both append straight to storage, from outside React, and then have
 * to tell this cache to re-read. Anything that writes the store must invalidate this key.
 */
export const HISTORY_QUERY_KEY = ['send-history'] as const;

const QUERY_KEY = HISTORY_QUERY_KEY;

export interface UseHistory {
  /** Newest first. */
  records: SendRecord[];
  isLoading: boolean;
  /** Idempotent on transaction hash — safe to call from a screen that re-mounts. */
  record: (input: Omit<SendRecord, 'id' | 'sentAt'> & { sentAt?: number }) => Promise<void>;
  findByHash: (hash: string) => SendRecord | undefined;
  findById: (id: string) => SendRecord | undefined;
}

export function useHistory(): UseHistory {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: loadHistory,
    /** Local disk; nothing else writes it. */
    staleTime: Infinity,
  });

  const records = useMemo(() => query.data ?? [], [query.data]);

  const mutation = useMutation({
    mutationFn: async (
      input: Omit<SendRecord, 'id' | 'sentAt'> & { sentAt?: number },
    ) => {
      const next = await appendSend({
        ...input,
        id: newSendId(),
        sentAt: input.sentAt ?? Date.now(),
      });
      queryClient.setQueryData(QUERY_KEY, next);
    },
  });

  const record = useCallback(
    async (input: Omit<SendRecord, 'id' | 'sentAt'> & { sentAt?: number }) => {
      await mutation.mutateAsync(input);
    },
    [mutation],
  );

  return {
    records,
    isLoading: query.isPending,
    record,
    findByHash: (hash: string) =>
      records.find((r) => r.hash.toLowerCase() === hash.toLowerCase()),
    findById: (id: string) => records.find((r) => r.id === id),
  };
}
