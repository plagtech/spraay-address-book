/**
 * The Coinbase connector's failure mode is the thing worth testing.
 *
 * A binary without the `CoinbaseWalletSDK` native module used to take the whole app down at
 * launch, because the import chain resolves the module at module scope. That is not
 * reproducible without installing a stale build, so it is pinned here instead: the module
 * under test is re-required with the connector package mocked to throw exactly as
 * `requireNativeModule` does.
 */
const NATIVE_ABSENT = "Cannot find native module 'CoinbaseWalletSDK'";

/** Stand-in for the real connector — the real one would resolve the native module. */
class FakeCoinbaseConnector {
  type = 'coinbase';
  constructor(readonly config: unknown) {}
}

type ConnectorModule = typeof import('../coinbaseConnector');
type WalletsModule = typeof import('../wallets');

/**
 * One AsyncStorage across every isolated load.
 *
 * `jest.isolateModules` re-requires EVERYTHING inside it, AsyncStorage included, so the
 * package's own mock would hand each load a fresh empty store — and "survives a restart"
 * would then be measuring module isolation rather than the write-through it claims to test.
 * Declared at file scope and closed over by the factory so the store is genuinely shared.
 * Named `mock*` because jest forbids factories referencing out-of-scope bindings otherwise.
 */
const mockStore = new Map<string, string>();
const mockAsyncStorage = {
  async setItem(key: string, value: string) {
    mockStore.set(key, value);
  },
  async removeItem(key: string) {
    mockStore.delete(key);
  },
  async getItem(key: string) {
    return mockStore.get(key) ?? null;
  },
  async getAllKeys() {
    return [...mockStore.keys()];
  },
  async multiGet(keys: string[]) {
    return keys.map((k) => [k, mockStore.get(k) ?? null]);
  },
};

/** Load the module fresh with the connector package either throwing or resolving. */
function loadWith(available: boolean): { connector: ConnectorModule; wallets: WalletsModule } {
  let connector!: ConnectorModule;
  let wallets!: WalletsModule;

  jest.isolateModules(() => {
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: mockAsyncStorage,
    }));
    jest.doMock('@reown/appkit-coinbase-react-native', () => {
      if (!available) throw new Error(NATIVE_ABSENT);
      return { CoinbaseConnector: FakeCoinbaseConnector };
    });

    connector = require('../coinbaseConnector') as ConnectorModule;
    wallets = require('../wallets') as WalletsModule;
  });

  return { connector, wallets };
}

describe('coinbase connector availability', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    mockStore.clear();
  });

  describe('when the native module is absent', () => {
    it('degrades to undefined instead of throwing', () => {
      expect(() => loadWith(false)).not.toThrow();

      const { connector } = loadWith(false);
      expect(connector.coinbaseConnector).toBeUndefined();
      expect(connector.HAS_COINBASE_CONNECTOR).toBe(false);
    });

    it('records exactly one wallet-diag line saying so', () => {
      loadWith(false);

      const lines = log.mock.calls
        .map((args) => String(args[0]))
        .filter((line) => line.includes('coinbase SDK native module absent'));

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('[wallet-diag');
      expect(lines[0]).toContain('connector disabled.');
      /** The expected cause needs no detail appended — that is reserved for surprises. */
      expect(lines[0]).not.toContain(NATIVE_ABSENT);
    });

    it('drops the Base row, so no wallet is offered without a connector behind it', () => {
      const { wallets } = loadWith(false);
      const names = wallets.CUSTOM_WALLETS.map((w) => w.name);

      expect(names).not.toContain('Base');
      /** The other wallets are unaffected — this is a missing row, not a broken sheet. */
      expect(names).toEqual(['MetaMask', 'Trust Wallet']);
    });
  });

  describe('when the native module is present', () => {
    it('builds the connector', () => {
      const { connector } = loadWith(true);

      expect(connector.coinbaseConnector).toBeInstanceOf(FakeCoinbaseConnector);
      expect(connector.HAS_COINBASE_CONNECTOR).toBe(true);
    });

    it('logs nothing about an absent module', () => {
      loadWith(true);

      const lines = log.mock.calls
        .map((args) => String(args[0]))
        .filter((line) => line.includes('native module absent'));

      expect(lines).toHaveLength(0);
    });

    it('offers Base first, ahead of the WalletConnect wallets', () => {
      const { wallets } = loadWith(true);

      expect(wallets.CUSTOM_WALLETS.map((w) => w.name)).toEqual([
        'Base',
        'MetaMask',
        'Trust Wallet',
      ]);
    });

    it('carries the real explorer id AppKit routes external wallets on', () => {
      const { wallets } = loadWith(true);
      const base = wallets.CUSTOM_WALLETS.find((w) => w.name === 'Base');

      /**
       * The value `WcHelpersUtil.isExternalWallet` compares against. A local id here is
       * what sent Base down the WalletConnect path it cannot answer.
       */
      expect(base?.id).toBe('fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa');
    });

    it('passes our own storage, so the SDK never constructs MMKV', () => {
      const { connector } = loadWith(true);
      const { config } = connector.coinbaseConnector as unknown as FakeCoinbaseConnector;

      expect(config).toMatchObject({ storage: connector.coinbaseSdkStorage });
    });
  });
});

describe('coinbase SDK storage shim', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    mockStore.clear();
  });

  it('reads back synchronously, which is the whole reason it exists', () => {
    const { connector } = loadWith(true);
    const { coinbaseSdkStorage } = connector;

    coinbaseSdkStorage.set('chain_id', '8453');
    expect(coinbaseSdkStorage.getString('chain_id')).toBe('8453');

    coinbaseSdkStorage.delete('chain_id');
    expect(coinbaseSdkStorage.getString('chain_id')).toBeUndefined();
  });

  it('survives a restart via hydrate, so a returning user skips a second handshake', async () => {
    const first = loadWith(true).connector;
    first.coinbaseSdkStorage.set('cached_addresses', '0xabc');

    /** Fresh module = fresh in-memory cache, same AsyncStorage behind it. */
    const second = loadWith(true).connector;
    expect(second.coinbaseSdkStorage.getString('cached_addresses')).toBeUndefined();

    await second.hydrateCoinbaseStorage();
    expect(second.coinbaseSdkStorage.getString('cached_addresses')).toBe('0xabc');
  });

  it('drops ArrayBuffer rather than persisting a stringified object', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { coinbaseSdkStorage } = loadWith(true).connector;

    coinbaseSdkStorage.set('binary', new ArrayBuffer(8));

    expect(coinbaseSdkStorage.getString('binary')).toBeUndefined();
  });
});
