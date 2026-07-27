/**
 * Transport for the gateway's free endpoints (spec §1.4).
 *
 * Rules this module enforces:
 *   • Only `/free/*` and `/health`. The paid `/api/v1/*` x402 endpoints are the
 *     agent-facing product and are explicitly out of scope for v1 (spec §1.4).
 *   • No API key, no auth header — these endpoints take none.
 *   • Rate limit is 60 req/min per IP, so callers debounce and cache; a 429 is
 *     reported as its own kind so the UI can say "slow down" rather than "broken".
 *
 * Every response is treated as untrusted JSON. The gateway is a separate service that
 * can change shape, and a payments screen must not crash or, worse, silently read
 * `undefined` as "valid" because a field moved.
 */
import { GATEWAY_BASE_URL } from '../config/env';

export type GatewayErrorKind =
  /** Could not reach the gateway at all — offline, DNS, TLS. */
  | 'network'
  /** Took too long. */
  | 'timeout'
  /** 429 — the 60/min budget is spent. */
  | 'rate-limit'
  /** 5xx, or a 4xx we don't have specific handling for. */
  | 'server'
  /** Reached it, but the body wasn't the shape we need. */
  | 'bad-response';

export class GatewayError extends Error {
  readonly kind: GatewayErrorKind;
  readonly status?: number;

  constructor(kind: GatewayErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'GatewayError';
    this.kind = kind;
    this.status = status;
  }

  /** Copy fit to show a user, in the app's plain-verbs tone (spec §3). */
  get userMessage(): string {
    switch (this.kind) {
      case 'rate-limit':
        return 'Checking too often — give it a few seconds and try again.';
      case 'timeout':
      case 'network':
        return "Couldn't reach the checking service. Check your connection and try again.";
      default:
        return "The checking service had a problem. Try again in a moment.";
    }
  }
}

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * The gateway is a helper, not the source of truth for money — a slow response must
 * never leave a payment screen hanging indefinitely.
 */
async function gatewayFetch(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  if (!path.startsWith('/free/') && path !== '/health') {
    /** Guard against a paid endpoint sneaking in during a refactor (spec §1.4). */
    throw new GatewayError('bad-response', `Refusing to call non-free path "${path}".`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new GatewayError(
      aborted ? 'timeout' : 'network',
      aborted ? 'Gateway request timed out' : 'Could not reach the gateway',
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new GatewayError('rate-limit', 'Gateway rate limit reached', 429);
  }
  if (!response.ok) {
    throw new GatewayError('server', `Gateway returned ${response.status}`, response.status);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new GatewayError('bad-response', 'Gateway returned a body we could not read');
  }
}

export { gatewayFetch };

/* ── Narrowing helpers ──────────────────────────────────────────────────────────
 * Hand-rolled rather than pulled from a schema library: the surface is five small
 * endpoints, and adding a validation dependency to a payments bundle for that is a
 * worse trade than twenty lines of type guards.
 */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function asBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
