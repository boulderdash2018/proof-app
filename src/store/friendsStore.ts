import { create } from 'zustand';
import { FriendRequest } from '../types';
import * as friendsService from '../services/friendsService';

interface FriendsStore {
  incomingRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  friendIds: string[];
  isLoading: boolean;
  fetchIncomingRequests: (userId: string) => Promise<void>;
  fetchSentRequests: (userId: string) => Promise<void>;
  fetchFriendIds: (userId: string) => Promise<void>;
  sendRequest: (fromUserId: string, toUserId: string) => Promise<void>;
  acceptRequest: (requestId: string, userId: string) => Promise<void>;
  declineRequest: (requestId: string, userId: string) => Promise<void>;
  removeFriend: (currentUserId: string, otherUserId: string) => Promise<void>;
}

export const useFriendsStore = create<FriendsStore>((set, get) => ({
  incomingRequests: [],
  sentRequests: [],
  friendIds: [],
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

  sendRequest: async (fromUserId: string, toUserId: string) => {
    await friendsService.sendFriendRequest(fromUserId, toUserId);
    await get().fetchSentRequests(fromUserId);
  },

  acceptRequest: async (requestId: string, userId: string) => {
    await friendsService.acceptFriendRequest(requestId);
    // Refresh both lists
    await Promise.all([
      get().fetchIncomingRequests(userId),
      get().fetchFriendIds(userId),
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
}));
