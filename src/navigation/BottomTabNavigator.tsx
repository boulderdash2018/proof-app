import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  BottomTabParamList,
  FeedStackParamList,
  ExploreStackParamList,
  CreateStackParamList,
  SavesStackParamList,
  ProfileStackParamList,
} from './types';

import { FeedScreen } from '../screens/FeedScreen';
import { ExploreScreen } from '../screens/ExploreScreen';
import { CreateScreen } from '../screens/CreateScreen';
import { SavesScreen } from '../screens/SavesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { FollowersScreen } from '../screens/FollowersScreen';
import { FollowingScreen } from '../screens/FollowingScreen';
import { NotificationsSettingsScreen } from '../screens/NotificationsSettingsScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen';
import { OtherProfileScreen } from '../screens/OtherProfileScreen';
import { FriendRequestsScreen } from '../screens/FriendRequestsScreen';
import { Ionicons } from '@expo/vector-icons';
import { useLanguageStore } from '../store';
import { Colors, Fonts } from '../constants';
import { fr, en } from '../i18n';

// Feed Stack
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const FeedStackNavigator: React.FC = () => (
  <FeedStack.Navigator screenOptions={{ headerShown: false }}>
    <FeedStack.Screen name="Feed" component={FeedScreen} />
    <FeedStack.Screen name="OtherProfile" component={OtherProfileScreen} />
  </FeedStack.Navigator>
);

// Explore Stack
const ExploreStack = createNativeStackNavigator<ExploreStackParamList>();
const ExploreStackNavigator: React.FC = () => (
  <ExploreStack.Navigator screenOptions={{ headerShown: false }}>
    <ExploreStack.Screen name="Explore" component={ExploreScreen} />
    <ExploreStack.Screen name="OtherProfile" component={OtherProfileScreen} />
  </ExploreStack.Navigator>
);

// Create Stack
const CreateStack = createNativeStackNavigator<CreateStackParamList>();
const CreateStackNavigator: React.FC = () => (
  <CreateStack.Navigator screenOptions={{ headerShown: false }}>
    <CreateStack.Screen name="Create" component={CreateScreen} />
  </CreateStack.Navigator>
);

// Saves Stack
const SavesStack = createNativeStackNavigator<SavesStackParamList>();
const SavesStackNavigator: React.FC = () => (
  <SavesStack.Navigator screenOptions={{ headerShown: false }}>
    <SavesStack.Screen name="Saves" component={SavesScreen} />
  </SavesStack.Navigator>
);

// Profile Stack
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const ProfileStackNavigator: React.FC = () => (
  <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
    <ProfileStack.Screen name="Profile" component={ProfileScreen} />
    <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
    <ProfileStack.Screen name="OtherProfile" component={OtherProfileScreen} />
    <ProfileStack.Screen name="Followers" component={FollowersScreen} />
    <ProfileStack.Screen name="Following" component={FollowingScreen} />
    <ProfileStack.Screen name="FriendRequests" component={FriendRequestsScreen} />
    <ProfileStack.Screen name="Settings" component={SettingsScreen} />
    <ProfileStack.Screen name="NotificationsSettings" component={NotificationsSettingsScreen} />
    <ProfileStack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
    <ProfileStack.Screen name="AccountSettings" component={AccountSettingsScreen} />
  </ProfileStack.Navigator>
);

// Tab icon component
const TAB_ICONS: Record<string, [string, string]> = {
  FeedTab: ['home-outline', 'home'],
  ExploreTab: ['compass-outline', 'compass'],
  SavesTab: ['bookmark-outline', 'bookmark'],
  ProfileTab: ['person-outline', 'person'],
};

const TabIcon: React.FC<{ label: string; focused: boolean }> = ({ label, focused }) => {
  const color = focused ? Colors.primary : Colors.gray600;
  const language = useLanguageStore((s) => s.language);
  const t = language === 'fr' ? fr : en;

  const [outline, filled] = TAB_ICONS[label] || ['ellipse-outline', 'ellipse'];

  const labels: Record<string, string> = {
    FeedTab: t.tab_feed,
    ExploreTab: t.tab_explore,
    SavesTab: t.tab_saves,
    ProfileTab: t.tab_profile,
  };

  return (
    <View style={styles.tabIconContainer}>
      <Ionicons name={(focused ? filled : outline) as any} size={22} color={color} />
      <Text style={[styles.tabLabel, { color }]}>{labels[label]}</Text>
    </View>
  );
};

// Create tab button
const CreateTabButton: React.FC<{ onPress?: () => void }> = ({ onPress }) => (
  <TouchableOpacity style={styles.createButtonWrapper} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.createButton}>
      <Ionicons name="add" size={26} color="#FFFFFF" />
    </View>
  </TouchableOpacity>
);

const Tab = createBottomTabNavigator<BottomTabParamList>();

export const BottomTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar],
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="FeedTab"
        component={FeedStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="FeedTab" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ExploreTab"
        component={ExploreStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="ExploreTab" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="CreateTab"
        component={CreateStackNavigator}
        options={{
          tabBarButton: (props) => <CreateTabButton onPress={props.onPress} />,
        }}
      />
      <Tab.Screen
        name="SavesTab"
        component={SavesStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="SavesTab" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="ProfileTab" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
    height: 80,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: Fonts.serifSemiBold,
  },
  createButtonWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    top: -8,
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonIcon: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 28,
  },
});
