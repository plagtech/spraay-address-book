# BUILD SPEC — Spraay Address Book & Group Pay (Android v1)

**Goal:** Ship a Google Play app: a crypto address book with batch payments (gift/payroll) built in, powered by the live SprayContract on Base. Non-custodial — the user's own wallet signs everything. The app is free; revenue is the contract's on-chain 0.3% protocol fee.

**Every value in this spec was verified live on 2026-07-26 against the gateway, the verified contract on Base, and Blockscout. Do not substitute other addresses, endpoints, or field names.**

---

## 1. VERIFIED FACTS (do not modify, do not guess)

### 1.1 SprayContract — Base mainnet
- Address: `0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC` (verified on Blockscout, name `SprayContract`). **Never use any other address for Base.**
- Chain: Base mainnet, chainId `8453`, RPC `https://mainnet.base.org`
- Live constants (read via eth_call): `MAX_RECIPIENTS = 200`, `feeBps = 30` (0.3%), `MAX_FEE_BPS = 500`, `paused = false`
- Unichain deployment exists (`0x08fA5D1c16CD6E2a16FC0E4839f262429959E073`, chainId 130) — **out of scope for v1**, Base only.

### 1.2 Contract functions the app calls (exact ABI signatures)
```solidity
// Same-amount mode (ERC-20):
sprayEqual(address token, address payable[] recipients, uint256 amountPerRecipient) payable

// Custom-amount mode (ERC-20):
sprayToken(address token, SprayContract.Recipient[] recipients) nonpayable
// struct Recipient { address payable recipient; uint256 amount; }

// Native ETH (v1.1, not v1):
sprayETH(Recipient[] recipients) payable

// Read helpers:
calculateFee(uint256 amount) view returns (uint256)
calculateTotalCost(uint256 totalAmount) view returns (uint256)  // amount + fee
MAX_RECIPIENTS() view returns (uint256)
feeBps() view returns (uint256)
paused() view returns (bool)
```
Success events to watch for in the receipt: `SprayTokenExecuted(sender, token, totalAmount, recipientCount, feeAmount, timestamp)`.

**Fee model:** the contract adds `feeBps` on top. For a batch totaling X tokens, the wallet must hold and approve `calculateTotalCost(X)`. Always call `calculateTotalCost` on-chain for the displayed total — never compute the fee locally with a hardcoded 30.

### 1.3 Token addresses (from `GET https://gateway.spraay.app/api/v1/tokens`, free)
| Token | Address (Base) | Decimals |
|---|---|---|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| USDT | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` | 6 |
| DAI  | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | 18 |
| EURC | `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42` | 6 |

v1 supports **USDC only** in the UI; keep the token layer generic so USDT/DAI/EURC are a config change.

### 1.4 Gateway free endpoints used by the app (base: `https://gateway.spraay.app`)
Rate limit: 60 req/min per IP. No API key.

- `POST /free/validate-batch` — BPA 1.0 validation. **Verified request shape:**
  ```json
  {"chain":"base","token":"USDC","recipients":[{"to":"0x…","amount":"5"}, …]}
  ```
  ⚠️ Recipient field is **`to`**, NOT `address` (verified: `address` returns per-row errors). Response: `{valid, errors[], warnings[], summary:{recipientCount, uniqueAddresses, totalAmount, …}}`. Call this before enabling the Review button.
- `GET /free/estimate-batch?recipients=N&chain=base` — rough cost. Returns `{estimate:{protocolFeeBps:30, estimatedGasUSD, …}}`. Use for the "≈ gas" hint only; on-chain `calculateTotalCost` is the source of truth for the fee.
- `GET /free/validate-address?…` — per-row address validation as the user types (debounce 400ms).
- `GET /free/resolve?name=vitalik.eth` — ENS/Basename resolution. **Known issue (verified):** returned `resolved:false` for `vitalik.eth` on 2026-07-26. Treat resolution as best-effort: if `resolved:false`, show "couldn't resolve — paste the 0x address" instead of failing. Do not block on this endpoint.
- `GET /health` — returns `{status:"healthy", …}`; ping on app start, show a banner if unhealthy.

**Do NOT call paid `/api/v1/*` x402 endpoints in v1.** The app signs contract calls directly from the user's wallet; monetization is the on-chain 30 bps fee. (x402 endpoints are the agent-facing product — out of scope here. Do not modify anything in the gateway repo; frozen backward-compat endpoints must not be touched.)

---

## 2. ARCHITECTURE

- **Stack:** Expo (React Native) + TypeScript. Target Android/Google Play first; keep iOS-compatible.
- **Wallet:** Reown AppKit (WalletConnect v2) + wagmi + viem. User connects MetaMask / Coinbase Wallet / Trust etc. **Non-custodial: the app never holds keys or funds, never has a backend that touches money.** (Embedded-wallet onboarding via Coinbase CDP is v1.1 — leave a seam, don't build it.)
- **Storage:** Contacts stored **on-device only** (expo-sqlite or AsyncStorage). No cloud sync, no accounts, no analytics SDK collecting addresses. This is a privacy selling point and keeps the Play data-safety form trivial.
- **No custom backend.** Gateway free endpoints + Base RPC + WalletConnect are the entire network surface.

### Transaction flow (ERC-20 batch)
1. Build recipient list → `POST /free/validate-batch` → must return `valid:true`.
2. Read `paused()` — if true, block with a friendly message.
3. Compute raw total (base units, 6 decimals for USDC) → `calculateTotalCost(total)` on-chain → display "Total incl. 0.3% protocol fee".
4. Check USDC `balanceOf(user) >= totalCost`; if not, disable send with "Not enough USDC".
5. Check `allowance(user, SprayContract)`; if insufficient → prompt `approve(SprayContract, totalCost)` (exact amount, not infinite).
6. Same-amount mode → `sprayEqual(USDC, address[], amountPerRecipient)`; custom mode → `sprayToken(USDC, [{recipient, amount}])`.
7. Wait for receipt → confirm `SprayTokenExecuted` event → success screen with Basescan link `https://basescan.org/tx/{hash}`.
8. Enforce `recipients.length <= 200` client-side with a clear message (read MAX_RECIPIENTS on-chain at startup, cache it — don't hardcode).

Handle: user rejection in wallet, chain-switch to Base (8453) if connected elsewhere, RPC timeout retry.

---

## 3. SCREENS (reference prototypes attached — match their UX, not pixel-perfect)

Reference files: `spraay-book-prototype.jsx` (book + labels + checkbox→pay), `spraay-payout-entry.jsx` (row entry + 📖 picker + CSV), `spraay-gifts-prototype.jsx` (mode presets + spray animation). Fonts: Fredoka (display) + Inter (body).

1. **Address Book (home).** Contact cards: name, colored label chip (Family/Team/Primary/Burner/Friend), shortened address, one-tap 📋 copy (with "Copied ✓" feedback). Search filters name OR address. Checkbox per card; selecting ≥1 slides up a dark bottom bar: "N selected — Pay them together →". `+ Add` opens Add Contact.
2. **Add Contact.** Name, address/ENS field (validate via `/free/validate-address`, resolve `.eth`/`.base.eth` via `/free/resolve` best-effort), label picker. Stub a disabled "🔗 Request an address" button labeled "coming soon" (v1.1 feature).
3. **Payout Entry.** 3 empty numbered rows by default. Each row: address input (or filled name+short address if picked from book), 📖 button → bottom-sheet book picker, × to clear/remove. `+ Add person` appends a row. `📄 Import list` toggles a paste box accepting `address` | `name,address` | `name,address,amount` per line (comma/tab/semicolon). Top toggle: **Same amount each** (single USDC field, hides per-row amounts) vs **Custom per person** (per-row $ field). Sticky bottom bar: live count + total + "Review →".
4. **Review.** List of names/addresses + amounts, subtotal, protocol fee line (from `calculateTotalCost`), gas hint (from `/free/estimate-batch`), "1 transaction · you keep your keys". Confirm → wallet signing flow (approve if needed, then spray). Show stepper: Validate ✓ → Approve → Send.
5. **Success.** 💧 spray animation (see gifts prototype), total, recipient count, Basescan link, "Save these people to your book" if any entered addresses aren't saved contacts, "Repeat this payout" button (pre-fills entry screen — no scheduling in v1).
6. **Settings.** Connected wallet, disconnect, network indicator (Base), export contacts (CSV share sheet), version, links to spraay.app + support email.

Copy tone: plain verbs, no crypto jargon beyond "USDC" and "wallet." The words "batch," "BPA," "x402" never appear in the UI.

---

## 4. GUARDS (non-negotiable)

- **MISSION-CRITICAL:** batch payment functionality is the core of this app — never stub it out or ship a build without it. Before finalizing: "Does this app execute batch payments against `0x1646…5eEC`? Is the 30 bps fee flowing to the contract's feeRecipient untouched?" If either is no, STOP and flag.
- Never hardcode a different contract address, never add code paths that bypass the fee (e.g., looping single transfers).
- Do not modify the gateway. This repo only consumes free endpoints.
- Exact-amount approvals only. No infinite approve.
- No private key handling anywhere in the codebase.

---

## 5. GOOGLE PLAY COMPLIANCE

- Category: Finance. Complete the **Financial Features declaration**; select the non-custodial option. The app must never receive, hold, or transmit user funds — signing happens in the user's wallet app.
- In-listing disclosure (include verbatim): "Spraay is a non-custodial sending tool. Your funds stay in your own wallet at all times; Spraay prepares group transactions that you approve and sign yourself. We cannot access, hold, freeze, or recover your funds."
- Title: `Crypto Address Book & Payroll` (29 chars). Developer name: Spraay. Short description: "Save wallet addresses with labels. Copy in one tap. Pay your team or family in one transaction — USDC on Base." Trademark footer: "Not affiliated with Circle or Coinbase. USDC is a trademark of Circle Internet Financial. Crypto transactions are irreversible — double-check addresses."
- "Up to 200 recipients in one transaction" is a verified on-chain claim (MAX_RECIPIENTS=200) — safe to use in listing.
- No words like "earn," "rewards," "free crypto," "airdrop" anywhere in app or listing.
- Data safety form: contacts stored locally, not transmitted; only network calls are RPC/gateway/WalletConnect.

---

## 6. BUILD ORDER & DEFINITION OF DONE

1. Expo scaffold + wagmi/viem/AppKit wallet connect on Base (chain-switch handling).
2. Contacts store + Address Book screen + Add Contact (local persistence, copy, labels, search).
3. Payout Entry screen (rows, book picker sheet, CSV parser, amount modes).
4. Contract layer: reads (`paused`, `MAX_RECIPIENTS`, `calculateTotalCost`, `balanceOf`, `allowance`) + writes (`approve`, `sprayEqual`, `sprayToken`) with viem; unit-test calldata encoding against the ABI above.
5. Gateway client: validate-batch (remember: `to`, not `address`), estimate-batch, validate-address, resolve (best-effort), health.
6. Review + signing stepper + Success.
7. **End-to-end proof on Base mainnet with real dust:** 2–3 recipients × $0.10 USDC, both modes (sprayEqual and sprayToken). Capture tx hashes in TESTING.md. This is the merge gate.
8. Play assets: adaptive icon, 4–6 screenshots (book, entry, review, success), feature graphic, privacy policy page on spraay.app.
9. `eas build` Android AAB → internal testing track.

**Done =** both spray modes confirmed on mainnet with events in the receipt, validate-batch wired pre-review, approvals exact-amount, contacts persist across restarts, no crash on wallet-rejection, and the app contains zero endpoints/addresses not listed in §1.

---

*Prototype JSX files accompany this spec as UX reference. Verified against gateway v3.8.1 and SprayContract on 2026-07-26.*
