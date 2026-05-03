import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuthStore } from '../store/authStore';
import { useGuestStore } from '../store/guestStore';
import { AuthNavigator } from './AuthNavigator';
import { BottomTabNavigator } from './BottomTabNavigator';
import { SetupProfileScreen } from '../screens/SetupProfileScreen';
import { GuestSurveyScreen } from '../screens/GuestSurveyScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';

import { PlanDetailModal } from '../screens/PlanDetailModal';
import { PlaceDetailModal } from '../screens/PlaceDetailModal';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ChatListScreen } from '../screens/ChatListScreen';
import { NewConversationScreen } from '../screens/NewConversationScreen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { DoItNowScreen } from '../screens/DoItNowScreen';
import { CoPlanWorkspaceScreen } from '../screens/CoPlanWorkspaceScreen';
import { CoPlanPublishScreen } from '../screens/CoPlanPublishScreen';
import { CreateSpotScreen } from '../screens/CreateSpotScreen';
import { DoItNowCompleteScreen } from '../screens/DoItNowCompleteScreen';
import { OrganizeCompleteScreen } from '../screens/OrganizeCompleteScreen';
import { WaitingRoomScreen } from '../screens/WaitingRoomScreen';
import { AccountPromptModal } from '../components/AccountPromptModal';
import { SessionInviteToast } from '../components/SessionInviteToast';

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
  const hasCompletedSurvey = useGuestStore((s) => s.hasCompletedSurvey);
  const wantsAuth = useGuestStore((s) => s.wantsAuth);

  // User needs setup if: new account (setupComplete falsy) OR username doesn't conform
  const needsSetup = isAuthenticated && user && (!user.setupComplete || !isUsernameValid(user.username));

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          needsSetup ? (
            <Stack.Screen name="SetupProfile" component={SetupProfileScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={BottomTabNavigator} />
              <Stack.Group screenOptions={{ presentation: 'modal' }}>
                <Stack.Screen name="PlanDetail" component={PlanDetailModal} />
                <Stack.Screen name="PlaceDetail" component={PlaceDetailModal} />
                <Stack.Screen name="Notifications" component={NotificationsScreen} />
              </Stack.Group>
              <Stack.Screen name="ChatList" component={ChatListScreen} options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="NewConversation" component={NewConversationScreen} options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="Conversation" component={ConversationScreen} options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="DoItNow" component={DoItNowScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="WaitingRoom" component={WaitingRoomScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="CoPlanWorkspace" component={CoPlanWorkspaceScreen} options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="CoPlanPublish" component={CoPlanPublishScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="CreateSpot" component={CreateSpotScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="DoItNowComplete" component={DoItNowCompleteScreen} options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="OrganizeComplete" component={OrganizeCompleteScreen} options={{ animation: 'slide_from_right' }} />
            </>
          )
        ) : wantsAuth ? (
          /* Guest wants to create account → show auth screens directly */
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : !hasCompletedSurvey ? (
          /* First visit → survey */
          <Stack.Screen name="GuestSurvey" component={GuestSurveyScreen} />
        ) : (
          /* Guest mode → feed with restrictions */
          <>
            <Stack.Screen name="Main" component={BottomTabNavigator} />
            <Stack.Group screenOptions={{ presentation: 'modal' }}>
              <Stack.Screen name="PlanDetail" component={PlanDetailModal} />
              <Stack.Screen name="PlaceDetail" component={PlaceDetailModal} />
            </Stack.Group>
          </>
        )}
      </Stack.Navigator>
      {/* Global account prompt modal for guest mode */}
      <AccountPromptModal />
      {/* Cross-screen toast for incoming multi-user sessions (auth only). */}
      {isAuthenticated && <SessionInviteToast />}
    </>
  );
};
