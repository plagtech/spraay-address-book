/**
 * Root layout: polyfills first, then fonts, then the wallet provider tree.
 *
 * `@walletconnect/react-native-compat` and `react-native-get-random-values` MUST be the
 * first imports in the app — wagmi/viem and WalletConnect touch TextEncoder, Buffer and
 * crypto.getRandomValues at module scope.
 */
import '@walletconnect/react-native-compat';
import 'react-native-get-random-values';

/**
 * TEMPORARY wallet-connect diagnostics. Ordering is load-bearing, same as the polyfills
 * above: this must run AFTER them (it inspects WebSocket/crypto/Buffer) and BEFORE
 * anything imports the AppKit module, because AppKit builds its instance at module
 * scope and its constructor is what we are trying to instrument.
 *
 * A bare side-effect import, not a function call — `import` statements are evaluated
 * before the module body, so a call placed here would run too late. Remove once init
 * is fixed.
 */
import '../src/wallet/diagnostics';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Per-weight subpath imports on purpose: the package roots re-export every weight,
// which drags ~6MB of unused italics into the Android bundle.
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../src/theme';
import { WalletProvider } from '../src/wallet/WalletProvider';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Splash may already be hidden on fast refresh — not fatal.
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    // Reveal the app once fonts resolve. On font error we still show the app rather
    // than hanging on the splash — system fonts are an acceptable degradation.
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <WalletProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        />
      </WalletProvider>
    </SafeAreaProvider>
  );
}
