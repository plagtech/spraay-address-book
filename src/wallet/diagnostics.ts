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
        `prefix=${id.slice(0, 6)}… validShape=${/^[0-9a-f]{32}$/i.test(id)}`,
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

/**
 * Open a raw socket to the relay with our projectId. Success proves the transport and
 * credentials are fine and moves suspicion into AppKit's own init; failure names the
 * cause directly (bad projectId → close code 3000-range, no network → error).
 */
function probeRelaySocket() {
  const url = `wss://relay.walletconnect.org/?projectId=${REOWN_PROJECT_ID}`;
  console.log(tag('relay probe: opening…'));

  const started = Date.now();
  let settled = false;

  try {
    const ws = new WebSocket(url);

    const done = (what: string) => {
      if (settled) return;
      settled = true;
      console.log(tag(`relay probe: ${what} after ${Date.now() - started}ms`));
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    };

    ws.onopen = () => done('OPEN — transport and projectId accepted');
    ws.onerror = (e: unknown) => {
      const err = e as { message?: string };
      done(`ERROR — ${err?.message ?? 'no message'}`);
    };
    ws.onclose = (e: { code?: number; reason?: string }) =>
      done(`CLOSED code=${e?.code} reason=${e?.reason || '(none)'}`);

    setTimeout(() => done('TIMEOUT — no open/error/close within 12s'), 12_000);
  } catch (err) {
    console.warn(tag(`relay probe: threw synchronously — ${String(err)}`));
  }
}

/** Exported for clarity, but the side-effect import below is what actually runs it. */
export function installWalletDiagnostics() {
  console.log(tag('installing — JS context started'));
  trackUnhandledRejections();
  reportProjectId();
  reportEnvironment();
  probeRelaySocket();
}

/**
 * Runs on import. `_layout.tsx` imports this module bare, before the AppKit module, so
 * rejection tracking is armed before AppKit's constructor fires its un-awaited async
 * init. A function call from _layout would be too late — imports evaluate first.
 */
installWalletDiagnostics();
