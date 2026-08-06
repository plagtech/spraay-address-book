/**
 * ABI fragments for the calls this app makes — spec §1.2 (exact signatures, verified
 * 2026-07-26 against the live contract on Base).
 *
 * Only the functions the app actually calls are declared. Do not widen these from a
 * copied artifact without re-verifying against `SprayContract` at
 * `0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC` (spec §4).
 */

/** SprayContract — the subset used for sending and for read-side checks. */
export const SPRAY_ABI = [
  {
    type: 'function',
    name: 'sprayEqual',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'recipients', type: 'address[]' },
      { name: 'amountPerRecipient', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'sprayToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      {
        name: 'recipients',
        type: 'tuple[]',
        components: [
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'calculateTotalCost',
    stateMutability: 'view',
    inputs: [{ name: 'totalAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'calculateFee',
    stateMutability: 'view',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'MAX_RECIPIENTS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  /**
   * Emitted on a successful ERC-20 spray. The success screen confirms this event is
   * present in the receipt rather than trusting `status: 'success'` alone (spec §2
   * step 7) — a receipt can succeed for a transaction that did not do what we meant.
   *
   * Indexing (sender, token) matches the deployed contract; getting it wrong here
   * would silently shift the decoded args.
   */
  {
    type: 'event',
    name: 'SprayTokenExecuted',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'totalAmount', type: 'uint256', indexed: false },
      { name: 'recipientCount', type: 'uint256', indexed: false },
      { name: 'feeAmount', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const;

/** ERC-20 subset — allowance/balance reads and the exact-amount approve (spec §4). */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  /**
   * The standard ERC-20 event. Declared because `SprayTokenExecuted` carries the TOTALS
   * of a spray but not who was paid — so a receipt read back after the fact
   * (`tx/sprayReceipt.ts`) has only these logs to reconstruct the per-person breakdown
   * from.
   *
   * Verified against the live transaction rather than copied from an artifact: topic0 on
   * the USDC legs of `0xcb617e88…c615` is
   * `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`, with `from` and
   * `to` in the topics and the value alone in `data` — exactly this shape.
   */
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;
