/**
 * AsyncStorage-backed implementation of AppKit's `Storage` interface.
 *
 * This holds AppKit/WalletConnect session state only (which wallet was used, the
 * relay session, deeplink choice). No private keys — the wallet app holds those and
 * signs everything (spec §2, §4).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Storage } from '@reown/appkit-react-native';

const PREFIX = '@spraay/wallet:';

const scoped = (key: string) => `${PREFIX}${key}`;
const unscoped = (key: string) => key.slice(PREFIX.length);

export const appKitStorage: Storage = {
  async getKeys() {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((k) => k.startsWith(PREFIX)).map(unscoped);
  },

  async getEntries<T = any>() {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    const pairs = await AsyncStorage.multiGet(keys);
    return pairs.map(([k, v]) => [unscoped(k), safeParse<T>(v)] as [string, T]);
  },

  async getItem<T = any>(key: string) {
    const raw = await AsyncStorage.getItem(scoped(key));
    if (raw === null) return undefined;
    return safeParse<T>(raw);
  },

  async setItem<T = any>(key: string, value: T) {
    await AsyncStorage.setItem(scoped(key), JSON.stringify(value));
  },

  async removeItem(key: string) {
    await AsyncStorage.removeItem(scoped(key));
  },
};

/**
 * AppKit stores a mix of JSON blobs and bare strings (e.g. WALLETCONNECT_DEEPLINK_CHOICE).
 * Fall back to the raw string when it isn't valid JSON so we never throw on read.
 */
function safeParse<T>(raw: string | null): T {
  if (raw === null) return undefined as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}
