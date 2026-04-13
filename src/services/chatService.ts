import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
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
  participants: string[];                    // array of userIds
  participantDetails: Record<string, ConversationParticipant>;
  lastMessage: string;
  lastMessageType: 'text' | 'plan';
  lastMessageSenderId: string;
  lastMessageAt: string;                     // ISO string
  unreadCount: Record<string, number>;       // { [userId]: count }
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
  content: string;                           // text content or empty for plan
  planId?: string;                           // for plan shares
  planTitle?: string;
  planCover?: string;
  planAuthorName?: string;
  reactions: MessageReaction[];
  readBy: string[];
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

/** Find existing 1-on-1 conversation between two users */
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

/** Create a new conversation */
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
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

/** Get or create a conversation between two users */
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

/** Send a text message */
export const sendTextMessage = async (
  conversationId: string,
  senderId: string,
  content: string,
): Promise<string> => {
  // Add message
  const msgRef = await addDoc(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
    {
      conversationId,
      senderId,
      type: 'text',
      content,
      reactions: [],
      readBy: [senderId],
      createdAt: serverTimestamp(),
    },
  );

  // Update conversation metadata
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
    });
  }

  return msgRef.id;
};

/** Send a plan share message */
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
    });
  }

  return msgRef.id;
};

/** Toggle a reaction on a message */
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
  const reactions: MessageReaction[] = data.reactions || [];
  const existingIdx = reactions.findIndex(
    (r) => r.userId === userId && r.emoji === emoji,
  );

  if (existingIdx >= 0) {
    reactions.splice(existingIdx, 1);
  } else {
    reactions.push({ emoji, userId });
  }

  await updateDoc(msgRef, { reactions });
};

/** Mark all messages in a conversation as read for a user */
export const markConversationRead = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  // Reset unread count for this user
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const convSnap = await getDoc(convRef);
  if (convSnap.exists()) {
    const data = convSnap.data();
    const newUnread = { ...data.unreadCount, [userId]: 0 };
    await updateDoc(convRef, { unreadCount: newUnread });
  }

  // Mark individual messages as read
  const q = query(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
    where('readBy', 'not-in', [[userId]]),
  );
  try {
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      const readBy: string[] = d.data().readBy || [];
      if (!readBy.includes(userId)) {
        batch.update(d.ref, { readBy: [...readBy, userId] });
      }
    });
    await batch.commit();
  } catch {
    // not-in query may fail on empty — silently ignore
  }
};

/** Delete a conversation (for current user — soft delete) */
export const deleteConversation = async (conversationId: string): Promise<void> => {
  await deleteDoc(doc(db, CONVERSATIONS, conversationId));
};

// ═══════════════════════════════════════════════
// Real-time listeners
// ═══════════════════════════════════════════════

/** Subscribe to all conversations for a user */
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
      const conversations: Conversation[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        lastMessageAt: toISO(d.data().lastMessageAt),
        createdAt: toISO(d.data().createdAt),
      } as Conversation));
      // Sort newest first
      conversations.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
      onData(conversations);
    },
    (err) => {
      console.warn('[chatService] conversations listener error:', err.message);
      onError?.(err);
    },
  );
};

/** Subscribe to messages in a conversation */
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
      // Sort oldest first for chat display
      messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onData(messages);
    },
    (err) => {
      console.warn('[chatService] messages listener error:', err.message);
      onError?.(err);
    },
  );
};
