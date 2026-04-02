import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuthStore } from '../store/authStore';
import { AuthNavigator } from './AuthNavigator';
import { BottomTabNavigator } from './BottomTabNavigator';

import { PlanDetailModal } from '../screens/PlanDetailModal';
import { PlaceDetailModal } from '../screens/PlaceDetailModal';
import { NotificationsScreen } from '../screens/NotificationsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Main" component={BottomTabNavigator} />
          <Stack.Group screenOptions={{ presentation: 'modal' }}>
            <Stack.Screen name="PlanDetail" component={PlanDetailModal} />
            <Stack.Screen name="PlaceDetail" component={PlaceDetailModal} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
          </Stack.Group>
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
};
