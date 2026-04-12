import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TouchableWithoutFeedback } from 'react-native';
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
import { SearchScreen } from '../screens/SearchScreen';
import { CreateScreen } from '../screens/CreateScreen';
import { OrganizeScreen } from '../screens/OrganizeScreen';
import { SavesScreen } from '../screens/SavesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ArchivesScreen } from '../screens/ArchivesScreen';
import { FollowersScreen } from '../screens/FollowersScreen';
import { FollowingScreen } from '../screens/FollowingScreen';
import { NotificationsSettingsScreen } from '../screens/NotificationsSettingsScreen';
import { PrivacySettingsScreen } from '../screens/PrivacySettingsScreen';
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen';
import { OtherProfileScreen } from '../screens/OtherProfileScreen';
import { FriendRequestsScreen } from '../screens/FriendRequestsScreen';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useLanguageStore, useAuthStore } from '../store';
import { useGuestStore } from '../store/guestStore';
import { activeCreateSession } from '../store/draftStore';
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
    <ExploreStack.Screen name="ExploreSearch" component={SearchScreen} options={{ animation: 'slide_from_bottom' }} />
    <ExploreStack.Screen name="OtherProfile" component={OtherProfileScreen} />
  </ExploreStack.Navigator>
);

// Create Stack
const CreateStack = createNativeStackNavigator<CreateStackParamList>();
const CreateStackNavigator: React.FC = () => (
  <CreateStack.Navigator screenOptions={{ headerShown: false }}>
    <CreateStack.Screen name="Create" component={CreateScreen} />
    <CreateStack.Screen name="Organize" component={OrganizeScreen} />
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
    <ProfileStack.Screen name="Archives" component={ArchivesScreen} />
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setShowAccountPrompt = useGuestStore((s) => s.setShowAccountPrompt);
  const isGuest = !isAuthenticated;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDraftExit, setShowDraftExit] = useState(false);
  const pendingTabRef = useRef<string | null>(null);
  const navigationRef = useNavigation<any>();

  // Handle draft exit: save
  const handleDraftSave = useCallback(() => {
    activeCreateSession.saveForm?.();
    setShowDraftExit(false);
    if (pendingTabRef.current) {
      navigationRef.navigate(pendingTabRef.current);
      pendingTabRef.current = null;
    }
  }, [navigationRef]);

  // Handle draft exit: discard
  const handleDraftDiscard = useCallback(() => {
    activeCreateSession.discardForm?.();
    setShowDraftExit(false);
    if (pendingTabRef.current) {
      navigationRef.navigate(pendingTabRef.current);
      pendingTabRef.current = null;
    }
  }, [navigationRef]);

  // Combined tab guard: guest check + draft exit check
  const tabGuard = (tabName: string) => ({
    listeners: () => ({
      tabPress: (e: any) => {
        // Guest guard first
        if (isGuest) {
          e.preventDefault();
          setShowAccountPrompt(true);
          return;
        }
        // Draft exit guard: check if we're leaving CreateTab with unsaved content
        const state = navigationRef.getState?.();
        const currentTab = state?.routes?.[state.index]?.name;
        if (currentTab === 'CreateTab' && activeCreateSession.hasContent) {
          e.preventDefault();
          pendingTabRef.current = tabName;
          setShowDraftExit(true);
        }
      },
    }),
  });

  // Feed tab: no guest guard, but still needs draft exit check
  const feedTabGuard = {
    listeners: () => ({
      tabPress: (e: any) => {
        const state = navigationRef.getState?.();
        const currentTab = state?.routes?.[state.index]?.name;
        if (currentTab === 'CreateTab' && activeCreateSession.hasContent) {
          e.preventDefault();
          pendingTabRef.current = 'FeedTab';
          setShowDraftExit(true);
        }
      },
    }),
  };

  return (
    <>
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
        {...feedTabGuard}
      />
      <Tab.Screen
        name="ExploreTab"
        component={ExploreStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="ExploreTab" focused={focused} />,
        }}
        {...tabGuard('ExploreTab')}
      />
      <Tab.Screen
        name="CreateTab"
        component={CreateStackNavigator}
        options={{
          tabBarButton: (props) => (
            <CreateTabButton
              onPress={() => {
                if (isGuest) { setShowAccountPrompt(true); return; }
                setShowCreateModal(true);
              }}
            />
          ),
        }}
      />
      <Tab.Screen
        name="SavesTab"
        component={SavesStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="SavesTab" focused={focused} />,
        }}
        {...tabGuard('SavesTab')}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="ProfileTab" focused={focused} />,
        }}
        {...tabGuard('ProfileTab')}
      />
    </Tab.Navigator>

    {/* Draft exit confirmation sheet */}
    <Modal visible={showDraftExit} transparent animationType="fade" onRequestClose={() => setShowDraftExit(false)}>
      <View style={styles.draftExitBackdrop}>
        <View style={styles.draftExitSheet}>
          <Text style={styles.draftExitTitle}>Enregistrer le brouillon ?</Text>
          <Text style={styles.draftExitSub}>Vous pourrez finir ce plan plus tard</Text>
          <View style={styles.draftExitBtns}>
            <TouchableOpacity style={[styles.draftExitBtn, styles.draftExitBtnDiscard]} onPress={handleDraftDiscard} activeOpacity={0.7}>
              <Text style={[styles.draftExitBtnText, { color: Colors.gray600 }]}>Supprimer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.draftExitBtn, styles.draftExitBtnSave]} onPress={handleDraftSave} activeOpacity={0.7}>
              <Text style={[styles.draftExitBtnText, { color: '#FFF' }]}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Create choice modal */}
    <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
      <TouchableWithoutFeedback onPress={() => setShowCreateModal(false)}>
        <View style={styles.createModalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.createModalCard}>
              <TouchableOpacity
                style={styles.createModalOption}
                activeOpacity={0.7}
                onPress={() => {
                  setShowCreateModal(false);
                  // Navigate to existing create flow
                  const nav = navigationRef;
                  nav.navigate('CreateTab', { screen: 'Create' });
                }}
              >
                <View style={[styles.createModalIcon, { backgroundColor: Colors.primary + '15' }]}>
                  <Ionicons name="camera-outline" size={24} color={Colors.primary} />
                </View>
                <View style={styles.createModalText}>
                  <Text style={styles.createModalTitle}>Publier un plan</Text>
                  <Text style={styles.createModalDesc}>Partage une journée que tu as kiffée avec la communauté</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.gray600} />
              </TouchableOpacity>

              <View style={styles.createModalDivider} />

              <TouchableOpacity
                style={styles.createModalOption}
                activeOpacity={0.7}
                onPress={() => {
                  setShowCreateModal(false);
                  navigationRef.navigate('CreateTab', { screen: 'Organize' });
                }}
              >
                <View style={[styles.createModalIcon, { backgroundColor: '#C9A84C15' }]}>
                  <Ionicons name="calendar-outline" size={24} color="#C9A84C" />
                </View>
                <View style={styles.createModalText}>
                  <Text style={styles.createModalTitle}>Organiser une journée</Text>
                  <Text style={styles.createModalDesc}>Planifie ta prochaine sortie avec l'aide de la communauté</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.gray600} />
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    </>
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
  createModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    paddingBottom: 100,
    paddingHorizontal: 16,
  },
  createModalCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  createModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  createModalIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createModalText: {
    flex: 1,
  },
  createModalTitle: {
    fontSize: 15,
    fontFamily: Fonts.serifBold,
    color: Colors.black,
    marginBottom: 3,
  },
  createModalDesc: {
    fontSize: 12,
    fontFamily: Fonts.serif,
    color: Colors.gray600,
    lineHeight: 16,
  },
  createModalDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
  },
  // Draft exit sheet
  draftExitBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  draftExitSheet: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    padding: 24,
    alignItems: 'center',
  },
  draftExitTitle: {
    fontSize: 18,
    fontFamily: Fonts.serifBold,
    color: Colors.black,
    marginBottom: 4,
  },
  draftExitSub: {
    fontSize: 13,
    fontFamily: Fonts.serif,
    color: Colors.gray600,
    marginBottom: 20,
  },
  draftExitBtns: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  draftExitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftExitBtnDiscard: {
    borderWidth: 1.5,
    borderColor: Colors.gray600,
    backgroundColor: 'transparent',
  },
  draftExitBtnSave: {
    backgroundColor: '#C8571A',
  },
  draftExitBtnText: {
    fontSize: 14,
    fontFamily: Fonts.serifBold,
  },
});
