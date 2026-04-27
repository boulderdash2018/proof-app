import { Plan, User } from '../types';

export type AuthStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  SetupProfile: undefined;
};

export type FeedStackParamList = {
  Feed: undefined;
  OtherProfile: { userId: string };
};

export type ExploreStackParamList = {
  Explore: undefined;
  ExploreSearch: { contentMode?: 'tous' | 'plans' | 'lieux' } | undefined;
  OtherProfile: { userId: string };
  FriendRequests: undefined;
};

export type CreateStackParamList = {
  Create: { draftId?: string; editPlanId?: string; resumeDraft?: boolean } | undefined;
  Organize: { draftId?: string } | undefined;
};

export type SavesStackParamList = {
  Saves: undefined;
  SavedPlaces: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  OtherProfile: { userId: string };
  Followers: { userId: string };
  Following: { userId: string };
  FriendRequests: undefined;
  Settings: undefined;
  Archives: undefined;
  NotificationsSettings: undefined;
  PrivacySettings: undefined;
  AccountSettings: undefined;
};

export type RootStackParamList = {
  Main: undefined;
  Auth: undefined;
  GuestSurvey: undefined;
  GuestAuth: undefined;
  SetupProfile: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  PlanDetail: { planId: string };
  PlaceDetail: { placeId?: string; planId?: string; googlePlaceId?: string };
  Notifications: undefined;
  ChatList: undefined;
  NewConversation: undefined;
  Conversation: { conversationId: string; otherUser: { userId: string; displayName: string; username: string; avatarUrl: string | null; avatarBg: string; avatarColor: string; initials: string } | null };
  DoItNow: { planId: string; sessionId?: string; conversationId?: string };
  DoItNowComplete: undefined;
  OrganizeComplete: undefined;
  CoPlanWorkspace: { draftId: string };
  CreateSpot: undefined;
};

export type BottomTabParamList = {
  FeedTab: undefined;
  ExploreTab: undefined;
  CreateTab: undefined;
  SavesTab: undefined;
  ProfileTab: undefined;
};
