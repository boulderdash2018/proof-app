import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, addDoc, updateDoc, doc, writeBatch, onSnapshot,
  Timestamp, QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Notification, NotificationType, User, Plan } from '../types';

const NOTIFICATIONS = 'notifications';
const PAGE_SIZE = 20;

// ==================== READ ====================

/** Fetch paginated notifications for a user */
export const fetchNotifications = async (
  userId: string,
  lastDoc?: QueryDocumentSnapshot | null
): Promise<{ notifications: Notification[]; lastVisible: QueryDocumentSnapshot | null }> => {
  let q = query(
    collection(db, NOTIFICATIONS),
    where('recipientId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(PAGE_SIZE)
  );
  if (lastDoc) q = query(q, startAfter(lastDoc));

  const snap = await getDocs(q);
  const notifications: Notification[] = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  } as Notification));

  const lastVisible = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  return { notifications, lastVisible };
};

/** Real-time listener for unread count */
export const subscribeToUnreadCount = (
  userId: string,
  callback: (count: number) => void
) => {
  const q = query(
    collection(db, NOTIFICATIONS),
    where('recipientId', '==', userId),
    where('read', '==', false)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.size);
  });
};

/** Real-time listener for new notifications (latest 20) */
export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: Notification[]) => void
) => {
  const q = query(
    collection(db, NOTIFICATIONS),
    where('recipientId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(PAGE_SIZE)
  );
  return onSnapshot(q, (snap) => {
    const notifications: Notification[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Notification));
    callback(notifications);
  });
};

// ==================== WRITE ====================

/** Mark a single notification as read */
export const markNotificationRead = async (notifId: string): Promise<void> => {
  await updateDoc(doc(db, NOTIFICATIONS, notifId), { read: true });
};

/** Mark all notifications as read for a user */
export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  const q = query(
    collection(db, NOTIFICATIONS),
    where('recipientId', '==', userId),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
};

// ==================== ANTI-SPAM CHECK ====================

const recentNotifExists = async (
  recipientId: string,
  senderId: string,
  type: NotificationType,
  planId: string | null
): Promise<boolean> => {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  let q = query(
    collection(db, NOTIFICATIONS),
    where('recipientId', '==', recipientId),
    where('senderId', '==', senderId),
    where('type', '==', type),
    where('createdAt', '>=', oneHourAgo),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
};

// ==================== CREATE NOTIFICATION ====================

interface CreateNotifParams {
  recipientId: string;
  sender: User;
  type: NotificationType;
  content: string;
  planId?: string | null;
  planTitle?: string | null;
  planCover?: string | null;
}

export const createNotification = async (params: CreateNotifParams): Promise<void> => {
  // Never notify yourself
  if (params.recipientId === params.sender.id) return;
  // Anti-spam: same type + sender + recipient within 1 hour
  const exists = await recentNotifExists(
    params.recipientId, params.sender.id, params.type, params.planId ?? null
  );
  if (exists) return;

  await addDoc(collection(db, NOTIFICATIONS), {
    recipientId: params.recipientId,
    senderId: params.sender.id,
    senderUsername: params.sender.username,
    senderAvatar: params.sender.avatarBg,
    senderInitials: params.sender.initials,
    senderAvatarColor: params.sender.avatarColor,
    type: params.type,
    content: params.content,
    planId: params.planId ?? null,
    planTitle: params.planTitle ?? null,
    planCover: params.planCover ?? null,
    read: false,
    createdAt: new Date().toISOString(),
  });
};

// ==================== TRIGGER HELPERS ====================

/** Call after a user likes a plan */
export const notifyLike = async (sender: User, plan: Plan): Promise<void> => {
  await createNotification({
    recipientId: plan.author.id,
    sender,
    type: 'new_like',
    content: `${sender.username} liked your plan ${plan.title}`,
    planId: plan.id,
    planTitle: plan.title,
    planCover: plan.coverPhotos?.[0] ?? null,
  });
};

/** Call after a user comments on a plan */
export const notifyComment = async (sender: User, plan: Plan, commentText: string): Promise<void> => {
  const excerpt = commentText.length > 40 ? commentText.slice(0, 40) + '...' : commentText;
  await createNotification({
    recipientId: plan.author.id,
    sender,
    type: 'new_comment',
    content: `${sender.username} commented on ${plan.title} : "${excerpt}"`,
    planId: plan.id,
    planTitle: plan.title,
    planCover: plan.coverPhotos?.[0] ?? null,
  });
};

/** Call after a user follows another user */
export const notifyFollow = async (sender: User, recipientId: string): Promise<void> => {
  await createNotification({
    recipientId,
    sender,
    type: 'new_follower',
    content: `${sender.username} started following you`,
  });
};

/** Call after a user saves a plan */
export const notifySave = async (sender: User, plan: Plan): Promise<void> => {
  await createNotification({
    recipientId: plan.author.id,
    sender,
    type: 'plan_saved',
    content: `${sender.username} saved your plan ${plan.title}`,
    planId: plan.id,
    planTitle: plan.title,
    planCover: plan.coverPhotos?.[0] ?? null,
  });
};

/** Call after a user Proof it's a plan */
export const notifyProofIt = async (sender: User, plan: Plan): Promise<void> => {
  await createNotification({
    recipientId: plan.author.id,
    sender,
    type: 'new_proof_it',
    content: `${sender.username} Proof it'd your plan ${plan.title} \u2713`,
    planId: plan.id,
    planTitle: plan.title,
    planCover: plan.coverPhotos?.[0] ?? null,
  });
};
