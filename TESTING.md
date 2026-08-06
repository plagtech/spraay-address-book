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

Both items below were unblocked by the dust gate passing, and both are now DONE. Kept
here with their reasoning because the decisions outlast the diff.

### 1. Strip the diagnostics scaffolding — DONE

Previously agreed, blocked on the wallet work being settled. The scheme switch is
verified and Step 7 has passed, so the scaffolding had done its job.

Removed:

- `src/wallet/diagnostics.ts`, `devReset.ts`, `devFlags.ts`, `proposalCapture.ts`
- their wiring in `app/_layout.tsx` — the bare `diagnostics` import and the
  `loadDevFlags().then(attachProposalCapture)` effect
- the Diagnostics panel in `app/settings.tsx` (the panel only — the Settings screen
  itself is product)
- `symKey` logging: `diagnostics.ts` logged whether `symKey` was present in the pairing
  URI and `proposalCapture.ts` carried a `symKey` redaction pattern. Both went with
  their files. The only surviving mention in the tree is prose in `wallets.ts`
  explaining a tested finding — it logs nothing.

Kept, deliberately:

- `src/wallet/walletLinking.ts` — the shipping native-scheme-first launch path, not
  instrumentation. Deleting it would silently revert MetaMask to its universal link.
  Its import in `_layout.tsx` was ordered after `diagnostics` so the wrappers nested;
  with diagnostics gone it only has to precede anything that imports AppKit, and the
  comment there now says so.
- `getLastLaunch()` in that module — no UI reads it since the panel went, kept as a
  debugger handle.
- The `[wallet-diag link]` log tag, which is what existing notes and captures grep for.
- `pendingSend` / reconcile / backfill — product code, and the reason Run 1 was
  recoverable at all.

### 2. Fee display: never show "$0.00" — DONE

A sub-cent fee rendered as `$0.00`: the dust runs charged 0.0009 USDC and the UI rounded
it to zero. Showing a user "$0.00" for a fee we do charge is a claim we cannot make.

It now reads `<$0.01 (0.3%)` when the fee is non-zero but rounds below a cent. The rate
is the honest part of the disclosure at these amounts; the rounded number is not.

The rule lives in one place — `formatFeeDisplay` in `src/tx/amounts.ts` — because two
surfaces render the same value and both were wrong:

- `app/review.tsx` — the review screen, where the user sees the fee before signing. The
  rate comes from the contract's `feeBps` via `useContractConstants`, not a literal.
- `src/history/receipt.ts` — shared receipt text. The `record.fee > 0n` guard means a
  genuinely zero fee prints no line at all, so the bug only bit on sub-cent fees: a
  0.0009 fee printed "Includes $0.00 fee". Same false claim, and this one leaves the app
  — it goes wherever the user shares the receipt. Its rate is derived from the record
  (`fee / (total - fee)`) so an old receipt keeps describing the fee actually taken.

Covered by tests in `src/tx/__tests__/amounts.test.ts` and
`src/history/__tests__/receipt.test.ts`, both using the real dust-run figures.
