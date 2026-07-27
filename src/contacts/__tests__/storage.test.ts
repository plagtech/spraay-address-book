import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadContacts, newContactId, saveContacts } from '../storage';
import type { Contact } from '../types';

const A = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const KEY = 'spraay.contacts.v1';

const valid = {
  id: 'c1',
  name: 'Ada',
  address: A.toLowerCase(),
  label: 'team',
  createdAt: 123,
};

const seed = async (payload: unknown) => {
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('loadContacts', () => {
  it('returns an empty book when nothing is stored', async () => {
    expect(await loadContacts()).toEqual([]);
  });

  it('loads a valid record and checksums its address', async () => {
    await seed([valid]);
    const [contact] = await loadContacts();
    expect(contact).toMatchObject({ id: 'c1', name: 'Ada', label: 'team', address: A });
  });

  /**
   * The central rule: anything wrong with the ADDRESS drops the whole contact. A
   * half-recovered address reaching a payment screen is the failure this guards against.
   */
  it.each([
    ['a malformed address', { ...valid, address: '0xnope' }],
    ['a missing address', { ...valid, address: undefined }],
    ['an empty name', { ...valid, name: '   ' }],
    ['a missing id', { ...valid, id: '' }],
  ])('drops a record with %s', async (_label, record) => {
    await seed([record]);
    expect(await loadContacts()).toEqual([]);
  });

  /**
   * Cosmetic damage is recoverable, so the contact survives with a safe default rather
   * than being lost.
   */
  it('falls back to a default label when the stored one is unknown', async () => {
    await seed([{ ...valid, label: 'archenemy' }]);
    const [contact] = await loadContacts();
    expect(contact?.label).toBe('friend');
    expect(contact?.name).toBe('Ada');
  });

  it('falls back to a zero timestamp when it is not a number', async () => {
    await seed([{ ...valid, createdAt: 'yesterday' }]);
    const [contact] = await loadContacts();
    expect(contact?.createdAt).toBe(0);
    expect(contact?.name).toBe('Ada');
  });

  it('keeps good records alongside bad ones', async () => {
    await seed([
      valid,
      { ...valid, id: 'c2', address: '0xbad' },
      { ...valid, id: 'c3', name: 'Bo' },
    ]);
    const contacts = await loadContacts();
    expect(contacts.map((c) => c.name)).toEqual(['Ada', 'Bo']);
  });

  it('survives corrupt or unexpected payloads', async () => {
    await AsyncStorage.setItem(KEY, '{not json at all');
    expect(await loadContacts()).toEqual([]);

    await seed({ nope: true });
    expect(await loadContacts()).toEqual([]);

    await seed([null, 42, 'nope']);
    expect(await loadContacts()).toEqual([]);
  });
});

describe('saveContacts', () => {
  it('round-trips through storage', async () => {
    const contacts: Contact[] = [
      { id: 'c1', name: 'Ada', address: A as Contact['address'], label: 'team', createdAt: 1 },
    ];
    await saveContacts(contacts);
    expect(await loadContacts()).toEqual(contacts);
  });
});

describe('newContactId', () => {
  it('produces unique ids in bulk', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newContactId()));
    expect(ids.size).toBe(5000);
  });
});
