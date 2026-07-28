/**
 * Wallet-connect diagnostics. TEMPORARY — this exists to find where AppKit init stalls
 * and should be removed once that is resolved.
 *
 * Why each probe is here:
 *
 * • Unhandled rejections. `AppKit`'s constructor calls `initControllers(config)` and
 *   `initConnectors()` — both `async` — with no `await` and no `.catch()`
 *   (AppKit.ts:108-110). Anything that throws inside them becomes an unhandled
 *   rejection, which React Native swallows by default. That produces exactly the
 *   observed symptom: "initialization started" logs, then silence. This turns those
 *   rejections back into visible output.
 *
 * • Context id. `createAppKit` guards its singleton on
 *   `Symbol.for('__REOWN_APPKIT_INSTANCE__')` on globalThis — a GLOBAL REGISTRY symbol,
 *   so it is shared across duplicate module copies. Two "Creating new instance" logs
 *   therefore cannot come from a re-render or a duplicated module; they can only mean
 *   two separate JS contexts. Stamping a per-context id makes reload-vs-double-init
 *   unambiguous.
 *
 * • projectId. Metro serves the dev bundle from the LOCAL .env, not from the EAS
 *   environment, so the value at runtime may differ from the one baked into the APK.
 *   An empty or malformed projectId makes the relay reject the socket.
 *
 * • WebSocket interceptor. A BARE probe socket proved nothing: the relay requires a
 *   signed `auth` JWT, so an unsigned connection always gets 401 whatever the project
 *   id — which is why the earlier probe failed identically for a real and a bogus id.
 *   Only AppKit's own signed connection is evidence, so the global constructor is
 *   wrapped before AppKit is imported to expose its real URL, JWT claims and close code.
 *
 * • Clock skew. The relay validates the JWT's iat/exp. A device clock outside the
 *   allowed window makes a correctly-signed token look expired, and the relay answers
 *   401 at the handshake — indistinguishable from a bad credential without measuring it.
 */
import { Linking } from 'react-native';
import * as Application from 'expo-application';

import { REOWN_PROJECT_ID } from '../config/env';

const CONTEXT_ID = Math.random().toString(36).slice(2, 8);

const tag = (msg: string) => `[wallet-diag ${CONTEXT_ID}] ${msg}`;

/** Surface rejections that AppKit's un-awaited init calls would otherwise swallow. */
function trackUnhandledRejections() {
  try {
    /**
     * React Native's promise polyfill ships rejection tracking but leaves it off in
     * release and unreliable in dev. Enabling it explicitly is the only way to see a
     * rejection thrown from an un-awaited async call.
     */
    const tracking = require('promise/setimmediate/rejection-tracking');
    tracking.enable({
      allRejections: true,
      onUnhandled: (id: number, error: unknown) => {
        const err = error as { message?: string; stack?: string };
        console.warn(
          tag(`UNHANDLED REJECTION #${id}: ${err?.message ?? String(error)}`),
        );
        if (err?.stack) console.warn(tag(`stack: ${err.stack}`));
      },
      onHandled: () => {},
    });
    console.log(tag('unhandled-rejection tracking enabled'));
  } catch (err) {
    console.warn(tag(`could not enable rejection tracking: ${String(err)}`));
  }
}

function reportProjectId() {
  const id = REOWN_PROJECT_ID;
  console.log(
    tag(
      `projectId: present=${id.length > 0} length=${id.length} ` +
        `validShape=${/^[0-9a-f]{32}$/i.test(id)}`,
    ),
  );
  /**
   * Full value on purpose. The Reown project id is NOT a secret — it identifies the app
   * to the relay and ships in the bundle (see config/env.ts) — and printing it is what
   * lets you compare against the dashboard when the relay rejects it.
   */
  console.log(tag(`projectId value: ${id}`));

  /**
   * Reown projects can restrict which app identifiers may use them. If an allowlist is
   * configured and this package name is not on it, the relay rejects an otherwise valid
   * id — so this is the value to check the dashboard against.
   */
  console.log(
    tag(
      `app identity: applicationId=${Application.applicationId ?? '(unknown)'} ` +
        `name=${Application.applicationName ?? '(unknown)'}`,
    ),
  );
}

function reportEnvironment() {
  console.log(
    tag(
      `env: WebSocket=${typeof globalThis.WebSocket} ` +
        `crypto=${typeof globalThis.crypto} ` +
        `getRandomValues=${typeof globalThis.crypto?.getRandomValues} ` +
        `TextEncoder=${typeof globalThis.TextEncoder} ` +
        `Buffer=${typeof (globalThis as { Buffer?: unknown }).Buffer}`,
    ),
  );

  /** The AppKit instance the singleton guard actually holds. */
  const existing = (globalThis as Record<symbol, unknown>)[
    Symbol.for('__REOWN_APPKIT_INSTANCE__')
  ];
  console.log(tag(`appkit singleton already present at startup: ${Boolean(existing)}`));
}

/** Dump every own property of an event — RN spreads useful detail inconsistently. */
function describeEvent(e: unknown): string {
  if (e === null || typeof e !== 'object') return String(e);
  const obj = e as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of ['code', 'reason', 'message', 'type', 'wasClean', 'isTrusted']) {
    if (obj[k] !== undefined) parts.push(`${k}=${JSON.stringify(obj[k])}`);
  }
  /** Catch anything the fixed list misses without dumping circular refs. */
  for (const k of Object.keys(obj)) {
    if (!['code', 'reason', 'message', 'type', 'wasClean', 'isTrusted'].includes(k)) {
      const v = obj[k];
      if (typeof v !== 'object' && typeof v !== 'function') {
        parts.push(`${k}=${JSON.stringify(v)}`);
      }
    }
  }
  return parts.length > 0 ? parts.join(' ') : '(no own properties)';
}

/**
 * HTTPS probe. Separates three cases the WebSocket cannot distinguish on its own:
 *   • request fails outright        → network/DNS/TLS blocked
 *   • 401/403                       → the project id is rejected or restricted
 *   • 200                           → credentials fine, problem is WebSocket-specific
 */
async function probeHttp(label: string, url: string) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.text().catch(() => '');
    console.log(
      tag(
        `http[${label}]: status=${res.status} ${res.ok ? 'OK' : res.statusText || ''} ` +
          `at ${Date.now() - started}ms body=${JSON.stringify(body.slice(0, 160))}`,
      ),
    );
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.log(
      tag(
        `http[${label}]: FAILED at ${Date.now() - started}ms — ` +
          `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`,
      ),
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Relay JSON-RPC tags. The relay itself only moves opaque encrypted blobs, so the `tag`
 * is the one field that says WHAT is being sent — which is exactly what distinguishes
 * "the proposal was never published" from "it was published and nobody answered".
 */
const RELAY_TAGS: Record<number, string> = {
  0: 'pairing_delete',
  1000: 'pairing_ping/req',
  1001: 'pairing_ping/res',
  1100: 'session_propose/REQUEST',
  1101: 'session_propose/RESPONSE',
  1102: 'session_settle/req',
  1103: 'session_settle/res',
  1104: 'session_update/req',
  1105: 'session_update/res',
  1106: 'session_extend/req',
  1108: 'session_ping/req',
  1110: 'session_delete',
  1112: 'session_request/REQUEST',
  1113: 'session_request/RESPONSE',
};

const describeTag = (tag: unknown) =>
  typeof tag === 'number' ? `${tag}${RELAY_TAGS[tag] ? ` (${RELAY_TAGS[tag]})` : ''}` : '?';

/** Outstanding relay requests, so a missing response is visible rather than inferred. */
const pendingRelayRequests = new Map<number, { method: string; tag: string; at: number }>();

const shortTopic = (t: unknown) =>
  typeof t === 'string' ? `${t.slice(0, 10)}…` : String(t);

/**
 * Decode one relay frame. Payloads are encrypted, so only envelope metadata is logged —
 * never any attempt at plaintext.
 */
function logRelayFrame(id: number, direction: 'SEND' | 'RECV', raw: unknown) {
  if (typeof raw !== 'string') {
    console.log(tag(`ws#${id} ${direction} non-string frame (${typeof raw})`));
    return;
  }

  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.log(tag(`ws#${id} ${direction} unparseable frame, ${raw.length} bytes`));
    return;
  }

  const rpcId = typeof msg.id === 'number' ? msg.id : undefined;
  const method = typeof msg.method === 'string' ? msg.method : undefined;
  const params = (msg.params ?? {}) as Record<string, unknown>;

  if (method) {
    /** irn_subscription wraps an inbound payload from the peer. */
    if (method === 'irn_subscription') {
      const data = (params.data ?? {}) as Record<string, unknown>;
      console.log(
        tag(
          `ws#${id} ${direction} ${method} topic=${shortTopic(data.topic)} ` +
            `bytes=${String(data.message ?? '').length} ← INBOUND FROM PEER`,
        ),
      );
      /** Any inbound peer frame means the wallet is alive and responding. */
      if (!proposalAnswered && proposalPublishedAt !== undefined) {
        proposalAnswered = true;
        console.log(
          tag(
            `PAIRING: wallet replied ${Date.now() - proposalPublishedAt}ms after ` +
              `session_propose was published`,
          ),
        );
      }
      return;
    }

    const t = describeTag(params.tag);
    console.log(
      tag(
        `ws#${id} ${direction} ${method} id=${rpcId} topic=${shortTopic(params.topic)} ` +
          `tag=${t}${params.ttl ? ` ttl=${params.ttl}` : ''}`,
      ),
    );

    if (direction === 'SEND' && params.tag === 1100) {
      proposalPublishedAt = Date.now();
      proposalAnswered = false;
      console.log(
        tag(
          `PAIRING: session_propose PUBLISHED to relay on topic=${shortTopic(params.topic)}`,
        ),
      );
      /**
       * The URI the wallet was given and the topic we publish on must agree, or the
       * wallet subscribes to one channel while the proposal sits on another.
       */
      if (lastPairingTopic && params.topic !== lastPairingTopic) {
        console.warn(
          tag(
            `PAIRING: TOPIC MISMATCH — deep link carried ${shortTopic(lastPairingTopic)} ` +
              `but the proposal was published on ${shortTopic(params.topic)}`,
          ),
        );
      }
    }

    if (direction === 'SEND' && rpcId !== undefined) {
      pendingRelayRequests.set(rpcId, { method, tag: t, at: Date.now() });
    }
    return;
  }

  /** No method → this is a response to one of our requests. */
  if (rpcId !== undefined) {
    const pending = pendingRelayRequests.get(rpcId);
    const waited = pending ? `${Date.now() - pending.at}ms` : '?';
    const outcome = msg.error ? `ERROR ${JSON.stringify(msg.error)}` : `ok=${JSON.stringify(msg.result)}`;
    console.log(
      tag(
        `ws#${id} ${direction} response id=${rpcId} ` +
          `for=${pending?.method ?? '(unknown)'} tag=${pending?.tag ?? '?'} ` +
          `after=${waited} ${outcome}`,
      ),
    );
    pendingRelayRequests.delete(rpcId);
    return;
  }

  console.log(tag(`ws#${id} ${direction} frame without id or method: ${raw.slice(0, 120)}`));
}

/**
 * Report anything still unanswered. A published `session_propose` with no response is
 * the signature of a proposal that reached the relay but that the wallet never picked
 * up or never replied to.
 */
function reportPendingRelayRequests() {
  if (pendingRelayRequests.size === 0) {
    console.log(tag('relay: no outstanding requests'));
    return;
  }
  for (const [id, p] of pendingRelayRequests) {
    console.warn(
      tag(
        `relay: STILL UNANSWERED id=${id} method=${p.method} tag=${p.tag} ` +
          `waiting ${Date.now() - p.at}ms`,
      ),
    );
  }
}

/**
 * Capture the deep link handed to the wallet.
 *
 * The pairing URI is the payload the wallet needs; a deep link that opens MetaMask but
 * carries no `wc:` URI explains a wallet that opens and then sits idle, and is a
 * completely different fault from a proposal that never reached the relay.
 */
function installLinkingInterceptor() {
  const flagged = globalThis as { __SPRAAY_LINKING_INTERCEPTED__?: boolean };
  if (flagged.__SPRAAY_LINKING_INTERCEPTED__) return;
  flagged.__SPRAAY_LINKING_INTERCEPTED__ = true;

  const original = Linking.openURL.bind(Linking);

  Linking.openURL = async (url: string) => {
    try {
      describeDeepLink(url);
    } catch (err) {
      console.warn(tag(`deep link: logging failed — ${String(err)}`));
    }

    /**
     * The RESULT matters as much as the URL. AppKit calls this through
     * `CoreHelperUtil.openLink`, which catches any failure and rethrows a generic
     * LINKING_ERROR that the UI renders as "not installed" — so the real reason a
     * wallet did not launch is destroyed before it reaches any screen. Logging it here
     * is the only place the actual error survives.
     */
    const started = Date.now();
    try {
      const result = await original(url);
      console.log(tag(`deep link: openURL RESOLVED after ${Date.now() - started}ms`));
      return result;
    } catch (err) {
      const e = err as { message?: string; code?: string };
      console.warn(
        tag(
          `deep link: openURL REJECTED after ${Date.now() - started}ms — ` +
            `${e?.code ? `[${e.code}] ` : ''}${e?.message ?? String(err)}`,
        ),
      );
      throw err;
    }
  };

  console.log(tag('Linking.openURL interceptor installed'));
}

function describeDeepLink(url: string) {
  /**
   * FULL url, deliberately untruncated. The suspicion under test is that MetaMask is
   * launched bare, and a truncated log would hide the `?uri=wc:…` payload that decides
   * it — the previous 120-char cut could have cropped exactly the evidence needed.
   */
  console.log(tag(`deep link FULL (${url.length} chars) → ${url}`));

  /** The wc URI may be embedded raw or percent-encoded inside the wallet's scheme. */
  const decoded = (() => {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  })();

  const wcIndex = decoded.indexOf('wc:');
  if (wcIndex < 0) {
    console.warn(
      tag(
        'deep link: NO wc: URI EMBEDDED — MetaMask is being opened bare, with nothing ' +
          'to pair against. This alone explains no approval prompt.',
      ),
    );
    return;
  }

  const wcUri = decoded.slice(wcIndex);
  const atIdx = wcUri.indexOf('@');
  const topic = wcUri.slice(3, atIdx > 0 ? atIdx : undefined);

  /**
   * Full pairing URI. It contains `symKey`, which is what lets a wallet decrypt the
   * proposal — treat this log line as sensitive. It is ephemeral (pairings expire in
   * minutes) and this is a temporary dev diagnostic, but do not paste it publicly while
   * the pairing is live.
   */
  console.log(tag(`deep link: wc URI (SENSITIVE, ephemeral) → ${wcUri}`));

  console.log(
    tag(
      `deep link: parsed topic=${shortTopic(topic)} ` +
        `relay-protocol=${/relay-protocol=([^&]+)/.exec(wcUri)?.[1] ?? '(none)'} ` +
        `symKey=${/symKey=([^&]+)/.test(wcUri) ? 'present' : 'MISSING'} ` +
        `version=${wcUri.startsWith('wc:') && wcUri.includes('@2') ? '2' : '?'} ` +
        `length=${wcUri.length}`,
    ),
  );

  /**
   * Record the pairing topic so it can be compared against what we actually publish on.
   * A URI handed to the wallet on one topic while the proposal goes out on another
   * would pair with nothing, and is invisible unless the two are compared.
   */
  lastPairingTopic = typeof topic === 'string' ? topic : undefined;
  console.log(tag(`deep link: expecting proposal traffic on topic=${shortTopic(topic)}`));

  /**
   * How long the pairing stays valid. If the wallet is still "processing" past this
   * moment, it is fetching a proposal that has already expired — which looks like a
   * hang on both sides rather than an error on either.
   */
  const expiryMatch = /expiryTimestamp=(\d+)/.exec(wcUri);
  if (expiryMatch?.[1]) {
    const expirySec = Number(expiryMatch[1]);
    pairingExpiresAt = expirySec * 1000;
    console.log(
      tag(
        `deep link: pairing expires ${new Date(pairingExpiresAt).toISOString()} ` +
          `(in ${Math.round((pairingExpiresAt - Date.now()) / 1000)}s)`,
      ),
    );
  } else {
    pairingExpiresAt = undefined;
    console.log(tag('deep link: no expiryTimestamp in the wc URI'));
  }
}

let pairingExpiresAt: number | undefined;

let lastPairingTopic: string | undefined;

/**
 * Watchdog for the "app just keeps spinning" case.
 *
 * Pending requests are otherwise only dumped when the socket closes — and a spinning
 * app is precisely the case where it never does. This reports outstanding relay traffic
 * on a timer so a proposal that was published and never answered becomes visible while
 * it is still happening.
 */
function startPairingWatchdog() {
  let ticks = 0;

  const timer = setInterval(() => {
    ticks += 1;

    if (pendingRelayRequests.size > 0) {
      reportPendingRelayRequests();
    }

    if (proposalPublishedAt !== undefined && !proposalAnswered) {
      const waited = Math.round((Date.now() - proposalPublishedAt) / 1000);
      const expiryNote =
        pairingExpiresAt === undefined
          ? ''
          : Date.now() > pairingExpiresAt
            ? ` — PAIRING HAS EXPIRED (${Math.round((Date.now() - pairingExpiresAt) / 1000)}s ago); ` +
              `a wallet still fetching it will never succeed`
            : ` — pairing valid for another ${Math.round((pairingExpiresAt - Date.now()) / 1000)}s`;

      console.warn(
        tag(
          `pairing watchdog: session_propose published ${waited}s ago with NO reply ` +
            `(topic=${shortTopic(lastPairingTopic)})${expiryNote}`,
        ),
      );
    }

    /**
     * Run for five minutes, not two. The wallet reportedly sits "processing", so the
     * question is whether a reply lands late — and giving up at two minutes would
     * answer that by assumption rather than by observation.
     */
    if (ticks >= 60) {
      console.log(tag('pairing watchdog: stopping after 5 minutes'));
      clearInterval(timer);
    }
  }, 5_000);
}

/** Set when a tag-1100 publish goes out; cleared when any peer frame comes back. */
let proposalPublishedAt: number | undefined;
let proposalAnswered = false;

/** base64url → JSON. No verification — we only want the claims, not to trust them. */
function decodeJwtPayload(jwt: string): Record<string, unknown> | undefined {
  try {
    const part = jwt.split('.')[1];
    if (!part) return undefined;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const BufferCtor = (globalThis as { Buffer?: typeof Buffer }).Buffer;
    if (!BufferCtor) return undefined;
    return JSON.parse(BufferCtor.from(padded, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Intercept every WebSocket the app opens.
 *
 * A bare probe socket is useless here: the relay requires a signed `auth` JWT, so an
 * unsigned connection ALWAYS gets 401 regardless of project id. That is why the earlier
 * probe returned 401 for both the real and bogus ids — expected, and no evidence.
 *
 * What matters is AppKit's OWN connection, which is signed. This wraps the global
 * constructor before AppKit is imported, so the real relay URL, its JWT claims and its
 * close code all become visible.
 *
 * Uses addEventListener rather than assigning onopen/onclose, so the library's own
 * handlers are never clobbered.
 */
function installWebSocketInterceptor() {
  const Original = globalThis.WebSocket;
  if (!Original) {
    console.warn(tag('no global WebSocket to intercept'));
    return;
  }

  const flagged = globalThis as { __SPRAAY_WS_INTERCEPTED__?: boolean };
  if (flagged.__SPRAAY_WS_INTERCEPTED__) return;
  flagged.__SPRAAY_WS_INTERCEPTED__ = true;

  let seq = 0;

  class InterceptedWebSocket extends Original {
    constructor(url: string, protocols?: string | string[], options?: unknown) {
      // @ts-expect-error RN's WebSocket takes a third options argument.
      super(url, protocols, options);

      const id = ++seq;
      const started = Date.now();
      const at = () => `${Date.now() - started}ms`;

      const isRelay = /relay\.walletconnect|walletconnect\.org|reown/i.test(url);
      /** Metro's HMR socket is noise; name it and move on. */
      const kind = isRelay ? 'RELAY' : 'other';

      if (!isRelay) {
        console.log(tag(`ws#${id} [${kind}] open→ ${url.slice(0, 80)}`));
      } else {
        describeRelayUrl(id, url);
      }

      this.addEventListener('open', () =>
        console.log(tag(`ws#${id} [${kind}] OPEN at ${at()}`)),
      );
      this.addEventListener('error', (e: unknown) =>
        console.log(tag(`ws#${id} [${kind}] ERROR at ${at()} — ${describeEvent(e)}`)),
      );
      this.addEventListener('close', (e: unknown) => {
        console.log(tag(`ws#${id} [${kind}] CLOSE at ${at()} — ${describeEvent(e)}`));
        if (isRelay) reportPendingRelayRequests();
      });

      /** Only relay traffic is decoded; Metro's HMR chatter would drown the log. */
      if (isRelay) {
        this.addEventListener('message', (e: unknown) => {
          const data = (e as { data?: unknown })?.data;
          logRelayFrame(id, 'RECV', data);
        });
        this.__diagId = id;
      }
    }

    /** Outbound frames are where publish/subscribe of the proposal becomes visible. */
    send(data: unknown) {
      if (this.__diagId !== undefined) {
        logRelayFrame(this.__diagId, 'SEND', data);
      }
      // @ts-expect-error RN's send signature is wider than the DOM lib's.
      return super.send(data);
    }

    /** Set only for relay sockets, so `send` stays silent for everything else. */
    __diagId?: number;
  }

  globalThis.WebSocket = InterceptedWebSocket as unknown as typeof WebSocket;
  console.log(tag('WebSocket interceptor installed'));
}

/** Break a relay URL into the parts that decide whether the handshake is accepted. */
function describeRelayUrl(id: number, url: string) {
  console.log(tag(`ws#${id} [RELAY] connecting`));

  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0) params.set(pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1)));
  }

  console.log(
    tag(
      `ws#${id} [RELAY] host=${url.split('?')[0]} ` +
        `params=[${[...params.keys()].join(',')}] ` +
        `projectId=${params.get('projectId') ?? '(none)'}`,
    ),
  );

  const auth = params.get('auth');
  if (!auth) {
    /** No JWT at all means the failure is upstream of the relay: signing never ran. */
    console.warn(tag(`ws#${id} [RELAY] NO auth JWT on the URL — signing did not happen`));
    return;
  }

  console.log(tag(`ws#${id} [RELAY] auth JWT present, length=${auth.length}`));

  const claims = decodeJwtPayload(auth);
  if (!claims) {
    console.warn(tag(`ws#${id} [RELAY] auth JWT payload could not be decoded`));
    return;
  }

  const iat = typeof claims.iat === 'number' ? claims.iat : undefined;
  const exp = typeof claims.exp === 'number' ? claims.exp : undefined;
  const nowSec = Math.floor(Date.now() / 1000);

  console.log(
    tag(
      `ws#${id} [RELAY] JWT iss=${String(claims.iss).slice(0, 24)}… ` +
        `aud=${String(claims.aud)} sub=${String(claims.sub).slice(0, 16)}…`,
    ),
  );
  console.log(
    tag(
      `ws#${id} [RELAY] JWT iat=${iat} (${iat ? new Date(iat * 1000).toISOString() : '?'}) ` +
        `exp=${exp} (${exp ? new Date(exp * 1000).toISOString() : '?'})`,
    ),
  );
  console.log(
    tag(
      `ws#${id} [RELAY] device now=${nowSec} (${new Date().toISOString()}) — ` +
        `JWT already expired: ${exp !== undefined ? exp < nowSec : 'unknown'}, ` +
        `issued in future: ${iat !== undefined ? iat > nowSec + 60 : 'unknown'}`,
    ),
  );
}

/**
 * Device clock skew against real time.
 *
 * The relay validates the JWT's iat/exp. A device clock off by more than the allowed
 * window makes a correctly-signed token look expired or not-yet-valid, and the relay
 * answers 401 at the handshake — exactly the observed failure. The Date response header
 * gives real time to within a second, which is ample to spot a meaningful skew.
 */
async function probeClockSkew() {
  const started = Date.now();
  try {
    const res = await fetch('https://cloudflare.com/cdn-cgi/trace');
    const finished = Date.now();
    const dateHeader = res.headers.get('date');

    if (!dateHeader) {
      console.log(tag('clock: no Date header, cannot measure skew'));
      return;
    }

    const serverMs = Date.parse(dateHeader);
    /** Midpoint of the request window is the fairest local comparison point. */
    const localMs = (started + finished) / 2;
    const skewMs = localMs - serverMs;

    console.log(
      tag(
        `clock: device=${new Date(localMs).toISOString()} ` +
          `server=${new Date(serverMs).toISOString()} ` +
          `skew=${Math.round(skewMs / 1000)}s ` +
          `(round-trip ${finished - started}ms)`,
      ),
    );

    if (Math.abs(skewMs) > 60_000) {
      console.warn(
        tag(
          `clock: SKEW OVER 60s — this alone can make the relay reject a valid JWT ` +
            `with 401 at the handshake.`,
        ),
      );
    }
  } catch (err) {
    console.log(tag(`clock: skew probe failed — ${String(err)}`));
  }
}

function runTransportProbes() {
  /**
   * The bare relay sockets from the previous revision are gone: unsigned connections
   * always get 401, so they proved nothing. The interceptor above watches AppKit's real
   * signed connection instead.
   */
  void probeClockSkew();

  /** Kept as the credential control — 200 here already confirmed the id is valid. */
  void probeHttp(
    'explorer+projectId',
    `https://explorer-api.walletconnect.com/v3/wallets?projectId=${REOWN_PROJECT_ID}&entries=1&page=1`,
  );
}

/** Exported for clarity, but the side-effect import below is what actually runs it. */
export function installWalletDiagnostics() {
  console.log(tag('installing — JS context started'));
  trackUnhandledRejections();
  /** Must be installed before AppKit is imported, or its relay socket is missed. */
  installWebSocketInterceptor();
  installLinkingInterceptor();
  startPairingWatchdog();
  reportProjectId();
  reportEnvironment();
  runTransportProbes();
}

/**
 * Runs on import. `_layout.tsx` imports this module bare, before the AppKit module, so
 * rejection tracking is armed before AppKit's constructor fires its un-awaited async
 * init. A function call from _layout would be too late — imports evaluate first.
 */
installWalletDiagnostics();
