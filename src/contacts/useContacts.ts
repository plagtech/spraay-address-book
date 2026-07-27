/**
 * Contact CRUD over the on-device store.
 *
 * Backed by react-query so every screen sees one cache and a save on Add Contact is
 * reflected on the Address Book without prop-drilling or a bespoke event bus.
 *
 * Writes go through read-modify-write on the cached list. That is safe here because the
 * store is single-user, single-process and small; it would not be if contacts ever sync.
 */
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address } from 'viem';

import { loadContacts, newContactId, saveContacts } from './storage';
import type { Contact, ContactDraft } from './types';

const QUERY_KEY = ['contacts'] as const;

export interface UseContacts {
  contacts: Contact[];
  isLoading: boolean;
  add: (draft: ContactDraft) => Promise<Contact>;
  update: (id: string, draft: ContactDraft) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Case-insensitive address lookup, for labelling addresses elsewhere in the app. */
  findByAddress: (address: string) => Contact | undefined;
}

export function useContacts(): UseContacts {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: loadContacts,
    /** Local disk — no staleness concerns, and refetching on focus would just churn. */
    staleTime: Infinity,
  });

  const contacts = useMemo(() => query.data ?? [], [query.data]);

  const persist = useCallback(
    async (next: Contact[]) => {
      await saveContacts(next);
      queryClient.setQueryData(QUERY_KEY, next);
    },
    [queryClient],
  );

  const addMutation = useMutation({
    mutationFn: async (draft: ContactDraft) => {
      const current = await loadContacts();
      const contact: Contact = {
        id: newContactId(),
        name: draft.name.trim(),
        address: draft.address,
        label: draft.label,
        createdAt: Date.now(),
      };
      await persist([...current, contact]);
      return contact;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: ContactDraft }) => {
      const current = await loadContacts();
      await persist(
        current.map((c) =>
          c.id === id
            ? { ...c, name: draft.name.trim(), address: draft.address, label: draft.label }
            : c,
        ),
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = await loadContacts();
      await persist(current.filter((c) => c.id !== id));
    },
  });

  const byAddress = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts) map.set(c.address.toLowerCase(), c);
    return map;
  }, [contacts]);

  return {
    contacts,
    isLoading: query.isPending,
    add: (draft) => addMutation.mutateAsync(draft),
    update: (id, draft) => updateMutation.mutateAsync({ id, draft }),
    remove: (id) => removeMutation.mutateAsync(id),
    findByAddress: (address: string) => byAddress.get(address.toLowerCase()),
  };
}

/** Search over name OR address — spec §3.1. */
export function filterContacts(contacts: Contact[], search: string): Contact[] {
  const q = search.trim().toLowerCase();
  if (q.length === 0) return contacts;
  return contacts.filter(
    (c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q),
  );
}

/** Alphabetical, with creation order as the tiebreak so the list never jitters. */
export function sortContacts(contacts: Contact[]): Contact[] {
  return [...contacts].sort(
    (a, b) => a.name.localeCompare(b.name) || a.createdAt - b.createdAt,
  );
}

export type { Contact, ContactDraft, Address };
