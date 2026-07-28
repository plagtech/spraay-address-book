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
      this.addEventListener('close', (e: unknown) =>
        console.log(tag(`ws#${id} [${kind}] CLOSE at ${at()} — ${describeEvent(e)}`)),
      );
    }
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
