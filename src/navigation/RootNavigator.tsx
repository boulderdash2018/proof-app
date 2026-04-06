import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuthStore } from '../store/authStore';
import { AuthNavigator } from './AuthNavigator';
import { BottomTabNavigator } from './BottomTabNavigator';
import { SetupProfileScreen } from '../screens/SetupProfileScreen';

import { PlanDetailModal } from '../screens/PlanDetailModal';
import { PlaceDetailModal } from '../screens/PlaceDetailModal';
import { NotificationsScreen } from '../screens/NotificationsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Instagram-style username rules
const USERNAME_REGEX = /^[a-z0-9._]+$/;
const isUsernameValid = (username?: string): boolean => {
  if (!username || username.length < 3 || username.length > 30) return false;
  if (!USERNAME_REGEX.test(username)) return false;
  if (username.startsWith('.') || username.endsWith('.')) return false;
  if (username.includes('..')) return false;
  return true;
};

export const RootNavigator: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  // User needs setup if: new account (setupComplete falsy) OR username doesn't conform
  const needsSetup = isAuthenticated && user && (!user.setupComplete || !isUsernameValid(user.username));

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : needsSetup ? (
        <Stack.Screen name="SetupProfile" component={SetupProfileScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={BottomTabNavigator} />
          <Stack.Group screenOptions={{ presentation: 'modal' }}>
            <Stack.Screen name="PlanDetail" component={PlanDetailModal} />
            <Stack.Screen name="PlaceDetail" component={PlaceDetailModal} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
          </Stack.Group>
        </>
      )}
    </Stack.Navigator>
  );
};
