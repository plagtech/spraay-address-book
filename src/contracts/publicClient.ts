/**
 * Read-only viem client pinned to the Base RPC in spec §1.1.
 *
 * Deliberately NOT the wallet's injected provider: reads (gas estimates, balances,
 * `paused`, `calculateTotalCost`) must not depend on whatever RPC the user's wallet
 * happens to use, which is frequently rate-limited or stale. Writes still go through
 * the wallet — this client can only read.
 */
import { createPublicClient, http } from 'viem';

import { base, BASE_RPC_URL } from '../config/chain';

export const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL, {
    // Base's public RPC occasionally 429s; a couple of quick retries is enough to ride
    // over it without leaving the Review screen spinning (spec §2: "RPC timeout retry").
    retryCount: 2,
    retryDelay: 400,
    timeout: 10_000,
  }),
});
