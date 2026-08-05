# Spraay — Address Book & Group Pay (Android v1)

A crypto address book with batch payments built in, powered by the live SprayContract on
Base. Non-custodial: your own wallet signs everything. See `SPRAAY-APP-BUILD-SPEC.md` for
the authoritative spec — **every address, endpoint, and constant in §1 of that document is
verified; do not substitute values.**

## Stack

- Expo (SDK 57) + React Native 0.86 + TypeScript, `expo-router` for navigation
- Reown AppKit v2 (WalletConnect v2) + wagmi v2 + viem v2 for the wallet and contract layer
- Contacts stored on-device only (build step 2) — no cloud, no accounts, no analytics

## Setup

1. **Install dependencies**

   ```
   npm install
   ```

2. **Get a Reown project id** — free, from <https://dashboard.reown.com>.

   ```
   cp .env.example .env
   # then set EXPO_PUBLIC_REOWN_PROJECT_ID=<your id>
   ```

   This id is not a secret; it identifies the app to the WalletConnect relay and ships in
   the bundle. It is the only configuration this app needs. Without it the app runs but
   the Connect button stays disabled and shows a setup notice.

3. **Run it.** Wallet connect needs a **development build**, not Expo Go — returning from
   a wallet app relies on the `spraay://` scheme, which Expo Go doesn't own.

   ```
   npx expo run:android          # requires Android SDK + a device/emulator
   # or, for a cloud build:
   npx eas build --profile development --platform android
   ```

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run android` | Dev server targeting Android |
| `npm run typecheck` | `tsc --noEmit` |

To verify the Android bundle compiles without a device:

```
npx expo export --platform android --output-dir /tmp/spraay-export
```

## Layout

```
app/                    expo-router routes
  _layout.tsx           polyfills → fonts → wallet providers → Stack
  index.tsx             step-1 wallet screen (becomes the Address Book in step 2)
src/
  config/
    chain.ts            Base chain id / RPC / SprayContract address  ← spec §1.1
    tokens.ts           USDC/USDT/DAI/EURC registry                 ← spec §1.3
    env.ts              Reown project id, gateway base URL, metadata
  wallet/
    appkit.ts           WagmiAdapter + createAppKit singleton
    wallets.ts          the curated sheet: MetaMask + Trust, their links and ids
    AllWalletsButtonStub.tsx  renders nothing — replaces AppKit's "All wallets" row
    allWalletsRemoval.js      the path match metro.config.js does that swap with
    storage.ts          AsyncStorage-backed AppKit session storage
    WalletProvider.tsx  AppKitProvider → WagmiProvider → QueryClient → <AppKit/>
    useWallet.ts        the one wallet hook screens use; Base chain-switch handling
    NetworkBanner.tsx   "wrong network → Switch" banner
  components/           Screen, Text (Fredoka/Inter), Button
  theme/                colors, fonts, radii, contact labels
```

## Notes for whoever picks this up

- **Import order is load-bearing.** `@walletconnect/react-native-compat` and
  `react-native-get-random-values` must be imported before anything that touches
  wagmi/viem. They're first in both `app/_layout.tsx` and `src/wallet/appkit.ts`.
- **`react-dom` is pinned via `overrides`.** Expo pins `react` at an exact version;
  `react-dom` (pulled in transitively by `expo-router`'s web deps) floats and will
  resolve to a newer patch whose peer range then conflicts. The `overrides` block in
  `package.json` keeps them in lockstep. Bump both together.
- **Fonts are imported per weight** (`@expo-google-fonts/inter/400Regular`, not
  `@expo-google-fonts/inter`). The package roots re-export every weight and drag ~6MB of
  unused italics into the bundle.
- **`createAppKit` is a singleton.** Calling it a second time returns the first instance
  and silently discards the new config, so it lives at module scope in `appkit.ts`.
- **The connect sheet is two wallets, and "All wallets" is gone.** Scrolling the explorer
  list crashed the app natively (black screen, nothing in Metro), so v1 cuts the surface:
  `includeWalletIds` stops the explorer returning anything but MetaMask and Trust, and
  `metro.config.js` swaps AppKit's unconditional "All wallets" row for a stub that renders
  nothing. `src/wallet/AllWalletsButtonStub.tsx` has the reasoning. If exotic wallets are
  ever asked for, the answer is a WalletConnect QR flow — not this list.

## Build progress (spec §6)

- [x] **1. Expo scaffold + wagmi/viem/AppKit wallet connect on Base (chain-switch handling)**
      — typechecks clean; Android bundle exports clean. Not yet run on a device (needs a
      Reown project id and an Android SDK).
- [ ] 2. Contacts store + Address Book + Add Contact
- [ ] 3. Payout Entry (rows, book picker, CSV, amount modes)
- [ ] 4. Contract layer (reads + writes, calldata unit tests)
- [ ] 5. Gateway client (validate-batch, estimate-batch, validate-address, resolve, health)
- [ ] 6. Review + signing stepper + Success
- [ ] 7. End-to-end proof on Base mainnet with real dust → `TESTING.md` **(needs sign-off — real funds)**
- [ ] 8. Play assets + privacy policy
- [ ] 9. `eas build` Android AAB → internal testing track

## Guards (spec §4 — non-negotiable)

- Batch payment is the product. Never stub it out.
- Base contract is `0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC` and nothing else.
- Never bypass the contract's 0.3% fee (e.g. by looping single transfers).
- Exact-amount approvals only — no infinite approve.
- No private key handling anywhere in this codebase.
- This repo only *consumes* gateway free endpoints; it never modifies the gateway.
