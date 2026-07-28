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
 * • Relay socket. The one probe that separates "our config is wrong" from "the transport
 *   cannot open at all", and it exercises the same WebSocket the relay uses.
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
 * Open a raw relay socket and report EVERY event.
 *
 * The previous version settled on the first event and closed the socket, which
 * suppressed the close frame — and the close code is the part that names the cause.
 * The relay signals a rejected or restricted project with a close code (4xxx range)
 * rather than a message, so an "error with no message" alone is uninformative.
 *
 * `label` lets the caller run the same probe with a deliberately invalid projectId, so
 * a credential rejection can be told apart from the transport being blocked outright:
 * identical failures for both means transport, differing failures means credentials.
 */
function probeRelaySocket(projectId: string, label: string) {
  const url = `wss://relay.walletconnect.org/?projectId=${projectId}`;
  const started = Date.now();
  const at = () => `${Date.now() - started}ms`;

  console.log(tag(`relay[${label}]: opening (projectId ${projectId.slice(0, 6)}…)`));

  try {
    const ws = new WebSocket(url);

    ws.onopen = () => console.log(tag(`relay[${label}]: OPEN at ${at()}`));

    /** Do NOT close here — that would suppress the close frame we are after. */
    ws.onerror = (e: unknown) =>
      console.log(tag(`relay[${label}]: ERROR at ${at()} — ${describeEvent(e)}`));

    ws.onclose = (e: unknown) =>
      console.log(tag(`relay[${label}]: CLOSE at ${at()} — ${describeEvent(e)}`));

    setTimeout(() => {
      console.log(
        tag(`relay[${label}]: final readyState=${ws.readyState} at ${at()} (0=CONNECTING 1=OPEN 2=CLOSING 3=CLOSED)`),
      );
      try {
        ws.close();
      } catch {
        /* already gone */
      }
    }, 10_000);
  } catch (err) {
    console.warn(tag(`relay[${label}]: threw synchronously — ${String(err)}`));
  }
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
 * Reown restricts a project to an allowlist of bundle ids / package names. An Android
 * package that is not on the list is rejected at the relay even though the id itself is
 * valid — which looks exactly like this failure. These probes send the same id over
 * HTTPS so the status code can say which it is.
 */
function runTransportProbes() {
  const real = REOWN_PROJECT_ID;
  /** Well-formed but certainly not a real project — the control for comparison. */
  const bogus = '00000000000000000000000000000000';

  probeRelaySocket(real, 'real');
  /** Staggered so the two sockets' logs do not interleave confusingly. */
  setTimeout(() => probeRelaySocket(bogus, 'bogus-control'), 3_000);

  void probeHttp(
    'explorer+projectId',
    `https://explorer-api.walletconnect.com/v3/wallets?projectId=${real}&entries=1&page=1`,
  );
  void probeHttp(
    'explorer+bogus',
    `https://explorer-api.walletconnect.com/v3/wallets?projectId=${bogus}&entries=1&page=1`,
  );
  void probeHttp(
    'rpc+projectId',
    `https://rpc.walletconnect.org/v1/?chainId=eip155:8453&projectId=${real}`,
  );
  /** Plain reachability: expect 4xx (not a WS upgrade), which still proves DNS+TLS. */
  void probeHttp('relay-https-reachability', 'https://relay.walletconnect.org');
  /** Control for "is any outbound HTTPS working at all". */
  void probeHttp('internet-control', 'https://cloudflare.com/cdn-cgi/trace');
}

/** Exported for clarity, but the side-effect import below is what actually runs it. */
export function installWalletDiagnostics() {
  console.log(tag('installing — JS context started'));
  trackUnhandledRejections();
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
