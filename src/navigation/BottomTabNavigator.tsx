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
const TabIcon: React.FC<{ label: string; focused: boolean }> = ({ label, focused }) => {
  const color = focused ? '#000000' : '#AAAAAA';

  const icons: Record<string, string> = {
    FeedTab: '\u2302',
    ExploreTab: '\u25CE',
    SavesTab: '\u2630',
    ProfileTab: '\u2603',
  };

  const labels: Record<string, string> = {
    FeedTab: 'Feed',
    ExploreTab: 'Explore',
    SavesTab: 'Saves',
    ProfileTab: 'Profile',
  };

  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, { color }]}>{icons[label]}</Text>
      <Text style={[styles.tabLabel, { color }]}>{labels[label]}</Text>
    </View>
  );
};

// Create tab button
const CreateTabButton: React.FC<{ onPress?: () => void }> = ({ onPress }) => (
  <TouchableOpacity style={styles.createButtonWrapper} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.createButton}>
      <Text style={styles.createButtonIcon}>+</Text>
    </View>
  </TouchableOpacity>
);

const Tab = createBottomTabNavigator<BottomTabParamList>();

export const BottomTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
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
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
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
    backgroundColor: '#000000',
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
