/**
 * Chain + contract constants.
 *
 * ⚠️ EVERY VALUE IN THIS FILE IS VERIFIED (build spec §1, verified 2026-07-26 against
 * the live contract on Base and Blockscout). Do not substitute, "correct", or guess
 * any address, chain id, or RPC URL here. See spec §4 (Guards).
 */
import { defineChain } from 'viem';

/** Base mainnet chain id — spec §1.1 */
export const BASE_CHAIN_ID = 8453 as const;

/** CAIP-2 id used by Reown AppKit for network switching. */
export const BASE_CAIP_ID = `eip155:${BASE_CHAIN_ID}` as const;

/** Base mainnet RPC — spec §1.1 */
export const BASE_RPC_URL = 'https://mainnet.base.org' as const;

/**
 * SprayContract on Base mainnet — verified on Blockscout, contract name `SprayContract`.
 * NEVER use any other address for Base (spec §1.1 + §4).
 */
export const SPRAY_CONTRACT_ADDRESS =
  '0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC' as const;

/**
 * Unichain deployment exists at 0x08fA5D1c16CD6E2a16FC0E4839f262429959E073 (chainId 130)
 * but is explicitly OUT OF SCOPE for v1 — Base only. Intentionally not wired up.
 */

/**
 * Live contract constants read via eth_call on 2026-07-26 (spec §1.1).
 * These are FALLBACKS ONLY, for first paint before the on-chain read resolves.
 * The app reads MAX_RECIPIENTS / feeBps / paused on chain at startup and caches them —
 * never treat these literals as the source of truth (spec §2 step 8, §1.2 fee model).
 */
export const VERIFIED_AT_BUILD = {
  MAX_RECIPIENTS: 200,
  feeBps: 30,
  MAX_FEE_BPS: 500,
  paused: false,
} as const;

/** Block explorer used for success-screen links — spec §2 step 7. */
export const BASESCAN_TX_URL = (hash: string) => `https://basescan.org/tx/${hash}`;

/** Base mainnet, pinned to the RPC in spec §1.1. */
export const base = defineChain({
  id: BASE_CHAIN_ID,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [BASE_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Basescan', url: 'https://basescan.org' },
  },
});

/** v1 ships Base only. Keep as a tuple so wagmi/AppKit types stay happy. */
export const SUPPORTED_CHAINS = [base] as const;
