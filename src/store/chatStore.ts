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
  resetUnreadCount,
  getOrCreateConversation,
  setTypingStatus,
} from '../services/chatService';

interface ReplyTo {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'plan';
}

interface ChatStore {
  // Conversations list
  conversations: Conversation[];
  totalUnread: number;
  isLoading: boolean;

  // Active conversation
  activeConversationId: string | null;
  messages: ChatMessage[];
  isMessagesLoading: boolean;
  otherTyping: boolean;

  // Subscriptions
  _convsUnsub: (() => void) | null;
  _msgsUnsub: (() => void) | null;
  _userId: string | null;
  _typingTimer: ReturnType<typeof setTimeout> | null;

  // Actions — conversations
  subscribe: (userId: string) => void;
  unsubscribe: () => void;

  // Actions — messages
  openConversation: (conversationId: string, userId: string) => void;
  closeConversation: () => void;
  sendText: (text: string, replyTo?: ReplyTo) => Promise<void>;
  sendPlan: (plan: { id: string; title: string; coverPhoto?: string; authorName: string }) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => void;
  setTyping: (isTyping: boolean) => void;

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
  otherTyping: false,

  _convsUnsub: null,
  _msgsUnsub: null,
  _userId: null,
  _typingTimer: null,

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

        // Derive typing status for active conversation
        const { activeConversationId } = get();
        let otherTyping = false;
        if (activeConversationId) {
          const activeConv = conversations.find((c) => c.id === activeConversationId);
          if (activeConv?.typing) {
            const otherId = activeConv.participants.find((id) => id !== userId);
            if (otherId) {
              const ts = activeConv.typing[otherId] || 0;
              otherTyping = ts > 0 && (Date.now() - ts) < 5000;
            }
          }
        }

        set({ conversations, totalUnread, isLoading: false, otherTyping });
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
    const timer = get()._typingTimer;
    if (timer) clearTimeout(timer);
    set({
      _convsUnsub: null,
      _msgsUnsub: null,
      _userId: null,
      _typingTimer: null,
      conversations: [],
      totalUnread: 0,
      messages: [],
      activeConversationId: null,
      otherTyping: false,
    });
  },

  // ── Open a conversation (subscribe to messages) ──
  openConversation: (conversationId: string, userId: string) => {
    const { activeConversationId, _msgsUnsub } = get();

    // Already subscribed to this conversation — just reset unread, don't reset listener
    if (activeConversationId === conversationId && _msgsUnsub) {
      resetUnreadCount(conversationId, userId);
      return;
    }

    // Close previous messages listener
    _msgsUnsub?.();

    set({ activeConversationId: conversationId, messages: [], isMessagesLoading: true, _msgsUnsub: null });

    const setupListener = () => {
      const unsub = subscribeMessages(
        conversationId,
        (messages) => {
          // Only update if this is still the active conversation
          if (get().activeConversationId === conversationId) {
            set({ messages, isMessagesLoading: false });
          }
        },
        (err) => {
          console.warn('[chatStore] messages listener error, reconnecting…', err);
          // Auto-reconnect after 2s on error
          setTimeout(() => {
            if (get().activeConversationId === conversationId) {
              get()._msgsUnsub?.();
              setupListener();
            }
          }, 2000);
        },
      );
      set({ _msgsUnsub: unsub });
    };

    setupListener();

    // Reset unread count (lightweight — no message-level writes that kill the listener)
    resetUnreadCount(conversationId, userId);
  },

  closeConversation: () => {
    const { activeConversationId, _userId, _typingTimer } = get();
    // Clear typing on close
    if (activeConversationId && _userId) {
      setTypingStatus(activeConversationId, _userId, false).catch(() => {});
    }
    get()._msgsUnsub?.();
    if (_typingTimer) clearTimeout(_typingTimer);
    set({ _msgsUnsub: null, activeConversationId: null, messages: [], otherTyping: false, _typingTimer: null });
  },

  // ── Send text ──
  sendText: async (text: string, replyTo?: ReplyTo) => {
    const { activeConversationId, _userId } = get();
    if (!activeConversationId || !_userId) return;
    // Clear typing timer
    const timer = get()._typingTimer;
    if (timer) clearTimeout(timer);
    set({ _typingTimer: null });
    await sendTextMessage(activeConversationId, _userId, text, replyTo);
  },

  // ── Send plan share ──
  sendPlan: async (plan) => {
    const { activeConversationId, _userId } = get();
    if (!activeConversationId || !_userId) return;
    await sendPlanMessage(activeConversationId, _userId, plan);
  },

  // ── Toggle reaction (one per user per message) ──
  toggleReaction: (messageId: string, emoji: string) => {
    const { activeConversationId, _userId } = get();
    if (!activeConversationId || !_userId) return;
    toggleReactionService(activeConversationId, messageId, _userId, emoji).catch(() => {});
  },

  // ── Typing indicator ──
  setTyping: (isTyping: boolean) => {
    const { activeConversationId, _userId, _typingTimer } = get();
    if (!activeConversationId || !_userId) return;

    if (_typingTimer) clearTimeout(_typingTimer);

    if (isTyping) {
      setTypingStatus(activeConversationId, _userId, true).catch(() => {});
      // Auto-clear after 3s of no typing
      const timer = setTimeout(() => {
        setTypingStatus(activeConversationId, _userId, false).catch(() => {});
        set({ _typingTimer: null });
      }, 3000);
      set({ _typingTimer: timer });
    } else {
      setTypingStatus(activeConversationId, _userId, false).catch(() => {});
      set({ _typingTimer: null });
    }
  },

  // ── Start new chat ──
  startChat: async (me, other) => {
    return getOrCreateConversation(me, other);
  },
}));
