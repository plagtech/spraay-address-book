/**
 * Tab bar for the two browsing surfaces: the book and past sends.
 *
 * Everything task-shaped — pay, review, contact, settings, success, receipt — stays a
 * root stack route so it pushes OVER the tabs. A payment flow with a tab bar under it
 * invites tapping away mid-signature.
 *
 * `Tabs` comes from `expo-router/js-tabs`; the root `expo-router` export is deprecated
 * in SDK 57.
 */
import { Tabs } from 'expo-router/js-tabs';

import { colors, fonts } from '../../src/theme';

export default function TabsLayout() {
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
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
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
