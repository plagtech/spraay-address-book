/**
 * Token registry — spec §1.3.
 *
 * Addresses and decimals verified from `GET https://gateway.spraay.app/api/v1/tokens`
 * on 2026-07-26. Do not substitute.
 *
 * v1 exposes USDC ONLY in the UI. USDT / DAI / EURC are already correct here so
 * enabling them later is a config change (flip `enabledInV1`), not a code change.
 */

export type TokenSymbol = 'USDC' | 'USDT' | 'DAI' | 'EURC';

export interface TokenConfig {
  /** Symbol as the gateway expects it in `/free/validate-batch` (`token` field). */
  symbol: TokenSymbol;
  /** ERC-20 contract address on Base mainnet. */
  address: `0x${string}`;
  decimals: number;
  /** Shown in the UI. Spec §3: no crypto jargon beyond "USDC" and "wallet". */
  label: string;
  enabledInV1: boolean;
}

export const TOKENS: Record<TokenSymbol, TokenConfig> = {
  USDC: {
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    label: 'USDC',
    enabledInV1: true,
  },
  USDT: {
    symbol: 'USDT',
    address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    decimals: 6,
    label: 'USDT',
    enabledInV1: false,
  },
  DAI: {
    symbol: 'DAI',
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    decimals: 18,
    label: 'DAI',
    enabledInV1: false,
  },
  EURC: {
    symbol: 'EURC',
    address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
    decimals: 6,
    label: 'EURC',
    enabledInV1: false,
  },
};

/** The only token v1 sends. */
export const DEFAULT_TOKEN = TOKENS.USDC;

export const ENABLED_TOKENS = Object.values(TOKENS).filter((t) => t.enabledInV1);
