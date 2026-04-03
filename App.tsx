import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation';
import { initPostHog } from './src/services/posthogConfig';
import { useAuthStore } from './src/store';

export default function App() {
  const loadSession = useAuthStore((s) => s.loadSession);

  useEffect(() => {
    initPostHog();
    loadSession();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
