/**
 * Page chrome shared by every screen: the cream background, the safe-area inset, and
 * the 420px-wide centred column the prototypes use.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, CONTENT_MAX_WIDTH } from '../theme';

interface ScreenProps {
  children: ReactNode;
  /** Set false for screens that manage their own scrolling (e.g. long lists). */
  scroll?: boolean;
  /** Extra bottom padding so sticky bars never cover the last row. */
  bottomInset?: number;
  contentStyle?: ViewStyle;
}

export function Screen({
  children,
  scroll = true,
  bottomInset = 24,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const inner = (
    <View style={[styles.column, contentStyle]}>{children}</View>
  );

  if (!scroll) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.center}>{inner}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.page, { paddingTop: insets.top }]}
      contentContainerStyle={[
        styles.center,
        { paddingBottom: insets.bottom + bottomInset },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {inner}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    paddingHorizontal: 18,
    paddingTop: 26,
  },
});
