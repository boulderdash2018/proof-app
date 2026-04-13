import { create } from 'zustand';
import {
  Conversation,
  ChatMessage,
  ConversationParticipant,
  subscribeConversations,
  subscribeMessages,
  sendTextMessage,
  sendPlanMessage,
  toggleReaction as toggleReactionService,
  markConversationRead,
  getOrCreateConversation,
} from '../services/chatService';

interface ChatStore {
  // Conversations list
  conversations: Conversation[];
  totalUnread: number;
  isLoading: boolean;

  // Active conversation
  activeConversationId: string | null;
  messages: ChatMessage[];
  isMessagesLoading: boolean;

  // Subscriptions
  _convsUnsub: (() => void) | null;
  _msgsUnsub: (() => void) | null;
  _userId: string | null;

  // Actions — conversations
  subscribe: (userId: string) => void;
  unsubscribe: () => void;

  // Actions — messages
  openConversation: (conversationId: string, userId: string) => void;
  closeConversation: () => void;
  sendText: (text: string) => Promise<void>;
  sendPlan: (plan: { id: string; title: string; coverPhoto?: string; authorName: string }) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => void;

  // Actions — start new chat
  startChat: (me: ConversationParticipant, other: ConversationParticipant) => Promise<string>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  totalUnread: 0,
  isLoading: false,

  activeConversationId: null,
  messages: [],
  isMessagesLoading: false,

  _convsUnsub: null,
  _msgsUnsub: null,
  _userId: null,

  // ── Subscribe to conversations list ──
  subscribe: (userId: string) => {
    if (get()._userId === userId && get()._convsUnsub) return;
    get().unsubscribe();

    set({ isLoading: true, _userId: userId });

    try {
      const unsub = subscribeConversations(userId, (conversations) => {
        const totalUnread = conversations.reduce(
          (sum, c) => sum + (c.unreadCount[userId] || 0),
          0,
        );
        set({ conversations, totalUnread, isLoading: false });
      });
      set({ _convsUnsub: unsub });
    } catch (err) {
      console.warn('[chatStore] subscribe error:', err);
      set({ isLoading: false });
    }
  },

  unsubscribe: () => {
    get()._convsUnsub?.();
    get()._msgsUnsub?.();
    set({
      _convsUnsub: null,
      _msgsUnsub: null,
      _userId: null,
      conversations: [],
      totalUnread: 0,
      messages: [],
      activeConversationId: null,
    });
  },

  // ── Open a conversation (subscribe to messages) ──
  openConversation: (conversationId: string, userId: string) => {
    // Close previous messages listener
    get()._msgsUnsub?.();

    set({ activeConversationId: conversationId, messages: [], isMessagesLoading: true });

    const unsub = subscribeMessages(conversationId, (messages) => {
      set({ messages, isMessagesLoading: false });
    });
    set({ _msgsUnsub: unsub });

    // Mark as read
    markConversationRead(conversationId, userId).catch(() => {});
  },

  closeConversation: () => {
    get()._msgsUnsub?.();
    set({ _msgsUnsub: null, activeConversationId: null, messages: [] });
  },

  // ── Send text ──
  sendText: async (text: string) => {
    const { activeConversationId, _userId } = get();
    if (!activeConversationId || !_userId) return;
    await sendTextMessage(activeConversationId, _userId, text);
  },

  // ── Send plan share ──
  sendPlan: async (plan) => {
    const { activeConversationId, _userId } = get();
    if (!activeConversationId || !_userId) return;
    await sendPlanMessage(activeConversationId, _userId, plan);
  },

  // ── Toggle reaction ──
  toggleReaction: (messageId: string, emoji: string) => {
    const { activeConversationId, _userId } = get();
    if (!activeConversationId || !_userId) return;
    toggleReactionService(activeConversationId, messageId, _userId, emoji).catch(() => {});
  },

  // ── Start new chat ──
  startChat: async (me, other) => {
    return getOrCreateConversation(me, other);
  },
}));
