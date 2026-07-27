/**
 * Contract constants read on chain at startup and cached — spec §2 step 8, and the
 * warning in `chain.ts` that the build-time literals are fallbacks, never the truth.
 *
 * Why cache at startup rather than read on demand: `MAX_RECIPIENTS` gates the Payout
 * Entry screen, which the user reaches long before Review. Without a cached value that
 * screen would either hardcode the cap (what the spec forbids) or leave it unknown until
 * the last step, letting someone build a 300-person payout only to be told at Review.
 *
 * Staleness policy is different per value, so they are read together but trusted
 * differently:
 *   • MAX_RECIPIENTS / feeBps — governance-controlled, effectively static. Cached value
 *     is fine for shaping the UI.
 *   • paused — an operational switch that can flip at any moment. The cached value is
 *     only an early hint; `useSendPreflight` re-reads it immediately before every send,
 *     because a stale `false` here would wave a payment through into a paused contract.
 */
import { useQuery } from '@tanstack/react-query';

import { SPRAY_CONTRACT_ADDRESS, VERIFIED_AT_BUILD } from '../config/chain';
import { SPRAY_ABI } from './abi';
import { publicClient } from './publicClient';

export interface ContractConstants {
  maxRecipients: number;
  feeBps: number;
  paused: boolean;
  /** False while the build-time fallbacks are standing in for a real read. */
  fromChain: boolean;
}

const FALLBACK: ContractConstants = {
  maxRecipients: VERIFIED_AT_BUILD.MAX_RECIPIENTS,
  feeBps: VERIFIED_AT_BUILD.feeBps,
  paused: VERIFIED_AT_BUILD.paused,
  fromChain: false,
};

export const CONTRACT_CONSTANTS_KEY = ['contract-constants'] as const;

export async function readContractConstants(): Promise<ContractConstants> {
  const [maxRecipients, feeBps, paused] = await Promise.all([
    publicClient.readContract({
      address: SPRAY_CONTRACT_ADDRESS,
      abi: SPRAY_ABI,
      functionName: 'MAX_RECIPIENTS',
    }),
    publicClient.readContract({
      address: SPRAY_CONTRACT_ADDRESS,
      abi: SPRAY_ABI,
      functionName: 'feeBps',
    }),
    publicClient.readContract({
      address: SPRAY_CONTRACT_ADDRESS,
      abi: SPRAY_ABI,
      functionName: 'paused',
    }),
  ]);

  return {
    maxRecipients: Number(maxRecipients),
    feeBps: Number(feeBps),
    paused,
    fromChain: true,
  };
}

/**
 * Reads once per app session and serves every caller from cache. Returns the build-time
 * fallbacks until the read lands so the UI never renders an empty cap.
 */
export function useContractConstants(): ContractConstants {
  const query = useQuery({
    queryKey: CONTRACT_CONSTANTS_KEY,
    queryFn: readContractConstants,
    /** Session-long: these do not move, and a re-read costs an RPC round trip. */
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  });

  return query.data ?? FALLBACK;
}

/**
 * Mounted once inside the provider tree so the read starts as the app opens rather than
 * when a screen first needs it. Renders nothing.
 */
export function ContractConstantsPrefetch(): null {
  useContractConstants();
  return null;
}
