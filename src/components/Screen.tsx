/**
 * Page chrome shared by every screen: the cream background, the safe-area inset, and
 * the 420px-wide centred column the prototypes use.
 *
 * ── Who owns the bottom inset ───────────────────────────────────────────────────
 * Exactly one thing per screen may pay for the system navigation bar, or the padding
 * doubles. Inside the tab navigator the TAB BAR pays for it (see `app/(tabs)/_layout.tsx`)
 * and the tab scene it hands to us already stops above the system bar — so adding
 * `insets.bottom` here on top would open a second gap the size of the nav bar under
 * every list.
 *
 * `BottomTabBarHeightContext` is the signal for which case we are in: react-navigation
 * provides it to the children of a tab screen and to nothing else
 * (BottomTabView.js:202), so `undefined` means this screen is a root stack route that
 * does own its inset.
 */
import type { ReactNode } from 'react';
import { useContext } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
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

  /** Undefined outside a tab navigator; a height (possibly 0) inside one. */
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const safeBottom = tabBarHeight === undefined ? insets.bottom : 0;

  const inner = (
    <View style={[styles.column, contentStyle]}>{children}</View>
  );

  if (!scroll) {
    return (
      <View style={[styles.page, { paddingTop: insets.top, paddingBottom: safeBottom }]}>
        <View style={styles.center}>{inner}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.page, { paddingTop: insets.top }]}
      contentContainerStyle={[styles.center, { paddingBottom: safeBottom + bottomInset }]}
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
