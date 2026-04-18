import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_400Regular_Italic, Inter_500Medium, Inter_600SemiBold, Inter_600SemiBold_Italic, Inter_700Bold } from '@expo-google-fonts/inter';
import { RootNavigator } from './src/navigation';
import { initPostHog } from './src/services/posthogConfig';
import { useAuthStore } from './src/store';

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
