/**
 * The React half of `foregroundWallet.ts` — everything that needs the live AppKit session.
 *
 * Split from the resolution logic on purpose. `@reown/appkit-react-native` re-exports
 * `@walletconnect/react-native-compat`, which ships untranspiled ESM that Jest will not
 * load, so anything importing it is unreachable from a unit test. Keeping the decision
 * ("which link raises this wallet") on the other side of that line is what makes it
 * testable.
 */
import { useCallback, useMemo } from 'react';
import { useWalletInfo } from '@reown/appkit-react-native';

import {
  foregroundWallet,
  resolveWalletLink,
  type ConnectedWallet,
} from './foregroundWallet';

/**
 * The connected wallet's foregrounding call, stable across renders.
 *
 * Must be called from inside the AppKit provider tree — `useWalletInfo` throws otherwise.
 */
export function useForegroundWallet(): () => void {
  const { walletInfo } = useWalletInfo();

  const link = useMemo(
    () => resolveWalletLink(walletInfo as ConnectedWallet | undefined),
    [walletInfo],
  );

  return useCallback(() => {
    void foregroundWallet(link);
  }, [link]);
}
