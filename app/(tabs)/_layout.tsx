/**
 * Tab bar for the two browsing surfaces: the book and past sends.
 *
 * Everything task-shaped — pay, review, contact, settings, success, receipt — stays a
 * root stack route so it pushes OVER the tabs. A payment flow with a tab bar under it
 * invites tapping away mid-signature.
 *
 * `Tabs` comes from `expo-router/js-tabs`; the root `expo-router` export is deprecated
 * in SDK 57.
 *
 * ── Why the inset is added by hand ───────────────────────────────────────────────
 * `BottomTabBar` already knows about the system navigation bar. It computes
 * `height: TABBAR_HEIGHT + insets.bottom` and `paddingBottom: insets.bottom`, and THEN
 * spreads `tabBarStyle` on top (BottomTabBar.js:250-258). So a `tabBarStyle` carrying a
 * literal `height` and `paddingBottom` — which this file used to — silently overwrites
 * both: `getTabBarHeight` returns the literal the moment `'height' in style`
 * (BottomTabBar.js:100-106), and the later `paddingBottom` wins the style cascade.
 *
 * Under Android's edge-to-edge layout the app's window extends behind the navigation
 * bar, so losing that inset does not just crop the bar — it parks the tab row underneath
 * the gesture pill / nav buttons, where the system takes the touches. That is what made
 * History untappable.
 *
 * The fix is to keep the design's 62pt bar and add the inset back to both values, which
 * reproduces what react-navigation would have done unassisted.
 */
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '../../src/theme';

/** The bar's own height, before the system inset underneath it. */
const TAB_BAR_HEIGHT = 62;
const TAB_BAR_PADDING_BOTTOM = 8;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 2,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: 6,
          paddingBottom: TAB_BAR_PADDING_BOTTOM + insets.bottom,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Book',
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: () => null,
        }}
      />
    </Tabs>
  );
}
