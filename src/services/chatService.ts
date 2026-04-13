import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface ConversationParticipant {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  avatarBg: string;
  avatarColor: string;
  initials: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  participantDetails: Record<string, ConversationParticipant>;
  lastMessage: string;
  lastMessageType: 'text' | 'plan';
  lastMessageSenderId: string;
  lastMessageAt: string;
  unreadCount: Record<string, number>;
  typing: Record<string, number>;          // { userId: timestamp }
  createdAt: string;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'plan';
  content: string;
  planId?: string;
  planTitle?: string;
  planCover?: string;
  planAuthorName?: string;
  reactions: MessageReaction[];
  readBy: string[];
  replyToId?: string;
  replyToSenderId?: string;
  replyToContent?: string;
  replyToType?: 'text' | 'plan';
  createdAt: string;
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const CONVERSATIONS = 'conversations';
const MESSAGES = 'messages';

const toISO = (ts: any): string => {
  if (!ts) return new Date().toISOString();
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
};

// ═══════════════════════════════════════════════
// Conversations
// ═══════════════════════════════════════════════

export const findConversation = async (
  userId1: string,
  userId2: string,
): Promise<Conversation | null> => {
  const q = query(
    collection(db, CONVERSATIONS),
    where('participants', 'array-contains', userId1),
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const data = d.data();
    if (data.participants.includes(userId2) && data.participants.length === 2) {
      return {
        id: d.id,
        ...data,
        lastMessageAt: toISO(data.lastMessageAt),
        createdAt: toISO(data.createdAt),
      } as Conversation;
    }
  }
  return null;
};

export const createConversation = async (
  participants: ConversationParticipant[],
): Promise<string> => {
  const participantIds = participants.map((p) => p.userId);
  const participantDetails: Record<string, ConversationParticipant> = {};
  participants.forEach((p) => { participantDetails[p.userId] = p; });

  const unreadCount: Record<string, number> = {};
  participantIds.forEach((id) => { unreadCount[id] = 0; });

  const docRef = await addDoc(collection(db, CONVERSATIONS), {
    participants: participantIds,
    participantDetails,
    lastMessage: '',
    lastMessageType: 'text',
    lastMessageSenderId: '',
    lastMessageAt: serverTimestamp(),
    unreadCount,
    typing: {},
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const getOrCreateConversation = async (
  me: ConversationParticipant,
  other: ConversationParticipant,
): Promise<string> => {
  const existing = await findConversation(me.userId, other.userId);
  if (existing) return existing.id;
  return createConversation([me, other]);
};

// ═══════════════════════════════════════════════
// Messages
// ═══════════════════════════════════════════════

export const sendTextMessage = async (
  conversationId: string,
  senderId: string,
  content: string,
  replyTo?: { id: string; senderId: string; content: string; type: 'text' | 'plan' },
): Promise<string> => {
  const msgData: Record<string, any> = {
    conversationId,
    senderId,
    type: 'text',
    content,
    reactions: [],
    readBy: [senderId],
    createdAt: serverTimestamp(),
  };

  if (replyTo) {
    msgData.replyToId = replyTo.id;
    msgData.replyToSenderId = replyTo.senderId;
    msgData.replyToContent = replyTo.content;
    msgData.replyToType = replyTo.type;
  }

  const msgRef = await addDoc(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
    msgData,
  );

  // Update conversation metadata + clear typing
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const convSnap = await getDoc(convRef);
  if (convSnap.exists()) {
    const data = convSnap.data();
    const newUnread: Record<string, number> = { ...data.unreadCount };
    data.participants.forEach((uid: string) => {
      if (uid !== senderId) newUnread[uid] = (newUnread[uid] || 0) + 1;
    });
    await updateDoc(convRef, {
      lastMessage: content.length > 80 ? content.slice(0, 80) + '…' : content,
      lastMessageType: 'text',
      lastMessageSenderId: senderId,
      lastMessageAt: serverTimestamp(),
      unreadCount: newUnread,
      [`typing.${senderId}`]: 0,
    });
  }

  return msgRef.id;
};

export const sendPlanMessage = async (
  conversationId: string,
  senderId: string,
  plan: { id: string; title: string; coverPhoto?: string; authorName: string },
): Promise<string> => {
  const msgRef = await addDoc(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
    {
      conversationId,
      senderId,
      type: 'plan',
      content: '',
      planId: plan.id,
      planTitle: plan.title,
      planCover: plan.coverPhoto || null,
      planAuthorName: plan.authorName,
      reactions: [],
      readBy: [senderId],
      createdAt: serverTimestamp(),
    },
  );

  const convRef = doc(db, CONVERSATIONS, conversationId);
  const convSnap = await getDoc(convRef);
  if (convSnap.exists()) {
    const data = convSnap.data();
    const newUnread: Record<string, number> = { ...data.unreadCount };
    data.participants.forEach((uid: string) => {
      if (uid !== senderId) newUnread[uid] = (newUnread[uid] || 0) + 1;
    });
    await updateDoc(convRef, {
      lastMessage: `📍 ${plan.title}`,
      lastMessageType: 'plan',
      lastMessageSenderId: senderId,
      lastMessageAt: serverTimestamp(),
      unreadCount: newUnread,
      [`typing.${senderId}`]: 0,
    });
  }

  return msgRef.id;
};

/** Toggle reaction — one per user per message. Same emoji = remove, different = replace */
export const toggleReaction = async (
  conversationId: string,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> => {
  const msgRef = doc(db, CONVERSATIONS, conversationId, MESSAGES, messageId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;

  const data = snap.data();
  const reactions: MessageReaction[] = [...(data.reactions || [])];
  const existingIdx = reactions.findIndex((r) => r.userId === userId);

  if (existingIdx >= 0) {
    if (reactions[existingIdx].emoji === emoji) {
      // Same emoji — toggle off
      reactions.splice(existingIdx, 1);
    } else {
      // Different emoji — replace
      reactions[existingIdx] = { emoji, userId };
    }
  } else {
    reactions.push({ emoji, userId });
  }

  await updateDoc(msgRef, { reactions });
};

/** Mark all messages in a conversation as read (chunked batches for >500 msgs) */
export const markConversationRead = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  // Reset unread count
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const convSnap = await getDoc(convRef);
  if (convSnap.exists()) {
    const data = convSnap.data();
    if ((data.unreadCount?.[userId] || 0) > 0) {
      await updateDoc(convRef, { [`unreadCount.${userId}`]: 0 });
    }
  }

  // Fetch all messages, filter client-side, batch-update readBy in chunks of 499
  const q = query(collection(db, CONVERSATIONS, conversationId, MESSAGES));
  try {
    const snap = await getDocs(q);
    const unreadDocs = snap.docs.filter((d) => {
      const readBy: string[] = d.data().readBy || [];
      return !readBy.includes(userId);
    });

    // Process in chunks of 499 to stay under Firestore's 500-op batch limit
    const BATCH_LIMIT = 499;
    for (let i = 0; i < unreadDocs.length; i += BATCH_LIMIT) {
      const chunk = unreadDocs.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((d) => {
        batch.update(d.ref, { readBy: arrayUnion(userId) });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('[chatService] markRead batch error:', err);
  }
};

/** Lightweight: mark specific new messages as read (incremental) */
export const markNewMessagesAsRead = async (
  conversationId: string,
  messageIds: string[],
  userId: string,
): Promise<void> => {
  if (messageIds.length === 0) return;
  try {
    // Reset unread count
    const convRef = doc(db, CONVERSATIONS, conversationId);
    await updateDoc(convRef, { [`unreadCount.${userId}`]: 0 }).catch(() => {});

    // Update only the specified messages
    const BATCH_LIMIT = 499;
    for (let i = 0; i < messageIds.length; i += BATCH_LIMIT) {
      const chunk = messageIds.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((msgId) => {
        const msgRef = doc(db, CONVERSATIONS, conversationId, MESSAGES, msgId);
        batch.update(msgRef, { readBy: arrayUnion(userId) });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('[chatService] markNewMessagesAsRead error:', err);
  }
};

/** Set typing status */
export const setTypingStatus = async (
  conversationId: string,
  userId: string,
  isTyping: boolean,
): Promise<void> => {
  try {
    const convRef = doc(db, CONVERSATIONS, conversationId);
    await updateDoc(convRef, {
      [`typing.${userId}`]: isTyping ? Date.now() : 0,
    });
  } catch {
    // Silently ignore typing errors
  }
};

export const deleteConversation = async (conversationId: string): Promise<void> => {
  await deleteDoc(doc(db, CONVERSATIONS, conversationId));
};

// ═══════════════════════════════════════════════
// Real-time listeners
// ═══════════════════════════════════════════════

export const subscribeConversations = (
  userId: string,
  onData: (conversations: Conversation[]) => void,
  onError?: (err: Error) => void,
): (() => void) => {
  const q = query(
    collection(db, CONVERSATIONS),
    where('participants', 'array-contains', userId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const conversations: Conversation[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          typing: data.typing || {},
          lastMessageAt: toISO(data.lastMessageAt),
          createdAt: toISO(data.createdAt),
        } as Conversation;
      });
      conversations.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
      onData(conversations);
    },
    (err) => {
      console.warn('[chatService] conversations listener error:', err.message);
      onError?.(err);
    },
  );
};

export const subscribeMessages = (
  conversationId: string,
  onData: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void,
): (() => void) => {
  const q = query(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
  );
  return onSnapshot(
    q,
    (snap) => {
      const messages: ChatMessage[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: toISO(d.data().createdAt),
      } as ChatMessage));
      messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onData(messages);
    },
    (err) => {
      console.warn('[chatService] messages listener error:', err.message);
      onError?.(err);
    },
  );
};
