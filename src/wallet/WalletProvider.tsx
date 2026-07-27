/**
 * Provider tree for the wallet stack.
 *
 * Order matters: AppKitProvider owns the AppKit singleton, WagmiProvider hands the
 * same connection to the contract layer (step 4), and <AppKit /> renders the modal
 * host that the connect / network sheets mount into.
 */
import type { ReactNode } from 'react';
import { AppKit, AppKitProvider } from '@reown/appkit-react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';

import { ContractConstantsPrefetch } from '../contracts/useContractConstants';
import { appKit, wagmiConfig } from './appkit';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Chain reads are cheap but not free; a short stale window keeps the
      // Review screen responsive without hammering the public Base RPC.
      staleTime: 15_000,
      retry: 2,
    },
  },
});

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <AppKitProvider instance={appKit}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {/* Spec §2 step 8: read the contract's constants at startup, not on demand. */}
          <ContractConstantsPrefetch />
          {children}
          <AppKit />
        </QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  );
}
