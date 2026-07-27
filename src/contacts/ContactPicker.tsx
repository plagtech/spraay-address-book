/**
 * Bottom-sheet book picker — the 📖 button on each Payout Entry row (spec §3.3).
 *
 * Plain RN <Modal> rather than a sheet library: one sheet in the whole app does not
 * justify a native dependency, and adding one would invalidate the current dev build.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { Body, Display, Label, Mono } from '../components/Text';
import { colors, CONTENT_MAX_WIDTH, LABELS, radii } from '../theme';
import { filterContacts, sortContacts, useContacts } from './useContacts';
import type { Contact } from './types';

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ContactPicker({
  visible,
  onClose,
  onPick,
  /** Addresses already in the payout, shown as taken so they aren't added twice. */
  usedAddresses = [],
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (contact: Contact) => void;
  usedAddresses?: string[];
}) {
  const { contacts } = useContacts();
  const [search, setSearch] = useState('');

  const visibleContacts = useMemo(
    () => sortContacts(filterContacts(contacts, search)),
    [contacts, search],
  );

  const used = useMemo(
    () => new Set(usedAddresses.map((a) => a.trim().toLowerCase())),
    [usedAddresses],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      /** Android hardware back must close the sheet, not the screen behind it. */
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheet}>
        <View style={styles.sheetInner}>
          <View style={styles.header}>
            <Display style={styles.title}>Pick from your book</Display>
            <Button title="Close" variant="link" onPress={onClose} />
          </View>

          <TextField
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or address"
          />

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {contacts.length === 0 ? (
              <Body style={styles.empty}>
                Your book is empty. Add people from the home screen first.
              </Body>
            ) : visibleContacts.length === 0 ? (
              <Body style={styles.empty}>Nobody matches “{search.trim()}”.</Body>
            ) : (
              visibleContacts.map((contact) => {
                const taken = used.has(contact.address.toLowerCase());
                const label = LABELS[contact.label];
                return (
                  <Pressable
                    key={contact.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: taken }}
                    onPress={() => {
                      if (taken) return;
                      onPick(contact);
                    }}
                    style={[styles.row, taken && styles.rowTaken]}
                  >
                    <View style={styles.rowBody}>
                      <View style={styles.rowTop}>
                        <Label style={styles.rowName}>{contact.name}</Label>
                        <View style={[styles.chip, { backgroundColor: label.soft }]}>
                          <Label style={[styles.chipText, { color: label.color }]}>
                            {label.name}
                          </Label>
                        </View>
                      </View>
                      <Mono style={styles.rowAddress}>
                        {shortAddress(contact.address)}
                      </Mono>
                    </View>
                    {taken ? <Label style={styles.taken}>Added</Label> : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.35)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    maxHeight: '78%',
    alignItems: 'center',
    paddingBottom: 28,
  },
  sheetInner: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    paddingHorizontal: 18,
    paddingTop: 18,
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 19 },
  list: { marginTop: 12 },
  empty: { color: colors.muted, fontSize: 13.5, paddingVertical: 20, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 8,
  },
  rowTaken: { opacity: 0.5 },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 14.5, color: colors.ink },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  chipText: { fontSize: 11 },
  rowAddress: { fontSize: 12.5, marginTop: 3 },
  taken: { fontSize: 12, color: colors.faint },
});
