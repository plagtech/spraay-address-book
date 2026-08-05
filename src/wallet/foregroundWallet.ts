/**
 * Bring the wallet to the front when we ask it to sign something.
 *
 * ── Why this has to be ours ─────────────────────────────────────────────────────
 * AppKit deep-links for PAIRING and for nothing else. `Linking.openURL` appears in
 * exactly two places in the whole `@reown/appkit-react-native` tree —
 * `partials/w3m-connecting-mobile` and `views/w3m-connecting-external` — both of them
 * connect-sheet views. The request path does not touch it: `WalletConnectConnector`'s
 * `request` is a bare `provider.request(args, chainId)` pass-through
 * (WalletConnectConnector.js:141-145), and `@walletconnect/sign-client` has no deep-link
 * code at all. So an `eth_sendTransaction` goes over the relay and the user is simply
 * never told to go and look at it.
 *
 * That is what made the dust test miserable: the pairing hop worked, so the app looked
 * like it should hop for the signature too, and instead it sat on "Confirm the payment in
 * your wallet" while the wallet stayed in the background.
 *
 * ── Which link ──────────────────────────────────────────────────────────────────
 * Not a hardcoded `metamask://`. Every WalletConnect session carries the wallet's own
 * `redirect` in its peer metadata — `{ native, universal }` — which is the wallet telling
 * us how it wants to be reopened, and AppKit surfaces it verbatim on `walletInfo`
 * (WalletConnectConnector.js:44-52 → ConnectionsController.walletInfo). Reading it means
 * Trust foregrounds through `trust://` on the same code path, with no per-wallet table to
 * keep in sync. `wallets.ts` is only the fallback, for a session whose peer sent no
 * redirect block.
 *
 * There is no `wc?uri=` tail here and there must not be: that suffix is the PAIRING
 * payload. A request only needs the wallet raised — it already has the request over its
 * own relay socket.
 *
 * ── Why the AppState guard ──────────────────────────────────────────────────────
 * Android has blocked background activity starts since 10. Fired from the background the
 * intent is dropped by the system, silently and without an exception, so `openURL`
 * resolves and every log says the wallet opened. Checking first means the log says what
 * actually happened. It also correctly no-ops the common case it would have lied about:
 * the second request of an approve-then-send pair, where the user is still standing in
 * the wallet and it is already frontmost.
 *
 * ── Native-module-free ──────────────────────────────────────────────────────────
 * `Linking.openURL` needs no `<queries>` entry (RN's `IntentModule.openURL` never calls
 * `resolveActivity` — the reasoning is written out in `walletLinking.ts`), so this ships
 * over Metro like the rest of the wallet work.
 */
import { AppState, Linking } from 'react-native';

import { CUSTOM_WALLETS } from './wallets';

const tag = (msg: string) => `[wallet-diag foreground] ${msg}`;

/**
 * Structural match for AppKit's `WalletInfo`, kept local for the same reason
 * `config/env.ts` keeps its own `Metadata`: the type lives in a transitive package.
 *
 * Keeping this module free of the AppKit import is also what makes the resolution order
 * below testable — `@reown/appkit-react-native` re-exports
 * `@walletconnect/react-native-compat`, which is untranspiled ESM that Jest cannot load.
 * The hook that does need it lives in `useForegroundWallet.ts`.
 */
export interface ConnectedWallet {
  name?: string;
  type?: string;
  redirect?: { native?: string; universal?: string; linkMode?: boolean };
}

/** The explorer's `mobile_link` is nullable, so this takes null as well as undefined. */
const nonEmpty = (v: string | null | undefined): string | undefined => {
  const trimmed = v?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

/** The URL that raises this wallet, or undefined when nothing can. */
export function resolveWalletLink(wallet: ConnectedWallet | undefined): string | undefined {
  if (!wallet) return undefined;

  /**
   * External connectors launch their wallet themselves — the Coinbase SDK goes through
   * `startActivityForResult` against `org.toshi` and never through a URL at all. Firing a
   * link at one would be a second, competing launch.
   */
  if (wallet.type && wallet.type !== 'walletconnect') return undefined;

  const fromSession = nonEmpty(wallet.redirect?.native) ?? nonEmpty(wallet.redirect?.universal);
  if (fromSession) return fromSession;

  /** No redirect in the peer metadata: fall back to the link we pair with. */
  const name = wallet.name?.trim().toLowerCase();
  if (!name) return undefined;
  const listed = CUSTOM_WALLETS.find((w) => w.name.trim().toLowerCase() === name);
  return nonEmpty(listed?.mobile_link);
}

/**
 * Fire-and-forget: a failure to raise the wallet must never fail the payment. The user
 * can always switch apps by hand, which is exactly what they were doing before this
 * existed.
 */
export async function foregroundWallet(link: string | undefined): Promise<void> {
  if (!link) {
    console.log(tag('no redirect link for the connected wallet — not switching'));
    return;
  }

  if (AppState.currentState !== 'active') {
    console.log(tag(`app is ${AppState.currentState} — leaving the foreground alone`));
    return;
  }

  try {
    /**
     * Goes through the `walletLinking.ts` wrapper, so a declared native scheme still
     * gets its universal-link fallback here.
     */
    await Linking.openURL(link);
    console.log(tag(`opened ${link}`));
  } catch (err) {
    const e = err as { message?: string };
    console.warn(tag(`could not open ${link}: ${e?.message ?? String(err)}`));
  }
}
