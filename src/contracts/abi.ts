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
] as const;
