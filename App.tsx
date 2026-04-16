import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_400Regular_Italic, Inter_500Medium, Inter_600SemiBold, Inter_600SemiBold_Italic, Inter_700Bold } from '@expo-google-fonts/inter';
import { RootNavigator } from './src/navigation';
import { initPostHog } from './src/services/posthogConfig';
import { useAuthStore } from './src/store';

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
