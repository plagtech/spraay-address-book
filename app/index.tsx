/**
 * ADDRESS BOOK (home) — spec §3.1.
 *
 * Replaces the step-1 wallet smoke test that lived here. Wallet controls are reduced to
 * a header chip pending Settings (spec §3.6); connect/disconnect still reachable through
 * the AppKit account sheet so nothing is lost in the meantime.
 *
 * Contacts never leave the device (spec §2).
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { TextField } from '../src/components/TextField';
import { Body, Display, Label, Mono } from '../src/components/Text';
import { HAS_REOWN_PROJECT_ID } from '../src/config/env';
import { DEFAULT_TOKEN } from '../src/config/tokens';
import {
  filterContacts,
  sortContacts,
  useContacts,
  type Contact,
} from '../src/contacts/useContacts';
import { GatewayBanner } from '../src/gateway/GatewayBanner';
import { colors, CONTENT_MAX_WIDTH, LABELS, radii } from '../src/theme';
import { NetworkBanner } from '../src/wallet/NetworkBanner';
import { useWallet } from '../src/wallet/useWallet';

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function AddressBookScreen() {
  const { address, isConnected, connect, openAccount } = useWallet();
  const { contacts, isLoading } = useContacts();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | undefined>();

  const visible = useMemo(
    () => sortContacts(filterContacts(contacts, search)),
    [contacts, search],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copy = async (contact: Contact) => {
    await Clipboard.setStringAsync(contact.address);
    setCopiedId(contact.id);
    setTimeout(() => setCopiedId((c) => (c === contact.id ? undefined : c)), 1600);
  };

  /**
   * Selection is by id, but the payout screen wants addresses — and only contacts
   * still visible after filtering should count, so a stale selection hidden by a
   * search can't silently ride along.
   */
  const selectedAddresses = useMemo(
    () => contacts.filter((c) => selected.has(c.id)).map((c) => c.address),
    [contacts, selected],
  );

  const payTogether = () => {
    if (selectedAddresses.length === 0) return;
    router.push({
      pathname: '/pay',
      params: { prefill: selectedAddresses.join(',') },
    });
  };

  return (
    <View style={styles.root}>
      <Screen bottomInset={selectedAddresses.length > 0 ? 110 : 24}>
        <View style={styles.header}>
          <Display style={styles.wordmark}>
            spraay<Display style={styles.wordmarkAccent}> book</Display>
          </Display>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isConnected ? 'Wallet details' : 'Connect wallet'}
            onPress={isConnected ? openAccount : connect}
            disabled={!HAS_REOWN_PROJECT_ID}
            style={styles.walletChip}
          >
            <Label style={styles.walletChipText}>
              {isConnected && address ? shortAddress(address) : 'Connect'}
            </Label>
          </Pressable>
        </View>

        <NetworkBanner />
        <GatewayBanner />

        {!HAS_REOWN_PROJECT_ID ? (
          <View style={styles.setupCard} accessibilityRole="alert">
            <Label style={styles.setupTitle}>Wallet connect not configured</Label>
            <Body style={styles.setupBody}>
              Add a Reown project id as{' '}
              <Mono style={styles.inlineMono}>EXPO_PUBLIC_REOWN_PROJECT_ID</Mono>, then
              restart. See README → Setup.
            </Body>
          </View>
        ) : null}

        <View style={styles.searchRow}>
          <TextField
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or address"
          />
          <Button title="+ Add" variant="secondary" onPress={() => router.push('/contact')} />
        </View>

        {isLoading ? (
          <Body style={styles.stateText}>Loading your book…</Body>
        ) : contacts.length === 0 ? (
          <EmptyBook />
        ) : visible.length === 0 ? (
          <Body style={styles.stateText}>
            Nobody matches “{search.trim()}”.
          </Body>
        ) : (
          visible.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              selected={selected.has(contact.id)}
              copied={copiedId === contact.id}
              onToggle={() => toggle(contact.id)}
              onCopy={() => void copy(contact)}
              onEdit={() =>
                router.push({ pathname: '/contact', params: { id: contact.id } })
              }
            />
          ))
        )}

        <Button
          title="Pay someone new →"
          variant="dashed"
          block
          style={styles.payNew}
          onPress={() => router.push('/pay')}
        />
      </Screen>

      {/* Spec §3.1: selecting ≥1 slides up a dark bar. */}
      {selectedAddresses.length > 0 ? (
        <View style={styles.bar}>
          <View style={styles.barInner}>
            <Label style={styles.barText}>
              {selectedAddresses.length} selected
            </Label>
            <Button title="Pay them together →" variant="accent" onPress={payTogether} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ContactCard({
  contact,
  selected,
  copied,
  onToggle,
  onCopy,
  onEdit,
}: {
  contact: Contact;
  selected: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onEdit: () => void;
}) {
  const label = LABELS[contact.label];

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`Select ${contact.name}`}
        onPress={onToggle}
        style={[styles.checkbox, selected && styles.checkboxOn]}
      >
        {selected ? <Label style={styles.checkboxMark}>✓</Label> : null}
      </Pressable>

      <Pressable style={styles.cardBody} onPress={onEdit} accessibilityRole="button">
        <View style={styles.cardTop}>
          <Label style={styles.cardName}>{contact.name}</Label>
          <View style={[styles.labelChip, { backgroundColor: label.soft }]}>
            <Label style={[styles.labelChipText, { color: label.color }]}>
              {label.name}
            </Label>
          </View>
        </View>
        <Mono style={styles.cardAddress}>{shortAddress(contact.address)}</Mono>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy ${contact.name}'s address`}
        onPress={onCopy}
        style={styles.copyButton}
      >
        <Label style={styles.copyText}>{copied ? 'Copied ✓' : '📋'}</Label>
      </Pressable>
    </View>
  );
}

function EmptyBook() {
  return (
    <View style={styles.empty}>
      <Display style={styles.emptyTitle}>Your book is empty</Display>
      <Body style={styles.emptyBody}>
        Add the people you pay often, then send to any number of them in one go. Their
        details stay on this phone — {DEFAULT_TOKEN.label} on Base.
      </Body>
      <Button
        title="Add your first contact"
        variant="accent"
        style={styles.emptyAction}
        onPress={() => router.push('/contact')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  wordmark: { fontSize: 25 },
  wordmarkAccent: { fontSize: 25, color: colors.accent },
  walletChip: {
    backgroundColor: colors.fill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
  },
  walletChipText: { fontSize: 12.5, color: colors.muted },
  searchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.dashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxMark: { color: '#FFFFFF', fontSize: 13 },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15, color: colors.ink },
  labelChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  labelChipText: { fontSize: 11 },
  cardAddress: { fontSize: 12.5, marginTop: 3 },
  copyButton: { paddingHorizontal: 6, paddingVertical: 6 },
  copyText: { fontSize: 13, color: colors.muted },
  stateText: { color: colors.muted, fontSize: 14, paddingVertical: 18 },
  empty: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radii.xxl,
    padding: 22,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 19 },
  emptyBody: {
    fontSize: 13.5,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  emptyAction: { marginTop: 16 },
  payNew: { marginTop: 8 },
  setupCard: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 14,
  },
  setupTitle: { color: '#7F1D1D', fontSize: 14.5 },
  setupBody: { color: '#7F1D1D', fontSize: 13, marginTop: 4, lineHeight: 19 },
  inlineMono: { fontSize: 12.5, color: colors.inkSoft },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.ink,
    paddingTop: 14,
    paddingBottom: 26,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  barInner: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barText: { color: '#FFFFFF', fontSize: 14 },
});
