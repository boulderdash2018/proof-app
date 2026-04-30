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
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebaseConfig';

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

export type SystemEventKind =
  | 'group_created'
  | 'joined'
  | 'left'
  | 'renamed'
  | 'session_started'
  | 'session_completed'
  | 'session_advanced'           // payload = "Tours" (next place name); message lit "X est passé à Tours (étape 2/3)"
  // ── Co-plan workspace mirror events ──────────────────────────────
  // Posted by the planDraftService whenever a participant mutates the
  // shared workspace, so the chat thread becomes the "fil de
  // l'organisation" — visible without leaving the chat.
  | 'coplan_place_added'         // payload = place name
  | 'coplan_place_removed'       // payload = place name
  | 'coplan_place_voted'         // payload = place name
  | 'coplan_availability_set'    // payload = "N dispos" or empty for reset
  | 'coplan_meetup_set'          // payload = "le 17 avril à 18h" (creator direct write)
  | 'coplan_details_confirmed'   // payload = compact details summary
  | 'coplan_locked'              // payload = locked plan title
  | 'coplan_proposal_applied'    // payload = subject (e.g. place name) — group adopted
  | 'coplan_proposal_rejected';  // payload = subject — rejected by majority contre

export interface SystemEvent {
  kind: SystemEventKind;
  /** User that triggered the event (if applicable). */
  actorId?: string;
  /** Target user for join/left kinds. */
  targetId?: string;
  /** Free-form payload for rename (new name) or session id. */
  payload?: string;
  // ── Co-plan extensions ────────────────────────────────────────
  /** Originating draft id — lets the chat-side render link/vote affordances
   *  without an extra lookup. Set on all `coplan_*` events. */
  draftId?: string;
  /** Proposed place id, set on `coplan_place_added` so the chat can render
   *  inline "Pour/Contre" buttons that toggle the place's vote count. */
  placeId?: string;
  /** Google Place ID — set on `coplan_place_added` so tapping the row
   *  in the chat card opens the existing PlaceDetail modal (photos,
   *  Google reviews, Proof community ratings, etc.). */
  placeGoogleId?: string;
  /** Google Place category (e.g. "restaurant", "cafe") — set on
   *  `coplan_place_added` so the chat card can render "Café · 17e"
   *  metadata without an extra fetch. */
  placeCategory?: string;
  /** Place address — used to extract the arrondissement for the chat card. */
  placeAddress?: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  participantDetails: Record<string, ConversationParticipant>;
  lastMessage: string;
  lastMessageType: 'text' | 'plan' | 'photo' | 'poll' | 'system' | 'coplan_proposal';
  lastMessageSenderId: string;
  lastMessageAt: string;
  unreadCount: Record<string, number>;
  typing: Record<string, number>;          // { userId: timestamp }
  /** ISO timestamp per user — written when the user opens the conversation. Used for "vu" receipts. */
  lastReadAt: Record<string, string>;
  /** User IDs that have pinned this conversation. */
  pinnedBy: string[];
  /** User IDs that have muted this conversation. */
  mutedBy: string[];
  createdAt: string;

  // ── Group extensions ──────────────────────────────────────────
  /** True when this conversation holds >2 participants OR was explicitly created as a plan group. */
  isGroup: boolean;
  /** Custom group name. Defaults to the linked plan title. */
  groupName?: string;
  /** Plan this group is organizing (optional — a group can also be a free-form chat). */
  linkedPlanId?: string;
  linkedPlanTitle?: string;
  linkedPlanCover?: string;
  /**
   * If this group was seeded from a co-plan draft, the originating draft id.
   * Set at draft-creation time; remains set after lock so we can still link
   * back to the draft history if needed. Used to render the "Brouillon en
   * cours" bandeau in the conversation header so participants can hop to
   * the workspace from the chat.
   */
  linkedDraftId?: string;
  /** Scheduled meet-up date/time (ISO). */
  meetupAt?: string;
  /** Id of a currently-running multi-user plan session attached to this group. */
  activeSessionId?: string;
  /** Creator of the group (only set for groups). Used to gate destructive actions like delete. */
  createdBy?: string;
}

export interface MessageReaction {
  emoji: string;
  userId: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'plan' | 'photo' | 'poll' | 'system' | 'coplan_proposal';
  content: string;
  // ── Plan share ─────────────────────────────────────
  planId?: string;
  planTitle?: string;
  planCover?: string;
  planAuthorName?: string;
  // ── Photo ──────────────────────────────────────────
  photoUrl?: string;
  photoWidth?: number;
  photoHeight?: number;
  // ── Poll ───────────────────────────────────────────
  pollQuestion?: string;
  pollOptions?: string[];
  /** Map of userId -> option index (0-based). Single vote per user. */
  pollVotes?: Record<string, number>;
  // ── System event ───────────────────────────────────
  systemEvent?: SystemEvent;
  // ── Co-plan proposal ───────────────────────────────
  /** Originating draft for the proposal */
  proposalDraftId?: string;
  /** Proposal id in plan_drafts/{draftId}/proposals/{id} */
  proposalId?: string;
  /** Proposal type — used to render the right card variant */
  proposalType?: 'remove_place' | 'replace_place' | 'change_meetup' | 'change_title';
  /** Snapshot of the affected item name (e.g. "Café Pinson") so the card
   *  can describe the proposal even if the underlying place was edited. */
  proposalSubject?: string;
  // ── Shared fields ──────────────────────────────────
  reactions: MessageReaction[];
  readBy: string[];
  replyToId?: string;
  replyToSenderId?: string;
  replyToContent?: string;
  replyToType?: 'text' | 'plan' | 'photo' | 'poll';
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
    // Skip groups — 1:1 lookup must return a strict 2-participant non-group conv.
    if (data.isGroup === true) continue;
    if (data.participants.includes(userId2) && data.participants.length === 2) {
      return {
        id: d.id,
        ...data,
        typing: data.typing || {},
        lastReadAt: data.lastReadAt || {},
        pinnedBy: Array.isArray(data.pinnedBy) ? data.pinnedBy : [],
        mutedBy: Array.isArray(data.mutedBy) ? data.mutedBy : [],
        isGroup: false,
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
    lastReadAt: {},
    pinnedBy: [],
    mutedBy: [],
    isGroup: false,
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
  replyTo?: { id: string; senderId: string; content: string; type: 'text' | 'plan' | 'photo' | 'poll' },
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
  attachedMessage?: string,
): Promise<string> => {
  const msgRef = await addDoc(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
    {
      conversationId,
      senderId,
      type: 'plan',
      content: attachedMessage?.trim() || '',
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
      lastMessage: attachedMessage?.trim() ? attachedMessage.trim() : `📍 ${plan.title}`,
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

/** Lightweight: reset unread count + stamp lastReadAt for "vu" receipts */
export const resetUnreadCount = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  try {
    const convRef = doc(db, CONVERSATIONS, conversationId);
    await updateDoc(convRef, {
      [`unreadCount.${userId}`]: 0,
      [`lastReadAt.${userId}`]: new Date().toISOString(),
    });
  } catch {
    // Silently ignore
  }
};

/** Toggle pin state for a user on a conversation. */
export const togglePinConversation = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const snap = await getDoc(convRef);
  if (!snap.exists()) return;
  const data = snap.data();
  const pinned: string[] = Array.isArray(data.pinnedBy) ? [...data.pinnedBy] : [];
  const idx = pinned.indexOf(userId);
  if (idx >= 0) pinned.splice(idx, 1);
  else pinned.push(userId);
  await updateDoc(convRef, { pinnedBy: pinned });
};

/** Toggle mute state for a user on a conversation. */
export const toggleMuteConversation = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const snap = await getDoc(convRef);
  if (!snap.exists()) return;
  const data = snap.data();
  const muted: string[] = Array.isArray(data.mutedBy) ? [...data.mutedBy] : [];
  const idx = muted.indexOf(userId);
  if (idx >= 0) muted.splice(idx, 1);
  else muted.push(userId);
  await updateDoc(convRef, { mutedBy: muted });
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
        // Legacy 1:1 convs (pre-groups) don't have isGroup — derive from count.
        const isGroup = data.isGroup === true || (Array.isArray(data.participants) && data.participants.length > 2);
        return {
          id: d.id,
          ...data,
          typing: data.typing || {},
          lastReadAt: data.lastReadAt || {},
          pinnedBy: Array.isArray(data.pinnedBy) ? data.pinnedBy : [],
          mutedBy: Array.isArray(data.mutedBy) ? data.mutedBy : [],
          isGroup,
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
    orderBy('createdAt', 'asc'),
    limit(500),
  );
  return onSnapshot(
    q,
    (snap) => {
      try {
        const messages: ChatMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: toISO(d.data().createdAt),
        } as ChatMessage));
        messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        onData(messages);
      } catch (e) {
        console.warn('[chatService] messages snapshot parse error:', e);
      }
    },
    (err) => {
      console.warn('[chatService] messages listener error:', err.message);
      onError?.(err);
    },
  );
};

/** One-shot fetch — fallback when onSnapshot listener dies silently */
export const fetchMessages = async (
  conversationId: string,
): Promise<ChatMessage[]> => {
  const q = query(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
    orderBy('createdAt', 'asc'),
    limit(500),
  );
  const snap = await getDocs(q);
  const messages: ChatMessage[] = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: toISO(d.data().createdAt),
  } as ChatMessage));
  messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return messages;
};

// ═══════════════════════════════════════════════
// Photo messages
// ═══════════════════════════════════════════════

export interface SendPhotoOptions {
  /** Data URL for the image (base64 or blob URL). */
  imageDataUrl: string;
  /** Optional image dimensions for aspect-ratio preservation. */
  width?: number;
  height?: number;
  /** Optional caption sent alongside the photo (stored as `content`). */
  caption?: string;
  /** Optional sessionId — used for the group album feature (commit 8). */
  sessionId?: string;
}

/**
 * Uploads the image to Firebase Storage then writes a `photo` message in the
 * conversation's messages subcollection and updates the conversation preview.
 */
export const sendPhotoMessage = async (
  conversationId: string,
  senderId: string,
  options: SendPhotoOptions,
): Promise<string> => {
  const { imageDataUrl, width, height, caption, sessionId } = options;

  // Upload to a stable path — future cleanup by convId/msgId is easy.
  const filename = `chat_photos/${conversationId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  const storageRef = ref(storage, filename);
  await uploadString(storageRef, imageDataUrl, 'data_url');
  const photoUrl = await getDownloadURL(storageRef);

  const msgData: Record<string, any> = {
    conversationId,
    senderId,
    type: 'photo',
    content: caption?.trim() || '',
    photoUrl,
    reactions: [],
    readBy: [senderId],
    createdAt: serverTimestamp(),
  };
  if (typeof width === 'number') msgData.photoWidth = width;
  if (typeof height === 'number') msgData.photoHeight = height;
  if (sessionId) msgData.sessionId = sessionId;

  const msgRef = await addDoc(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
    msgData,
  );

  // Update conversation preview + unread counts.
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const convSnap = await getDoc(convRef);
  if (convSnap.exists()) {
    const data = convSnap.data();
    const newUnread: Record<string, number> = { ...data.unreadCount };
    (data.participants as string[]).forEach((uid) => {
      if (uid !== senderId) newUnread[uid] = (newUnread[uid] || 0) + 1;
    });
    await updateDoc(convRef, {
      lastMessage: caption?.trim() || '📷 Photo',
      lastMessageType: 'photo',
      lastMessageSenderId: senderId,
      lastMessageAt: serverTimestamp(),
      unreadCount: newUnread,
      [`typing.${senderId}`]: 0,
    });
  }

  return msgRef.id;
};

// ═══════════════════════════════════════════════
// Polls
// ═══════════════════════════════════════════════

export interface SendPollOptions {
  question: string;
  options: string[]; // 2..5 options
}

/**
 * Creates a `poll` message. Single vote per user, option index stored in
 * `pollVotes[userId]`. Results are derived client-side from the map.
 */
export const sendPollMessage = async (
  conversationId: string,
  senderId: string,
  { question, options }: SendPollOptions,
): Promise<string> => {
  const cleanQuestion = question.trim();
  const cleanOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
  if (cleanQuestion.length === 0 || cleanOptions.length < 2) {
    throw new Error('Poll needs a question and at least 2 options');
  }
  const msgRef = await addDoc(
    collection(db, CONVERSATIONS, conversationId, MESSAGES),
    {
      conversationId,
      senderId,
      type: 'poll',
      content: cleanQuestion,
      pollQuestion: cleanQuestion,
      pollOptions: cleanOptions.slice(0, 5),
      pollVotes: {},
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
    (data.participants as string[]).forEach((uid) => {
      if (uid !== senderId) newUnread[uid] = (newUnread[uid] || 0) + 1;
    });
    await updateDoc(convRef, {
      lastMessage: `📊 ${cleanQuestion}`,
      lastMessageType: 'poll',
      lastMessageSenderId: senderId,
      lastMessageAt: serverTimestamp(),
      unreadCount: newUnread,
      [`typing.${senderId}`]: 0,
    });
  }

  return msgRef.id;
};

/** Casts (or changes) the current user's vote for a poll. Single vote per user. */
export const voteOnPoll = async (
  conversationId: string,
  messageId: string,
  userId: string,
  optionIndex: number,
): Promise<void> => {
  const ref = doc(db, CONVERSATIONS, conversationId, MESSAGES, messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.type !== 'poll') return;
  const votes = { ...(data.pollVotes || {}) };
  // Toggle off if same vote, else overwrite.
  if (votes[userId] === optionIndex) {
    delete votes[userId];
  } else {
    votes[userId] = optionIndex;
  }
  await updateDoc(ref, { pollVotes: votes });
};

// ═══════════════════════════════════════════════
// Groups
// ═══════════════════════════════════════════════

export interface CreateGroupInput {
  creator: ConversationParticipant;
  otherParticipants: ConversationParticipant[];
  plan?: {
    id: string;
    title: string;
    coverPhoto?: string | null;
  };
  meetupAt?: string; // ISO date
  groupName?: string;
  /** Optional message sent as first text after the group_created system event. */
  initialMessage?: string;
  /** Co-plan draft this group is seeded from. Stored on the conv so the
   *  chat UI can offer a "Voir le brouillon" affordance. */
  linkedDraftId?: string;
}

/**
 * Create a new group conversation (n>=2 participants) optionally bound to a plan.
 *
 * Posts a `system` message of kind `group_created` right away so the group has
 * a visible thread anchor in the conversation.
 */
export const createGroupConversation = async (
  input: CreateGroupInput,
): Promise<string> => {
  const { creator, otherParticipants, plan, meetupAt, groupName, initialMessage, linkedDraftId } = input;
  const allParticipants = [creator, ...otherParticipants];
  const participantIds = allParticipants.map((p) => p.userId);
  const participantDetails: Record<string, ConversationParticipant> = {};
  allParticipants.forEach((p) => {
    participantDetails[p.userId] = p;
  });

  const unreadCount: Record<string, number> = {};
  participantIds.forEach((id) => {
    unreadCount[id] = 0;
  });

  const defaultName = groupName?.trim() || plan?.title || 'Nouveau groupe';

  const convPayload: Record<string, any> = {
    participants: participantIds,
    participantDetails,
    lastMessage: '',
    lastMessageType: 'system',
    lastMessageSenderId: creator.userId,
    lastMessageAt: serverTimestamp(),
    unreadCount,
    typing: {},
    lastReadAt: {},
    pinnedBy: [],
    mutedBy: [],
    isGroup: true,
    groupName: defaultName,
    createdBy: creator.userId,
    createdAt: serverTimestamp(),
  };
  if (plan) {
    convPayload.linkedPlanId = plan.id;
    convPayload.linkedPlanTitle = plan.title;
    if (plan.coverPhoto) convPayload.linkedPlanCover = plan.coverPhoto;
  }
  if (meetupAt) convPayload.meetupAt = meetupAt;
  if (linkedDraftId) convPayload.linkedDraftId = linkedDraftId;

  const convRef = await addDoc(collection(db, CONVERSATIONS), convPayload);

  // Seed system message so the thread isn't empty.
  await addDoc(collection(db, CONVERSATIONS, convRef.id, MESSAGES), {
    conversationId: convRef.id,
    senderId: creator.userId,
    type: 'system',
    content: '',
    systemEvent: { kind: 'group_created', actorId: creator.userId, payload: defaultName },
    reactions: [],
    readBy: [creator.userId],
    createdAt: serverTimestamp(),
  });

  // Update lastMessage meta to reflect the system event.
  await updateDoc(doc(db, CONVERSATIONS, convRef.id), {
    lastMessage: `${creator.displayName} a créé le groupe`,
    lastMessageType: 'system',
    lastMessageAt: serverTimestamp(),
  });

  // Optional: send the creator's first message.
  if (initialMessage && initialMessage.trim().length > 0) {
    await sendTextMessage(convRef.id, creator.userId, initialMessage.trim());
  }

  return convRef.id;
};

/** Post a system event message in a group (internal helper — exported for broader use). */
export const postSystemEvent = async (
  conversationId: string,
  event: SystemEvent,
  previewText: string,
): Promise<void> => {
  await addDoc(collection(db, CONVERSATIONS, conversationId, MESSAGES), {
    conversationId,
    senderId: event.actorId || '',
    type: 'system',
    content: '',
    systemEvent: event,
    reactions: [],
    readBy: event.actorId ? [event.actorId] : [],
    createdAt: serverTimestamp(),
  });

  // ── Incrémenter unreadCount pour les non-acteurs ──
  // Sans ça, les actions de groupe (confirmation des détails, RDV fixé,
  // étape suivante, joined/left, etc.) faisaient bien remonter la
  // conversation en haut de la liste mais sans badge unread → l'user
  // ratait totalement le signal. Même pattern que sendTextMessage : on
  // lit l'actuel unreadCount et on +1 pour chaque participant ≠ acteur.
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const convSnap = await getDoc(convRef);
  const updatePayload: Record<string, any> = {
    lastMessage: previewText,
    lastMessageType: 'system',
    lastMessageSenderId: event.actorId || '',
    lastMessageAt: serverTimestamp(),
  };
  if (convSnap.exists()) {
    const data = convSnap.data();
    const newUnread: Record<string, number> = { ...(data.unreadCount || {}) };
    (data.participants || []).forEach((uid: string) => {
      if (uid !== event.actorId) newUnread[uid] = (newUnread[uid] || 0) + 1;
    });
    updatePayload.unreadCount = newUnread;
  }
  await updateDoc(convRef, updatePayload);
};

/**
 * Set / clear / change the meetup date on a group conversation, and post
 * a system event to surface the change in the chat. Used by the date
 * picker sheet that's accessible from the pinned plan card — lets the
 * group fix a precise start time for "Do it now à plusieurs", which the
 * waiting room then counts down to.
 *
 * Format the payload as a human-readable preview ("le 1 mai à 18h" /
 * "sans date") so the existing `coplan_meetup_set` renderer (which has
 * been around since the workspace) handles the chat row natively — no
 * new SystemEventKind needed.
 *
 * Pass `meetupAt = null` to clear the date.
 */
export const setConversationMeetupAt = async (
  conversationId: string,
  meetupAt: string | null,
  actor: ConversationParticipant,
): Promise<void> => {
  await updateDoc(doc(db, CONVERSATIONS, conversationId), {
    meetupAt: meetupAt,
  });
  const friendly = meetupAt ? formatMeetupHumanShort(meetupAt) : 'sans date';
  const preview = meetupAt
    ? `${actor.displayName} a fixé le départ — ${friendly}`
    : `${actor.displayName} a retiré la date du départ`;
  await postSystemEvent(
    conversationId,
    {
      kind: 'coplan_meetup_set',
      actorId: actor.userId,
      payload: friendly,
    },
    preview,
  );
};

/**
 * Compact "le 1 mai à 18h" formatter — kept private to chatService to
 * avoid leaking yet another date util. Mirrors the format used by
 * planDraftService.formatMeetupForTitle but without the dependency on
 * planDraftService (avoids a circular import risk between services).
 */
const formatMeetupHumanShort = (iso: string): string => {
  try {
    const d = new Date(iso);
    const dateLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const timeLabel = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `le ${dateLabel} à ${timeLabel.replace(':00', 'h').replace(':', 'h')}`;
  } catch {
    return iso;
  }
};

/** Add a participant to an existing group. Posts a `joined` system event. */
export const addParticipantToGroup = async (
  conversationId: string,
  actor: ConversationParticipant,
  newParticipant: ConversationParticipant,
): Promise<void> => {
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const snap = await getDoc(convRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (!data.isGroup) return; // Do not mutate DMs
  const participants: string[] = Array.isArray(data.participants) ? [...data.participants] : [];
  if (participants.includes(newParticipant.userId)) return;
  participants.push(newParticipant.userId);
  const participantDetails = { ...(data.participantDetails || {}) };
  participantDetails[newParticipant.userId] = newParticipant;
  const unreadCount = { ...(data.unreadCount || {}) };
  if (unreadCount[newParticipant.userId] == null) unreadCount[newParticipant.userId] = 0;

  await updateDoc(convRef, { participants, participantDetails, unreadCount });
  await postSystemEvent(
    conversationId,
    { kind: 'joined', actorId: actor.userId, targetId: newParticipant.userId },
    `${newParticipant.displayName} a rejoint le groupe`,
  );
};

/** Remove the current user from a group. Posts a `left` system event. */
export const leaveGroup = async (
  conversationId: string,
  actor: ConversationParticipant,
): Promise<void> => {
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const snap = await getDoc(convRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (!data.isGroup) return;
  const participants: string[] = Array.isArray(data.participants) ? [...data.participants] : [];
  const idx = participants.indexOf(actor.userId);
  if (idx < 0) return;
  participants.splice(idx, 1);

  // If the group becomes empty, delete it entirely to keep Firestore tidy.
  if (participants.length === 0) {
    await deleteDoc(convRef);
    return;
  }

  await updateDoc(convRef, { participants });
  await postSystemEvent(
    conversationId,
    { kind: 'left', actorId: actor.userId },
    `${actor.displayName} a quitté le groupe`,
  );
};

/** Rename a group. Posts a `renamed` system event. */
export const renameGroup = async (
  conversationId: string,
  actor: ConversationParticipant,
  newName: string,
): Promise<void> => {
  const clean = newName.trim();
  if (clean.length === 0) return;
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const snap = await getDoc(convRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (!data.isGroup) return;
  if (data.groupName === clean) return;

  await updateDoc(convRef, { groupName: clean });
  await postSystemEvent(
    conversationId,
    { kind: 'renamed', actorId: actor.userId, payload: clean },
    `${actor.displayName} a renommé le groupe en « ${clean} »`,
  );
};

/** Update the scheduled meet-up date for a group. */
export const setGroupMeetupAt = async (
  conversationId: string,
  meetupAt: string | null,
): Promise<void> => {
  const convRef = doc(db, CONVERSATIONS, conversationId);
  await updateDoc(convRef, { meetupAt: meetupAt || null });
};

/** Set or clear the active session id on a group. */
export const setGroupActiveSession = async (
  conversationId: string,
  sessionId: string | null,
): Promise<void> => {
  const convRef = doc(db, CONVERSATIONS, conversationId);
  await updateDoc(convRef, { activeSessionId: sessionId || null });
};

/**
 * Attach a freshly-locked Plan to an existing group conversation. Used by
 * coPlan.lockDraft : the conv was created at draft time and now gets the
 * Plan link + meetup date so the pinned card appears in the chat header.
 */
export const attachPlanToConversation = async (
  conversationId: string,
  plan: { id: string; title: string; coverPhoto?: string | null },
  meetupAt?: string | null,
): Promise<void> => {
  const convRef = doc(db, CONVERSATIONS, conversationId);
  const payload: Record<string, any> = {
    linkedPlanId: plan.id,
    linkedPlanTitle: plan.title,
  };
  if (plan.coverPhoto) payload.linkedPlanCover = plan.coverPhoto;
  if (meetupAt) payload.meetupAt = meetupAt;
  await updateDoc(convRef, payload);
};
