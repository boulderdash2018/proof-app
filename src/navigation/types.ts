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
  OtherProfile: { userId: string };
};

export type CreateStackParamList = {
  Create: undefined;
};

export type SavesStackParamList = {
  Saves: undefined;
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
  DoItNow: { planId: string };
  DoItNowComplete: undefined;
};

export type BottomTabParamList = {
  FeedTab: undefined;
  ExploreTab: undefined;
  CreateTab: undefined;
  SavesTab: undefined;
  ProfileTab: undefined;
};
