/**
 * ADD / EDIT CONTACT — spec §3.2.
 *
 * Address entry accepts a raw 0x address or an ENS / Basename. Name resolution is
 * BEST EFFORT (spec §1.4: the gateway returned `resolved:false` for `vitalik.eth` on
 * 2026-07-26), so an unresolved name asks for the 0x address instead of blocking.
 *
 * Local `isAddress` is the gate for saving. The gateway's opinion is advisory — being
 * unable to reach it must not stop someone adding a contact they typed correctly.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getAddress, isAddress, type Address } from 'viem';

import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { TextField } from '../src/components/TextField';
import { Body, Display, Eyebrow, Label, Mono } from '../src/components/Text';
import { useContacts } from '../src/contacts/useContacts';
import { resolveName, validateAddress } from '../src/gateway/endpoints';
import { useDebouncedValue } from '../src/hooks/useDebouncedValue';
import { colors, LABELS, LABEL_KEYS, radii, type LabelKey } from '../src/theme';

/** Spec §1.4 names 400ms for per-row address validation. */
const DEBOUNCE_MS = 400;

const looksLikeName = (v: string) => /\.(eth|base\.eth)$/i.test(v.trim());

export default function ContactScreen() {
  const params = useLocalSearchParams() as {
    id?: string | string[];
    address?: string | string[];
  };
  const editingId = Array.isArray(params.id) ? params.id[0] : params.id;
  /** Handed over by the Success screen's "save these people" rows (spec §3.5). */
  const presetAddress = Array.isArray(params.address) ? params.address[0] : params.address;

  const { contacts, add, update, remove } = useContacts();
  const existing = useMemo(
    () => contacts.find((c) => c.id === editingId),
    [contacts, editingId],
  );

  const [name, setName] = useState('');
  const [addressInput, setAddressInput] = useState(() =>
    presetAddress && isAddress(presetAddress) ? getAddress(presetAddress) : '',
  );
  const [label, setLabel] = useState<LabelKey>('friend');
  const [saveError, setSaveError] = useState<string | undefined>();
  const [hydrated, setHydrated] = useState(false);

  /** Populate once the contact loads; never clobber edits on later cache updates. */
  useEffect(() => {
    if (existing && !hydrated) {
      setName(existing.name);
      setAddressInput(existing.address);
      setLabel(existing.label);
      setHydrated(true);
    }
  }, [existing, hydrated]);

  const trimmed = addressInput.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);

  /** ENS / Basename lookup — advisory, never blocking. */
  const resolution = useQuery({
    enabled: looksLikeName(debounced),
    queryKey: ['resolve-name', debounced],
    staleTime: 5 * 60_000,
    retry: 0,
    queryFn: () => resolveName(debounced),
  });

  /** Gateway address check — advisory; local `isAddress` decides saving. */
  const check = useQuery({
    enabled: debounced.length > 0 && isAddress(debounced),
    queryKey: ['validate-address', debounced],
    staleTime: 5 * 60_000,
    retry: 0,
    queryFn: () => validateAddress(debounced),
  });

  const resolved = resolution.data?.resolved ? resolution.data.address : undefined;

  /** What will actually be saved: the resolved address, or the typed one. */
  const finalAddress: Address | undefined = resolved
    ? resolved
    : isAddress(trimmed)
      ? getAddress(trimmed)
      : undefined;

  const addressError = useMemo(() => {
    if (trimmed.length === 0) return undefined;
    if (finalAddress) return undefined;
    if (looksLikeName(trimmed)) {
      if (resolution.isPending) return undefined;
      /** Spec §1.4: say what to do, don't claim the name is fake. */
      return "Couldn't look that name up — paste the 0x address instead.";
    }
    return "That doesn't look like a wallet address.";
  }, [trimmed, finalAddress, resolution.isPending]);

  const duplicate = useMemo(() => {
    if (!finalAddress) return undefined;
    return contacts.find(
      (c) => c.address.toLowerCase() === finalAddress.toLowerCase() && c.id !== editingId,
    );
  }, [contacts, finalAddress, editingId]);

  const canSave = name.trim().length > 0 && finalAddress !== undefined;

  const onSave = async () => {
    if (!canSave || !finalAddress) return;
    setSaveError(undefined);
    try {
      const draft = { name, address: finalAddress, label };
      if (editingId) await update(editingId, draft);
      else await add(draft);
      router.back();
    } catch {
      setSaveError("Couldn't save to this device. Try again.");
    }
  };

  const onDelete = async () => {
    if (!editingId) return;
    try {
      await remove(editingId);
      router.back();
    } catch {
      setSaveError("Couldn't remove this contact. Try again.");
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Display style={styles.title}>{editingId ? 'Edit contact' : 'Add contact'}</Display>
        <Button title="Back" variant="link" onPress={() => router.back()} />
      </View>

      <Eyebrow style={styles.eyebrow}>Name</Eyebrow>
      <TextField
        value={name}
        onChangeText={setName}
        placeholder="Who is this?"
        autoCapitalize="words"
      />

      <Eyebrow style={styles.eyebrow}>Wallet address</Eyebrow>
      <TextField
        value={addressInput}
        onChangeText={setAddressInput}
        placeholder="0x… or name.eth"
        mono
        error={addressError}
      />

      {resolution.isPending && looksLikeName(trimmed) ? (
        <Body style={styles.hint}>Looking that name up…</Body>
      ) : null}

      {resolved ? (
        <View style={styles.resolvedCard}>
          <Label style={styles.resolvedTitle}>Found it</Label>
          <Mono style={styles.resolvedAddress}>{resolved}</Mono>
        </View>
      ) : null}

      {/* Advisory only — a gateway that dislikes an address does not block saving. */}
      {check.data && !check.data.valid ? (
        <View style={styles.warnCard}>
          <Body style={styles.warnText}>
            {check.data.message ??
              'The checking service flagged this address. Double-check it before paying.'}
          </Body>
        </View>
      ) : null}

      {duplicate ? (
        <View style={styles.warnCard}>
          <Body style={styles.warnText}>
            {duplicate.name} already has this address in your book.
          </Body>
        </View>
      ) : null}

      <Eyebrow style={styles.eyebrow}>Label</Eyebrow>
      <View style={styles.labelRow}>
        {LABEL_KEYS.map((key) => {
          const l = LABELS[key];
          const active = key === label;
          return (
            <Button
              key={key}
              title={l.name}
              size="sm"
              variant={active ? 'primary' : 'secondary'}
              onPress={() => setLabel(key)}
            />
          );
        })}
      </View>

      {/* Spec §3.2: stub, disabled, explicitly a v1.1 feature. */}
      <Button
        title="🔗 Request an address — coming soon"
        variant="dashed"
        block
        disabled
        style={styles.stub}
      />

      {saveError ? (
        <Body style={styles.saveError} accessibilityRole="alert">
          {saveError}
        </Body>
      ) : null}

      <Button
        title={editingId ? 'Save changes' : 'Add to book'}
        variant="accent"
        size="lg"
        block
        style={styles.save}
        disabled={!canSave}
        onPress={() => void onSave()}
      />

      {editingId ? (
        <Button
          title="Remove from book"
          variant="link"
          block
          onPress={() => void onDelete()}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 25 },
  eyebrow: { marginTop: 18, marginBottom: 8 },
  hint: { color: colors.muted, fontSize: 12.5, marginTop: 6 },
  resolvedCard: {
    backgroundColor: colors.successSoft,
    borderRadius: radii.md,
    padding: 10,
    marginTop: 8,
  },
  resolvedTitle: { color: colors.successDeep, fontSize: 13 },
  resolvedAddress: { color: colors.successDeep, fontSize: 12, marginTop: 3 },
  warnCard: {
    backgroundColor: colors.warnSoft,
    borderRadius: radii.md,
    padding: 10,
    marginTop: 8,
  },
  warnText: { color: '#92400E', fontSize: 12.5, lineHeight: 18 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stub: { marginTop: 22 },
  save: { marginTop: 18 },
  saveError: { color: colors.danger, fontSize: 13, marginTop: 14 },
});
