/**
 * Capture the DECRYPTED session proposal. TEMPORARY diagnostic tooling.
 *
 * ── Why the existing WebSocket interceptor cannot do this ────────────────────────
 * `diagnostics.ts` logs relay frames, but the relay only ever moves opaque ciphertext:
 * every `irn_publish` payload is sealed with the pairing's `symKey` before it reaches the
 * socket. So the interceptor can prove a proposal was PUBLISHED and never answered —
 * which it did — but it can never show WHAT we published. Comparing our MetaMask
 * proposal against our Trust proposal needs plaintext, and plaintext only exists one
 * layer down, in `core.crypto`.
 *
 * `Core.crypto.encode(topic, payload)` receives the JSON-RPC request object before it is
 * sealed; `Core.crypto.decode(topic, encoded)` returns the peer's request after it is
 * opened. Wrapping that pair yields both directions in the clear, without touching the
 * relay, the transport, or any wallet-specific code path.
 *
 * ── Reaching the instance ────────────────────────────────────────────────────────
 * `appKit.walletConnectConnector.provider` is the `UniversalProvider`
 * (AppKit.js:289 → WalletConnectConnector.init), and `provider.client.core` is the Core.
 * It does not exist at import time — `init()` is async — so this polls until it appears.
 *
 * ── What this changes about the running app ──────────────────────────────────────
 * Nothing, unless a dev flag is on. `encode`/`decode` are wrapped, observed, and
 * delegated unmodified. The Trust Wallet path is untouched by design: it is the working
 * reference and every experiment here is additive and off by default.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BASE_CHAIN_ID } from '../config/chain';
import { getDevFlags } from './devFlags';

const tag = (msg: string) => `[proposal-capture] ${msg}`;

const CAPTURE_KEY_PREFIX = 'spraay.dev.capture.';

/** JSON-RPC methods worth calling out by name in the log. */
const SESSION_PROPOSE = 'wc_sessionPropose';

type InboundFrame = {
  atMs: number;
  sincePublishMs?: number;
  method?: string;
  topic: string;
  summary: string;
};

export type ProposalCapture = {
  wallet: string;
  capturedAt: string;
  topic: string;
  /** Full `params` of the wc_sessionPropose request, verbatim. */
  proposal: unknown;
  inbound: InboundFrame[];
};

/**
 * Which wallet the user tapped. The proposal payload itself does not say — it is
 * identical regardless of destination — so this is read from the deep link, which is the
 * only place the target is named. `diagnostics.ts` calls this from its openURL hook.
 */
let currentWallet = 'unknown';
let proposalPublishedAtMs: number | undefined;

export function noteWalletTarget(url: string) {
  const host = /^[a-z]+:\/\/([^/?#]+)/i.exec(url)?.[1] ?? url.slice(0, 24);
  /**
   * `cbwallet` is matched explicitly. Once Base moved to its native scheme the url became
   * `cbwallet://wc?uri=…`, which matches NONE of the universal-link patterns — `cb-w` is
   * hyphenated and does not occur in it — so the host fallback took over and captured
   * every Base run under the name "wc", quietly making `diffCaptures('base', …)` find
   * nothing. Keep a pattern here for both the scheme and the universal link of any wallet
   * that has two launch paths.
   */
  const known: Array<[RegExp, string]> = [
    [/metamask/i, 'metamask'],
    [/trustwallet|trust/i, 'trust'],
    [/cbwallet|cb-w|coinbase|base\.app|toshi/i, 'base'],
  ];
  currentWallet = known.find(([p]) => p.test(url))?.[1] ?? host;
  console.log(tag(`target wallet = ${currentWallet} (from ${host})`));
}

/** Truncate deep structures for the summary line without hiding the shape. */
function summarise(payload: Record<string, unknown>): string {
  const method = payload.method;
  if (typeof method === 'string') return `request ${method}`;
  if ('result' in payload) return 'response ok';
  if ('error' in payload) return `response ERROR ${JSON.stringify(payload.error)}`;
  return 'frame';
}

async function persist(capture: ProposalCapture) {
  try {
    await AsyncStorage.setItem(
      `${CAPTURE_KEY_PREFIX}${capture.wallet}`,
      JSON.stringify(capture),
    );
  } catch (err) {
    console.warn(tag(`could not persist capture: ${String(err)}`));
  }
}

let lastCapture: ProposalCapture | undefined;

function onOutbound(topic: string, payload: Record<string, unknown>) {
  if (payload.method !== SESSION_PROPOSE) {
    /** Everything else is session traffic; one line is enough to keep the order clear. */
    console.log(tag(`→ OUT ${summarise(payload)} topic=${topic.slice(0, 10)}…`));
    return;
  }

  proposalPublishedAtMs = Date.now();

  const params = (payload.params ?? {}) as Record<string, unknown>;

  console.log(tag(`══════ ${SESSION_PROPOSE} → ${currentWallet} ══════`));
  /**
   * Pretty-printed and untruncated on purpose. This is the artefact the whole exercise
   * exists to produce, and a wrapped or elided field is exactly where a difference
   * between the MetaMask and Trust proposals would hide.
   */
  console.log(JSON.stringify(params, null, 2));

  /** Call out the fields most likely to decide whether a wallet accepts the proposal. */
  const required = params.requiredNamespaces as Record<string, unknown> | undefined;
  const optional = params.optionalNamespaces as Record<string, unknown> | undefined;
  const proposer = params.proposer as Record<string, unknown> | undefined;
  const metadata = (proposer?.metadata ?? {}) as Record<string, unknown>;
  const icons = Array.isArray(metadata.icons) ? (metadata.icons as string[]) : [];

  console.log(
    tag(
      `namespaces: required=[${Object.keys(required ?? {}).join(',') || 'EMPTY'}] ` +
        `optional=[${Object.keys(optional ?? {}).join(',') || 'EMPTY'}]`,
    ),
  );
  console.log(
    tag(
      `metadata: name=${JSON.stringify(metadata.name)} url=${JSON.stringify(metadata.url)} ` +
        `icons=${icons.length}${icons.length ? ` first=${JSON.stringify(icons[0])}` : ''}`,
    ),
  );

  /**
   * Metadata rules some wallets enforce and reject silently when broken. Flagged here
   * rather than assumed correct, because a silent drop is precisely the symptom.
   */
  if (icons.length === 0) console.warn(tag('metadata: NO ICONS — some wallets reject this'));
  for (const icon of icons) {
    if (!/^https:\/\//i.test(icon)) {
      console.warn(tag(`metadata: icon is not https — ${icon}`));
    }
  }
  if (typeof metadata.url === 'string' && !/^https:\/\//i.test(metadata.url)) {
    console.warn(tag(`metadata: url is not https — ${metadata.url}`));
  }

  lastCapture = {
    wallet: currentWallet,
    capturedAt: new Date().toISOString(),
    topic,
    proposal: params,
    inbound: [],
  };
  void persist(lastCapture);
  console.log(tag(`capture saved as "${currentWallet}" — compare with diffCaptures()`));
}

function onInbound(topic: string, payload: Record<string, unknown>) {
  const frame: InboundFrame = {
    atMs: Date.now(),
    sincePublishMs:
      proposalPublishedAtMs === undefined ? undefined : Date.now() - proposalPublishedAtMs,
    method: typeof payload.method === 'string' ? payload.method : undefined,
    topic,
    summary: summarise(payload),
  };

  console.log(
    tag(
      `← IN ${frame.summary} topic=${topic.slice(0, 10)}…` +
        (frame.sincePublishMs !== undefined ? ` (+${frame.sincePublishMs}ms)` : ''),
    ),
  );
  console.log(JSON.stringify(payload, null, 2));

  if (lastCapture) {
    lastCapture.inbound.push(frame);
    void persist(lastCapture);
  }
}

/**
 * Force `eip155` into `requiredNamespaces`.
 *
 * ── Why this is the inverse of the obvious experiment ────────────────────────────
 * The natural experiment is "move everything to optionalNamespaces". That is already
 * what ships. `WalletConnectConnector.connect` calls
 * `provider.connect({ optionalNamespaces })` with no `namespaces`, and
 * `UniversalProvider.setNamespaces` does:
 *
 *     this.optionalNamespaces = merge(namespaces ?? {}, optionalNamespaces ?? {})
 *
 * — it never assigns `this.namespaces`. `pair()` then sends
 * `requiredNamespaces: this.namespaces`, i.e. undefined. So our proposals ALREADY carry
 * empty required namespaces with everything optional, and running that experiment would
 * rebuild the app to change nothing.
 *
 * The untested direction is the opposite one, and it has a plausible mechanism: a wallet
 * that keys its proposal handling off `requiredNamespaces` has nothing to match on in an
 * optional-only proposal. Since `setNamespaces` leaves `this.namespaces` alone, assigning
 * it here survives the subsequent `connect()` call and lands in the published proposal —
 * where the capture above will show it, so the experiment verifies itself.
 */
export function applyNamespaceExperiment(provider: Record<string, unknown>) {
  if (!getDevFlags().forceRequiredNamespaces) return;

  const namespaces = {
    eip155: {
      chains: [`eip155:${BASE_CHAIN_ID}`],
      methods: [
        'eth_sendTransaction',
        'personal_sign',
        'eth_signTypedData_v4',
        'eth_accounts',
        'eth_chainId',
      ],
      events: ['chainChanged', 'accountsChanged'],
    },
  };

  provider.namespaces = namespaces;
  console.warn(
    tag(
      'EXPERIMENT ON — forcing requiredNamespaces=' +
        `${JSON.stringify(Object.keys(namespaces))}. This is NOT stock behaviour; ` +
        'turn it off to restore the reference config.',
    ),
  );
}

/** Guard so a fast refresh cannot wrap `encode` twice and double-log every frame. */
const attachFlag = globalThis as { __SPRAAY_PROPOSAL_CAPTURE__?: boolean };

function wrapCrypto(core: Record<string, any>): boolean {
  const crypto = core?.crypto;
  if (!crypto || typeof crypto.encode !== 'function' || typeof crypto.decode !== 'function') {
    return false;
  }

  const originalEncode = crypto.encode.bind(crypto);
  const originalDecode = crypto.decode.bind(crypto);

  crypto.encode = async (topic: string, payload: Record<string, unknown>, opts?: unknown) => {
    /**
     * Observation must never be able to break the connection, so every failure inside
     * the hook is swallowed and the original call still runs.
     */
    try {
      onOutbound(topic, payload);
    } catch (err) {
      console.warn(tag(`outbound hook failed: ${String(err)}`));
    }
    return originalEncode(topic, payload, opts);
  };

  crypto.decode = async (topic: string, encoded: string, opts?: unknown) => {
    const payload = await originalDecode(topic, encoded, opts);
    try {
      onInbound(topic, payload as Record<string, unknown>);
    } catch (err) {
      console.warn(tag(`inbound hook failed: ${String(err)}`));
    }
    return payload;
  };

  return true;
}

/**
 * Poll for the provider and attach.
 *
 * `UniversalProvider.init` is async and runs well after module evaluation, so there is no
 * import-time hook point. Polling is the honest way to wait for it; it stops as soon as
 * it succeeds and gives up loudly rather than retrying forever.
 */
export function attachProposalCapture() {
  if (!getDevFlags().captureProposals) {
    console.log(tag('disabled by dev flag'));
    return;
  }
  if (attachFlag.__SPRAAY_PROPOSAL_CAPTURE__) return;

  let attempts = 0;

  const timer = setInterval(() => {
    attempts += 1;

    /**
     * Required lazily: `appkit.ts` builds the AppKit instance at module scope, and a
     * static import here would make this module part of that cycle.
     */
    let provider: Record<string, any> | undefined;
    try {
      const { appKit } = require('./appkit') as { appKit: Record<string, any> };
      provider = appKit?.walletConnectConnector?.provider;
    } catch (err) {
      console.warn(tag(`could not reach appkit: ${String(err)}`));
    }

    const core = provider?.client?.core;
    if (core && wrapCrypto(core)) {
      attachFlag.__SPRAAY_PROPOSAL_CAPTURE__ = true;
      clearInterval(timer);
      console.log(tag(`attached to core.crypto after ${attempts} attempt(s)`));
      applyNamespaceExperiment(provider as Record<string, unknown>);
      return;
    }

    if (attempts >= 120) {
      clearInterval(timer);
      console.warn(
        tag(
          'gave up after 60s — provider never appeared at ' +
            'appKit.walletConnectConnector.provider.client.core. The AppKit internals ' +
            'may have moved; check WalletConnectConnector.init.',
        ),
      );
    }
  }, 500);
}

/* ────────────────────────── comparison ────────────────────────── */

/**
 * Fields that MUST differ between two runs. Diffing without excluding these buries the
 * one meaningful difference under a wall of expected key material.
 */
const VOLATILE = [
  /^id$/,
  /publicKey/i,
  /^pairingTopic$/,
  /^expiry/i,
  /^expiryTimestamp$/,
  /symKey/i,
  /^relays?\.\d+\.data$/,
];

const isVolatile = (path: string) =>
  VOLATILE.some((p) => p.test(path) || p.test(path.split('.').pop() ?? ''));

function deepDiff(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (isVolatile(path)) return out;

  const bothObjects =
    a !== null && b !== null && typeof a === 'object' && typeof b === 'object';

  if (!bothObjects) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push(`${path || '(root)'}\n    A: ${JSON.stringify(a)}\n    B: ${JSON.stringify(b)}`);
    }
    return out;
  }

  const keys = new Set([
    ...Object.keys(a as object),
    ...Object.keys(b as object),
  ]);
  for (const k of keys) {
    deepDiff(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      path ? `${path}.${k}` : k,
      out,
    );
  }
  return out;
}

/**
 * Side-by-side comparison of two stored proposals.
 *
 * Run a MetaMask attempt, then a Trust attempt, then call this. Anything it prints is a
 * real difference in what we sent — volatile key material is excluded, so an empty result
 * means the two proposals were identical and the difference is entirely wallet-side.
 */
export async function diffCaptures(
  walletA = 'metamask',
  walletB = 'trust',
): Promise<string[]> {
  const read = async (w: string): Promise<ProposalCapture | undefined> => {
    const raw = await AsyncStorage.getItem(`${CAPTURE_KEY_PREFIX}${w}`);
    return raw ? (JSON.parse(raw) as ProposalCapture) : undefined;
  };

  const [a, b] = await Promise.all([read(walletA), read(walletB)]);

  if (!a || !b) {
    const missing = [!a && walletA, !b && walletB].filter(Boolean).join(' and ');
    console.warn(tag(`no capture stored for ${missing} — run a connect attempt first`));
    return [];
  }

  console.log(tag(`══════ ${walletA} vs ${walletB} ══════`));
  console.log(tag(`A: ${walletA} captured ${a.capturedAt}, ${a.inbound.length} inbound frame(s)`));
  console.log(tag(`B: ${walletB} captured ${b.capturedAt}, ${b.inbound.length} inbound frame(s)`));

  const diffs = deepDiff(a.proposal, b.proposal);

  if (diffs.length === 0) {
    console.log(
      tag(
        'PROPOSALS ARE IDENTICAL apart from keys and ids. What we publish is not the ' +
          'variable — the difference is in how each wallet handles it.',
      ),
    );
  } else {
    console.warn(tag(`${diffs.length} DIFFERENCE(S):`));
    diffs.forEach((d) => console.warn(`  • ${d}`));
  }

  /** The inbound counts are the other half of the story: zero is the MetaMask symptom. */
  console.log(
    tag(
      `inbound: ${walletA}=${a.inbound.length} ${walletB}=${b.inbound.length}` +
        (a.inbound.length === 0 ? ` — ${walletA} never answered` : ''),
    ),
  );

  return diffs;
}
