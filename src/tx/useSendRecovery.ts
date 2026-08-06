/**
 * When recovery runs.
 *
 * Three triggers, and each one exists for a failure the others do not cover:
 *
 *   LAUNCH      — the process was killed while a payment was in flight. Nothing in memory
 *                 survived; only the journal on disk did.
 *   FOREGROUND  — the app came back from the wallet. This is the common case, and the
 *                 exact moment the promises that should have noticed have already died.
 *   A TICK      — but only while something is actually outstanding. A payment signed
 *                 while the app is on screen still needs a few seconds to mine, and the
 *                 user should not have to background the app to be told it worked.
 *
 * The launch pass also runs the one-time backfill, so the dust-test payment lands in
 * History on the first start after this ships.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { runHistoryBackfill } from '../history/backfill';
import { HISTORY_QUERY_KEY } from '../history/useHistory';
import type { SendRecord } from '../history/types';
import { reconcilePendingSends } from './reconcile';

/** How often to re-ask while a payment is outstanding and the app is on screen. */
const RECHECK_MS = 15_000;

export interface SendRecoveryState {
  /**
   * A payment recovery proved and wrote to history, waiting to be shown. Cleared by
   * `acknowledge` once whoever is watching has dealt with it.
   */
  recovered: SendRecord | undefined;
  acknowledge: () => void;
  /** True while a check is in flight, for a "checking…" affordance. */
  isChecking: boolean;
  /** Outstanding entries after the last check. Drives the tick, and the copy. */
  pendingCount: number;
  /** Ask now — used by the Review screen's unconfirmed state. */
  check: () => void;
}

export function useSendRecovery(): SendRecoveryState {
  const queryClient = useQueryClient();

  const [recovered, setRecovered] = useState<SendRecord | undefined>();
  const [isChecking, setIsChecking] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const mounted = useRef(true);
  /**
   * A ref as well as state: `run` is called from listeners and timers that captured an
   * older closure, and re-creating those on every render would tear down the AppState
   * subscription each time.
   */
  const queued = useRef<SendRecord[]>([]);

  const refreshHistory = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
  }, [queryClient]);

  const run = useCallback(
    async (withBackfill: boolean) => {
      if (!mounted.current) return;
      setIsChecking(true);

      try {
        if (withBackfill) {
          const restored = await runHistoryBackfill();
          if (restored.length > 0) refreshHistory();
        }

        const result = await reconcilePendingSends();

        if (result.recovered.length > 0) {
          refreshHistory();
          queued.current = [...queued.current, ...result.recovered];
        }

        if (result.unverifiable.length > 0) {
          console.warn(
            '[send-recovery] mined but unreadable:',
            result.unverifiable.join(', '),
          );
        }

        if (!mounted.current) return;
        setPendingCount(result.stillPending);
        /** Surfaced one at a time; `acknowledge` pulls the next. */
        if (queued.current.length > 0) setRecovered(queued.current[0]);
      } finally {
        if (mounted.current) setIsChecking(false);
      }
    },
    [refreshHistory],
  );

  const acknowledge = useCallback(() => {
    queued.current = queued.current.slice(1);
    setRecovered(queued.current[0]);
  }, []);

  const check = useCallback(() => {
    void run(false);
  }, [run]);

  /** Launch pass, plus the foreground listener. Set up once. */
  useEffect(() => {
    mounted.current = true;
    void run(true);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run(false);
    });

    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [run]);

  /** The tick, armed only while something is outstanding. */
  useEffect(() => {
    if (pendingCount === 0) return;

    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void run(false);
    }, RECHECK_MS);

    return () => clearInterval(timer);
  }, [pendingCount, run]);

  return { recovered, acknowledge, isChecking, pendingCount, check };
}
