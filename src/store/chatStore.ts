import { create } from 'zustand';
import {
  Conversation,
  ChatMessage,
  ConversationParticipant,
  subscribeConversations,
  subscribeMessages,
  fetchMessages,
  sendTextMessage,
  sendPlanMessage,
  toggleReaction as toggleReactionService,
  resetUnreadCount,
  getOrCreateConversation,
  setTypingStatus,
  togglePinConversation,
  toggleMuteConversation,
  deleteConversation as deleteConversationService,
  addParticipantToGroup,
  leaveGroup as leaveGroupService,
  renameGroup as renameGroupService,
} from '../services/chatService';

interface ReplyTo {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'plan' | 'photo' | 'poll';
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
  _pollTimer: ReturnType<typeof setInterval> | null;
  _lastSnapshotAt: number;

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

  // Actions — conversation management
  togglePin: (conversationId: string) => Promise<void>;
  toggleMute: (conversationId: string) => Promise<void>;
  deleteConv: (conversationId: string) => Promise<void>;

  // Actions — group management
  addToGroup: (conversationId: string, newParticipant: ConversationParticipant) => Promise<void>;
  leaveGroupConv: (conversationId: string) => Promise<void>;
  renameGroupConv: (conversationId: string, newName: string) => Promise<void>;
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
  _pollTimer: null,
  _lastSnapshotAt: 0,

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
    const poll = get()._pollTimer;
    if (poll) clearInterval(poll);
    set({
      _convsUnsub: null,
      _msgsUnsub: null,
      _userId: null,
      _typingTimer: null,
      _pollTimer: null,
      conversations: [],
      totalUnread: 0,
      messages: [],
      activeConversationId: null,
      otherTyping: false,
    });
  },

  // ── Open a conversation (subscribe to messages) ──
  openConversation: (conversationId: string, userId: string) => {
    const { activeConversationId, _msgsUnsub, _pollTimer } = get();

    // Already subscribed to this conversation — just reset unread, don't reset listener
    if (activeConversationId === conversationId && _msgsUnsub) {
      resetUnreadCount(conversationId, userId);
      return;
    }

    // Close previous messages listener + poll
    _msgsUnsub?.();
    if (_pollTimer) clearInterval(_pollTimer);

    set({ activeConversationId: conversationId, messages: [], isMessagesLoading: true, _msgsUnsub: null, _pollTimer: null, _lastSnapshotAt: 0 });

    // ── Recovery fetch: one-shot getDocs to catch up if listener is stale ──
    const recoveryFetch = async () => {
      if (get().activeConversationId !== conversationId) return;
      try {
        const fresh = await fetchMessages(conversationId);
        if (get().activeConversationId !== conversationId) return;
        const current = get().messages;
        // Only update if the fetch returned more messages (listener missed some)
        if (fresh.length > current.length) {
          console.warn(`[chatStore] recovery fetch found ${fresh.length} msgs (had ${current.length})`);
          set({ messages: fresh, isMessagesLoading: false, _lastSnapshotAt: Date.now() });
        }
      } catch (e) {
        // Silently ignore — listener is the primary source
      }
    };

    // ── onSnapshot listener (primary) ──
    let retryCount = 0;
    const MAX_RETRIES = 5;

    const setupListener = () => {
      const unsub = subscribeMessages(
        conversationId,
        (messages) => {
          if (get().activeConversationId === conversationId) {
            set({ messages, isMessagesLoading: false, _lastSnapshotAt: Date.now() });
            retryCount = 0;
          }
        },
        (err) => {
          console.warn('[chatStore] messages listener error:', err);
          // Immediately try a recovery fetch so messages aren't lost
          recoveryFetch();
          if (retryCount >= MAX_RETRIES) {
            console.warn('[chatStore] max retries reached — relying on poll for', conversationId);
            return;
          }
          const delay = Math.min(1000 * Math.pow(2, retryCount), 16000);
          retryCount++;
          setTimeout(() => {
            if (get().activeConversationId === conversationId) {
              get()._msgsUnsub?.();
              setupListener();
            }
          }, delay);
        },
      );
      set({ _msgsUnsub: unsub });
    };

    setupListener();

    // ── Poll safety net: every 5s, check if listener is stale and fetch if so ──
    const poll = setInterval(() => {
      if (get().activeConversationId !== conversationId) return;
      const age = Date.now() - get()._lastSnapshotAt;
      // If no snapshot in the last 8 seconds, do a recovery fetch
      if (age > 8000) {
        recoveryFetch();
      }
    }, 5000);
    set({ _pollTimer: poll });

    // Reset unread count
    resetUnreadCount(conversationId, userId);
  },

  closeConversation: () => {
    const { activeConversationId, _userId, _typingTimer, _pollTimer } = get();
    // Clear typing on close
    if (activeConversationId && _userId) {
      setTypingStatus(activeConversationId, _userId, false).catch(() => {});
    }
    get()._msgsUnsub?.();
    if (_typingTimer) clearTimeout(_typingTimer);
    if (_pollTimer) clearInterval(_pollTimer);
    set({ _msgsUnsub: null, _pollTimer: null, activeConversationId: null, messages: [], otherTyping: false, _typingTimer: null });
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

    // Recovery fetch 2s after send — catches case where listener died silently
    const cid = activeConversationId;
    setTimeout(async () => {
      if (get().activeConversationId !== cid) return;
      try {
        const fresh = await fetchMessages(cid);
        if (get().activeConversationId !== cid) return;
        const current = get().messages;
        if (fresh.length > current.length) {
          set({ messages: fresh, _lastSnapshotAt: Date.now() });
        }
      } catch { /* ignore */ }
    }, 2000);
  },

  // ── Send plan share ──
  sendPlan: async (plan) => {
    const { activeConversationId, _userId } = get();
    if (!activeConversationId || !_userId) return;
    await sendPlanMessage(activeConversationId, _userId, plan);
  },

  // ── Toggle reaction (optimistic — apply locally, write to Firestore in background) ──
  toggleReaction: (messageId: string, emoji: string) => {
    const { activeConversationId, _userId, messages } = get();
    if (!activeConversationId || !_userId) return;

    // Optimistic local update — avoids waiting for Firestore round-trip
    const updatedMessages = messages.map((msg) => {
      if (msg.id !== messageId) return msg;
      const reactions = [...(msg.reactions || [])];
      const existingIdx = reactions.findIndex((r) => r.userId === _userId);
      if (existingIdx >= 0) {
        if (reactions[existingIdx].emoji === emoji) {
          reactions.splice(existingIdx, 1); // toggle off
        } else {
          reactions[existingIdx] = { emoji, userId: _userId }; // replace
        }
      } else {
        reactions.push({ emoji, userId: _userId });
      }
      return { ...msg, reactions };
    });
    set({ messages: updatedMessages });

    // Write to Firestore in background — onSnapshot will reconcile if needed
    toggleReactionService(activeConversationId, messageId, _userId, emoji).catch((err) => {
      console.warn('[chatStore] toggleReaction write error:', err);
    });
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

  // ── Pin / Mute / Delete (optimistic) ──
  togglePin: async (conversationId: string) => {
    const { _userId, conversations } = get();
    if (!_userId) return;
    // Optimistic
    const updated = conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const pinned = [...(c.pinnedBy || [])];
      const idx = pinned.indexOf(_userId);
      if (idx >= 0) pinned.splice(idx, 1);
      else pinned.push(_userId);
      return { ...c, pinnedBy: pinned };
    });
    set({ conversations: updated });
    try {
      await togglePinConversation(conversationId, _userId);
    } catch (err) {
      console.warn('[chatStore] togglePin error:', err);
    }
  },

  toggleMute: async (conversationId: string) => {
    const { _userId, conversations } = get();
    if (!_userId) return;
    const updated = conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const muted = [...(c.mutedBy || [])];
      const idx = muted.indexOf(_userId);
      if (idx >= 0) muted.splice(idx, 1);
      else muted.push(_userId);
      return { ...c, mutedBy: muted };
    });
    set({ conversations: updated });
    try {
      await toggleMuteConversation(conversationId, _userId);
    } catch (err) {
      console.warn('[chatStore] toggleMute error:', err);
    }
  },

  deleteConv: async (conversationId: string) => {
    const { conversations } = get();
    // Optimistic: remove from list
    set({ conversations: conversations.filter((c) => c.id !== conversationId) });
    try {
      await deleteConversationService(conversationId);
    } catch (err) {
      console.warn('[chatStore] delete error:', err);
    }
  },

  // ── Group management (optimistic + service call) ──
  addToGroup: async (conversationId, newParticipant) => {
    const { _userId, conversations } = get();
    if (!_userId) return;
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    const actor = conv.participantDetails[_userId];
    if (!actor) return;

    // Optimistic: insert into local state
    const participants = [...conv.participants];
    if (!participants.includes(newParticipant.userId)) {
      participants.push(newParticipant.userId);
    }
    const participantDetails = { ...conv.participantDetails, [newParticipant.userId]: newParticipant };
    const unreadCount = { ...conv.unreadCount, [newParticipant.userId]: 0 };
    set({
      conversations: conversations.map((c) =>
        c.id === conversationId ? { ...c, participants, participantDetails, unreadCount } : c,
      ),
    });
    try {
      await addParticipantToGroup(conversationId, actor, newParticipant);
    } catch (err) {
      console.warn('[chatStore] addToGroup error:', err);
    }
  },

  leaveGroupConv: async (conversationId) => {
    const { _userId, conversations } = get();
    if (!_userId) return;
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    const actor = conv.participantDetails[_userId];
    if (!actor) return;
    // Optimistic: remove conv from list
    set({ conversations: conversations.filter((c) => c.id !== conversationId) });
    try {
      await leaveGroupService(conversationId, actor);
    } catch (err) {
      console.warn('[chatStore] leaveGroup error:', err);
    }
  },

  renameGroupConv: async (conversationId, newName) => {
    const { _userId, conversations } = get();
    if (!_userId) return;
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return;
    const actor = conv.participantDetails[_userId];
    if (!actor) return;
    const clean = newName.trim();
    if (clean.length === 0) return;
    // Optimistic
    set({
      conversations: conversations.map((c) =>
        c.id === conversationId ? { ...c, groupName: clean } : c,
      ),
    });
    try {
      await renameGroupService(conversationId, actor, clean);
    } catch (err) {
      console.warn('[chatStore] renameGroup error:', err);
    }
  },
}));
