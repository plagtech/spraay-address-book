/**
 * Recovery, mounted once at the root and wrapped around every screen.
 *
 * It draws nothing. Its job is to make sure a payment that completed while the app was not
 * watching ends up in the same place as one that completed while it was: written to
 * History, and SHOWN to the user on the Success screen.
 *
 * ── Why it navigates ────────────────────────────────────────────────────────────
 * Backfilling History quietly would be the timid version of this fix, and it would leave
 * the user exactly where dust test run 1 left them — told their payment failed while it
 * sat confirmed on Basescan. If money moved, the person who moved it gets told, on the
 * screen this app already has for saying so.
 *
 * `replace` from the Review screen, because that screen is the stale account of a payment
 * that has now resolved and there is nothing to go back to — the same reasoning the live
 * path uses. `push` from anywhere else, so recovery interrupts without discarding whatever
 * the user was in the middle of.
 *
 * ── Why it is a provider ────────────────────────────────────────────────────────
 * The hook owns timers and an AppState subscription, so exactly one instance may exist.
 * The Review screen still needs to be able to ask for a check on demand — its unconfirmed
 * state is precisely the case where nobody is going to background the app — so the single
 * instance is shared through context rather than a second one being mounted.
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { router, usePathname, useRootNavigationState } from 'expo-router';

import { useSendRecovery, type SendRecoveryState } from './useSendRecovery';

const noop = () => {};

/**
 * What a screen sees when it is rendered outside the provider — a unit test, or a
 * storybook. A dead "Check now" button is a far better failure than a crash on the screen
 * a user reaches mid-payment.
 */
const DETACHED: SendRecoveryState = {
  recovered: undefined,
  acknowledge: noop,
  isChecking: false,
  pendingCount: 0,
  check: noop,
};

const SendRecoveryContext = createContext<SendRecoveryState | undefined>(undefined);

export function SendRecoveryProvider({ children }: { children: ReactNode }) {
  const state = useSendRecovery();
  const { recovered, acknowledge } = state;

  const pathname = usePathname();

  /**
   * Recovery can resolve during a cold launch, before the navigator exists, and a
   * navigation into nothing is dropped silently. Wait for the key.
   */
  const navigationState = useRootNavigationState();
  const isNavigatorReady = Boolean(navigationState?.key);

  useEffect(() => {
    if (!recovered || !isNavigatorReady) return;

    const record = recovered;
    /** Clear first, so a navigation that fails cannot leave this effect re-firing. */
    acknowledge();

    const target = {
      pathname: '/success' as const,
      params: {
        hash: record.hash,
        total: record.total.toString(),
        count: String(record.recipientCount),
        fee: record.fee.toString(),
        recipients: record.recipients.map((r) => r.address).join(','),
        /** Tells the screen to say this was FOUND, not that it just happened. */
        recovered: '1',
      },
    };

    if (pathname === '/review') router.replace(target);
    else router.push(target);
  }, [recovered, isNavigatorReady, acknowledge, pathname]);

  return (
    <SendRecoveryContext.Provider value={state}>{children}</SendRecoveryContext.Provider>
  );
}

export function useSendRecoveryContext(): SendRecoveryState {
  return useContext(SendRecoveryContext) ?? DETACHED;
}
