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
- The `[wallet-diag link]` log tag, which is what existing notes and captures grep for.
  The logs are the surviving record of which link format opened the wallet —
  `getLastLaunch()` and its in-memory `LaunchRecord` went with the panel that read them.
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

#### Second pass — two surfaces were missed

On-device with a confirmed-fresh bundle, a receipt opened from History still read
"includes $0.00 protocol fee" for both recorded payments. The first pass fixed the two
surfaces that were grepped for and not the two that existed:

| Surface | File | First pass |
| --- | --- | --- |
| Review | `app/review.tsx` | fixed |
| Shared receipt text | `src/history/receipt.ts` | fixed |
| Receipt detail, opened from History | `app/receipt.tsx` | **missed** |
| Success screen | `app/success.tsx` | **missed** |

The two missed ones had their own copy of the line — `includes ${formatTokenDisplay(…)}
protocol fee` — rather than sharing a formatter, so fixing the shared receipt text did
nothing for the screen that displays a receipt. History list rows show the total only
and never had a fee line; the network-fee line in `GasCheckCard` is ETH gas, not this.

All three past-payment surfaces now make one call to `formatRecordFee`, so there is no
per-screen formatting left to get wrong.

#### The rate is measured against `total`, not `total - fee`

Fixing the above surfaced a wrong assumption in the first pass. A record's `total` is the
payout EXCLUDING the fee — `SprayTokenExecuted.totalAmount`, described in
`sprayReceipt.ts` as "the figure the fee is charged ON TOP of", and stored verbatim by
`buildSendRecordFromReceipt`. The first pass derived the rate as `fee / (total - fee)`,
which is wrong; it returned 0.3% for the dust runs only because integer division
truncated the error away.

A test fixture had encoded the same mistake — a 10.00 payout stored as `total:
10_030_000n` with 5.00 + 5.00 in its recipient rows, which cannot both be true. Fixed to
`10_000_000n`. A rate that rounds to "0%" is now reported as no rate at all, on the same
principle as the amount: `<$0.01` alone rather than `<$0.01 (0%)`.

#### "includes" was the wrong word — now "+"

Since `total` excludes the fee, the sender paid `total` AND `fee`. "Includes $0.03
protocol fee" on a $10.00 receipt described the fee as being inside a number it is not
inside — the same class of false claim as "$0.00", just in the copy rather than the
figure.

All three past-payment surfaces now read `+ $0.03 protocol fee`, or
`+ <$0.01 (0.3%) protocol fee` when the fee is sub-cent. `formatRecordFee` was not
touched — this was only the words around it. The shared receipt text also gained the
word "protocol", which the two screens already had.

#### Verified on device — 5 Aug 2026

History receipts render `+ <$0.01 (0.3%) protocol fee` on both dust-run records. That
closes the loop on the bug: the receipt detail screen opened from History is the exact
surface that was printing `$0.00`, and both records carry a real 900-base-unit fee.

## Resolved: the "Uncaught (in promise)" toast

The recurring `Uncaught (in promise, id: 0) Error: No ...` toast is no longer
reproducible as of `4279d7a` (the diagnostics strip).

Verified on device, 5 Aug 2026, with a clean Metro console across:

- payout composition — 2 contacts → Pay them together → Review
- a full wallet disconnect / reconnect pairing cycle

Attributed to a stale WalletConnect session artifact that the diagnostics strip
eliminated. Worth being precise about the strength of that claim: what is established is
that it no longer reproduces across the paths that used to trigger it. The attribution is
inference from what changed in `4279d7a` — `proposalCapture` attached a hook to the sign
client and `devReset` wrote to WalletConnect storage keys, either of which could leave a
promise rejecting unhandled — rather than a root cause traced to a specific line.

The practical consequence: if it ever returns, it is NOT the same bug closed by a
different mechanism, and the first thing to check is whether the pairing storage was
carrying state from a build that still had those modules.
