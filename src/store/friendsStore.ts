import { create } from 'zustand';
import { FriendRequest } from '../types';
import * as friendsService from '../services/friendsService';

interface FriendsStore {
  incomingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  friendIds: string[];
  followersCount: number;
  followingCount: number;
  isLoading: boolean;
  fetchIncomingRequests: (userId: string) => Promise<void>;
  fetchSentRequests: (userId: string) => Promise<void>;
  fetchFriendIds: (userId: string) => Promise<void>;
  fetchFollowCounts: (userId: string) => Promise<void>;
  sendRequest: (fromUserId: string, toUserId: string) => Promise<void>;
  acceptRequest: (requestId: string, userId: string) => Promise<void>;
  declineRequest: (requestId: string, userId: string) => Promise<void>;
  removeFriend: (currentUserId: string, otherUserId: string) => Promise<void>;
  follow: (currentUserId: string, targetUserId: string) => Promise<void>;
  unfollow: (currentUserId: string, targetUserId: string) => Promise<void>;
}

export const useFriendsStore = create<FriendsStore>((set, get) => ({
  incomingRequests: [],
  sentRequests: [],
  friendIds: [],
  followersCount: 0,
  followingCount: 0,
  isLoading: false,

  fetchIncomingRequests: async (userId: string) => {
    set({ isLoading: true });
    const requests = await friendsService.getIncomingRequests(userId);
    set({ incomingRequests: requests, isLoading: false });
  },

  fetchSentRequests: async (userId: string) => {
    set({ isLoading: true });
    const requests = await friendsService.getSentRequests(userId);
    set({ sentRequests: requests, isLoading: false });
  },

  fetchFriendIds: async (userId: string) => {
    const ids = await friendsService.getFriendIds(userId);
    set({ friendIds: ids });
  },

  fetchFollowCounts: async (userId: string) => {
    const [followers, following] = await Promise.all([
      friendsService.getFollowerIds(userId),
      friendsService.getFollowingIds(userId),
    ]);
    set({ followersCount: followers.length, followingCount: following.length });
  },

  sendRequest: async (fromUserId: string, toUserId: string) => {
    await friendsService.sendFollowRequest(fromUserId, toUserId);
    await get().fetchSentRequests(fromUserId);
  },

  acceptRequest: async (requestId: string, userId: string) => {
    await friendsService.acceptFriendRequest(requestId);
    await Promise.all([
      get().fetchIncomingRequests(userId),
      get().fetchFollowCounts(userId),
    ]);
  },

  declineRequest: async (requestId: string, userId: string) => {
    await friendsService.declineFriendRequest(requestId);
    await get().fetchIncomingRequests(userId);
  },

  removeFriend: async (currentUserId: string, otherUserId: string) => {
    await friendsService.removeFriend(currentUserId, otherUserId);
    await get().fetchFriendIds(currentUserId);
  },

  follow: async (currentUserId: string, targetUserId: string) => {
    await friendsService.followUser(currentUserId, targetUserId);
    await get().fetchFollowCounts(currentUserId);
  },

  unfollow: async (currentUserId: string, targetUserId: string) => {
    await friendsService.unfollowUser(currentUserId, targetUserId);
    await get().fetchFollowCounts(currentUserId);
  },
}));
