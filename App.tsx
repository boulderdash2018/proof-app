import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation';
import { initPostHog } from './src/services/posthogConfig';
import { useAuthStore, useThemeStore } from './src/store';

export default function App() {
  const loadSession = useAuthStore((s) => s.loadSession);
  const isDark = useThemeStore((s) => s.isDark);

  useEffect(() => {
    initPostHog();
    loadSession();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
