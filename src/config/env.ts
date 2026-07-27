/**
 * Build-time configuration read from Expo public env vars.
 *
 * The Reown (WalletConnect) project id is NOT a secret — it identifies the app to the
 * WalletConnect relay and is safe to ship in the bundle. There are no other secrets in
 * this app: it has no backend, no API keys, and never handles private keys (spec §4).
 */

/**
 * Structural match for AppKit's `Metadata` type, which isn't re-exported from its
 * public entry point. Declared here rather than importing from a transitive package.
 */
interface WalletMetadata {
  name: string;
  description: string;
  url: string;
  icons: string[];
  redirect?: { native?: string; universal?: string; linkMode?: boolean };
}

/** Gateway base URL — spec §1.4. Only free endpoints are called. */
export const GATEWAY_BASE_URL = 'https://gateway.spraay.app' as const;

/**
 * Reown AppKit / WalletConnect project id from https://dashboard.reown.com.
 * Set `EXPO_PUBLIC_REOWN_PROJECT_ID` in `.env` (see `.env.example`).
 */
export const REOWN_PROJECT_ID = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID ?? '';

export const HAS_REOWN_PROJECT_ID = REOWN_PROJECT_ID.length > 0;

/**
 * App metadata shown to the user inside their wallet during the connect handshake.
 * Not `as const` — AppKit's `Metadata` type wants a mutable `icons: string[]`.
 */
export const APP_METADATA: WalletMetadata = {
  name: 'Spraay',
  description: 'Address book with group payments. Non-custodial — you keep your keys.',
  url: 'https://spraay.app',
  icons: ['https://spraay.app/icon.png'],
  redirect: {
    native: 'spraay://',
    universal: 'https://spraay.app',
  },
};

export const SUPPORT_EMAIL = 'support@spraay.app' as const;
export const WEBSITE_URL = 'https://spraay.app' as const;
