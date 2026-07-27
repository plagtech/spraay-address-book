/**
 * One hook the whole app uses for wallet state.
 *
 * Wraps AppKit's hooks so screens never care that we're on AppKit + wagmi, and
 * centralises the Base (8453) chain-switch handling required by spec §2.
 */
import { useCallback, useMemo, useState } from 'react';
import { useAccount, useAppKit } from '@reown/appkit-react-native';

import { BASE_CAIP_ID, BASE_CHAIN_ID } from '../config/chain';

export interface WalletState {
  /** Checksummed EOA address of the active account, or undefined when disconnected. */
  address: `0x${string}` | undefined;
  isConnected: boolean;
  /** Numeric chain id of the active network (undefined when disconnected). */
  chainId: number | undefined;
  /** True only when connected AND the active network is Base mainnet. */
  isOnBase: boolean;
  /** Connected but pointed at some other chain — screens must block sending. */
  isWrongNetwork: boolean;
  /** Opens the AppKit wallet-selection sheet. */
  connect: () => void;
  /** Opens the AppKit account sheet (address, balance, disconnect). */
  openAccount: () => void;
  disconnect: () => void;
  /** Asks the wallet to switch to Base. Resolves false if the user rejects. */
  switchToBase: () => Promise<boolean>;
  /** Set while a switch request is in flight, for button spinners. */
  isSwitching: boolean;
  /** Last switch error, cleared on the next attempt. */
  switchError: string | undefined;
}

export function useWallet(): WalletState {
  const { address, isConnected, chainId: caipChainId, namespace } = useAccount();
  const { open, disconnect: appKitDisconnect, switchNetwork } = useAppKit();

  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | undefined>();

  /**
   * AppKit reports chainId as the CAIP reference string ("8453"), not a number,
   * and only for the active namespace. Normalise to a number for wagmi/viem.
   */
  const chainId = useMemo(() => {
    if (!caipChainId) return undefined;
    const parsed = Number.parseInt(String(caipChainId), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }, [caipChainId]);

  const isEvm = namespace === undefined || namespace === 'eip155';
  const isOnBase = isConnected && isEvm && chainId === BASE_CHAIN_ID;
  const isWrongNetwork = isConnected && !isOnBase;

  const connect = useCallback(() => {
    open({ view: 'Connect' });
  }, [open]);

  const openAccount = useCallback(() => {
    open({ view: 'Account' });
  }, [open]);

  const disconnect = useCallback(() => {
    appKitDisconnect();
  }, [appKitDisconnect]);

  const switchToBase = useCallback(async () => {
    setIsSwitching(true);
    setSwitchError(undefined);
    try {
      await switchNetwork(BASE_CAIP_ID);
      return true;
    } catch (err) {
      // Most common cause: user declined the switch prompt in their wallet.
      setSwitchError(describeSwitchError(err));
      return false;
    } finally {
      setIsSwitching(false);
    }
  }, [switchNetwork]);

  return {
    address: address as `0x${string}` | undefined,
    isConnected,
    chainId,
    isOnBase,
    isWrongNetwork,
    connect,
    openAccount,
    disconnect,
    switchToBase,
    isSwitching,
    switchError,
  };
}

function describeSwitchError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/reject|denied|cancel/i.test(message)) {
    return 'You declined the network switch. Spraay needs Base to send.';
  }
  if (/unrecognized|unsupported|4902/i.test(message)) {
    return "Your wallet doesn't have Base yet — add the Base network in your wallet, then try again.";
  }
  return 'Could not switch to Base. Open your wallet and switch networks there.';
}
