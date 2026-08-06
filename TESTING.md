# Testing

Record of end-to-end payment tests run against Base mainnet with real funds, plus the
work that must happen before this ships.

## Step 7 — dust test (PASSED)

Two runs, both verified on Basescan. Test wallet `0x6d8f...219e`, MetaMask mobile,
3 recipients, USDC on Base.

### Run 1 — `sprayEqual`, 3 × $0.10

Tx `0xcb617e8849167603ea793806da5447bfe70c22ca75e8a45d54a15ac08bceb615`

On chain:

- 0.3009 USDC pulled in from the sender (subtotal 0.30 + fee 0.0009)
- 3 × 0.10 USDC transfers out, one per recipient
- 0.0009 USDC to the fee collector (30 bps)

The app failed to detect success on this run. The chain accepted the payment and the
money moved correctly; the app just never resolved the send, so no Success screen and no
History entry. That was a pre-`70195ea` bug — fixed in `70195ea`, which also backfills
payments the chain accepted but the app missed. The Run 1 entry was verified present in
History after the fix.

### Run 2 — `sprayToken`, $0.10 / $0.15 / $0.05

Tx `0x382e107aa55a3bbe668b2ba7b300667aea7f4e64559525d52cf0d40b8070a329`

Same 3 recipients, uneven amounts. Fee 0.0009 USDC.

This run doubled as on-device verification of `70195ea`. All three confirmed live:

- wallet auto-foregrounds on the first request
- Success screen shown
- History recorded

### Conditions common to both runs

- The user was present for every signature. Nothing was signed unattended.
- Approvals were exact-amount and confirmed in MetaMask on both runs. Each run took a
  fresh approval that was then fully consumed — that is by design, not a leak.
- Gateway validation ran **fail-open** on both runs: carrier DNS blocked the phone from
  reaching the gateway. The gateway itself was confirmed up via the Railway dashboard
  (serving 402s normally), so this was a network-path problem on the handset, not an
  outage. Recipient addresses were manually verified instead. Fail-open under an
  unreachable gateway is the intended behaviour; it has now been exercised for real.

## Pre-production checklist

### 1. Strip the diagnostics scaffolding

Previously agreed, blocked on the wallet work being settled. Now unblocked — the scheme
switch is verified and Step 7 has passed, so the scaffolding has done its job.

Remove:

- `src/wallet/diagnostics.ts` (and its load-bearing import in `app/_layout.tsx` — check
  the ordering comments there before deleting; `proposalCapture` is sequenced against it)
- `src/wallet/devReset.ts`
- `src/wallet/devFlags.ts` (`loadDevFlags` call in `app/_layout.tsx`)
- `src/wallet/proposalCapture.ts` (`attachProposalCapture` call in `app/_layout.tsx`)
- the settings panel (`app/settings.tsx`) and its route
- `symKey` logging — `diagnostics.ts` logs whether `symKey` is present in the pairing
  URI, and `proposalCapture.ts` carries a `symKey` redaction pattern. Both go with their
  files; confirm nothing else logs pairing material afterwards.

### 2. Fee display: never show "$0.00"

A sub-cent fee currently renders as `$0.00` on the review screen — the dust runs charged
0.0009 USDC and the UI rounded it to zero. Showing a user "$0.00" for a fee we do charge
is a claim we cannot make.

Change it to `<$0.01 (0.3%)` when the fee is non-zero but rounds below a cent. The rate
is the honest part of the disclosure at these amounts; the rounded number is not.
