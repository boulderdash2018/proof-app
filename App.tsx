import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_400Regular_Italic, Inter_500Medium, Inter_600SemiBold, Inter_600SemiBold_Italic, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_700Bold, PlayfairDisplay_900Black } from '@expo-google-fonts/playfair-display';
import { Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_600SemiBold_Italic, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import * as Haptics from 'expo-haptics';
import { RootNavigator } from './src/navigation';
import { initPostHog } from './src/services/posthogConfig';
import { useAuthStore } from './src/store';

// On web, expo-haptics is not implemented and throws an "UnavailabilityError"
// on every call. That error was bubbling up as "Uncaught (in promise)" warnings
// in the console because most call sites don't wrap with .catch. We silently
// no-op the 3 public APIs at app boot so existing call sites work unchanged on
// web and keep their haptic behaviour on native.
if (Platform.OS === 'web') {
  const noop = () => Promise.resolve();
  (Haptics as any).impactAsync = noop;
  (Haptics as any).notificationAsync = noop;
  (Haptics as any).selectionAsync = noop;
}

// Inject a global stylesheet on web to kill the default browser focus outline
// on every <input> and <textarea>. Native platforms ignore this (no document).
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const existing = document.getElementById('proof-global-input-reset');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'proof-global-input-reset';
    style.textContent = `
      input, textarea, select {
        outline: none !important;
        -webkit-tap-highlight-color: transparent;
      }
      input:focus, textarea:focus, select:focus {
        outline: none !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);
  }
}

export default function App() {
  const loadSession = useAuthStore((s) => s.loadSession);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_600SemiBold_Italic,
    Inter_700Bold,
    // Playfair Display — reserved for the Proof logo only (original branding font)
    PlayfairDisplay_700Bold,
    PlayfairDisplay_900Black,
    // Fraunces — soft-rounded serif for editorial titles (hero, place names, pull-quotes)
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    Fraunces_700Bold,
  });

  useEffect(() => {
    initPostHog();
    loadSession();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
