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
  limit,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { User, FriendRequest } from '../types';
import { notifyFollow, notifyFriendAccepted } from './notificationsService';

const USERS = 'users';
const FRIEND_REQUESTS = 'friendRequests';
const FOLLOWS = 'follows';

// Check if a username is already taken (excludes current user)
export const isUsernameTaken = async (username: string, currentUserId?: string): Promise<boolean> => {
  const q = query(collection(db, USERS), where('username', '==', username), limit(2));
  const snap = await getDocs(q);
  if (snap.empty) return false;
  // If the only match is the current user, it's not "taken"
  if (currentUserId) {
    return snap.docs.some(d => d.id !== currentUserId);
  }
  return true;
};

// Normalize string: remove accents and lowercase
const normalize = (str: string): string =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Search users by username or displayName (accent-insensitive)
export const searchUsers = async (searchQuery: string, currentUserId: string): Promise<User[]> => {
  const normalizedQuery = normalize(searchQuery);

  // Fetch by username prefix
  const q1 = query(
    collection(db, USERS),
    where('username', '>=', normalizedQuery),
    where('username', '<=', normalizedQuery + '\uf8ff'),
    limit(30)
  );
  // Fetch by displayName prefix
  const q2 = query(
    collection(db, USERS),
    where('displayName', '>=', searchQuery),
    where('displayName', '<=', searchQuery + '\uf8ff'),
    limit(30)
  );

  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  const usersMap = new Map<string, User>();
  [...snap1.docs, ...snap2.docs].forEach(d => {
    const user = { id: d.id, ...d.data() } as User;
    if (user.id !== currentUserId) {
      usersMap.set(user.id, user);
    }
  });

  // Also filter with accent-insensitive matching client-side
  return Array.from(usersMap.values()).filter(u =>
    normalize(u.username).includes(normalizedQuery) ||
    normalize(u.displayName).includes(normalizedQuery)
  );
};

// Get a user by ID
export const getUserById = async (userId: string): Promise<User | null> => {
  const snap = await getDoc(doc(db, USERS, userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as User;
};

// Send a friend request (checks for duplicates)
export const sendFriendRequest = async (fromUserId: string, toUserId: string): Promise<void> => {
  // Check existing request in either direction
  const q1 = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', fromUserId),
    where('toUserId', '==', toUserId),
    where('status', 'in', ['pending', 'accepted'])
  );
  const q2 = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', toUserId),
    where('toUserId', '==', fromUserId),
    where('status', 'in', ['pending', 'accepted'])
  );
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  if (!snap1.empty || !snap2.empty) {
    throw new Error('Une demande existe déjà');
  }

  await addDoc(collection(db, FRIEND_REQUESTS), {
    fromUserId,
    toUserId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
};

// Accept a follow request (creates a follow relationship)
export const acceptFriendRequest = async (requestId: string, acceptingUser?: User): Promise<void> => {
  const reqDoc = await getDoc(doc(db, FRIEND_REQUESTS, requestId));
  await updateDoc(doc(db, FRIEND_REQUESTS, requestId), { status: 'accepted' });
  // Create follow: requester → target
  if (reqDoc.exists()) {
    const data = reqDoc.data();
    await followUser(data.fromUserId, data.toUserId);
    // Notify the requester that their request was accepted
    if (acceptingUser) {
      notifyFriendAccepted(acceptingUser, data.fromUserId).catch((e) => console.error('[notif trigger]', e));
    }
  }
};

// Decline a friend request
export const declineFriendRequest = async (requestId: string): Promise<void> => {
  await updateDoc(doc(db, FRIEND_REQUESTS, requestId), { status: 'declined' });
};

// Remove a friend (delete the accepted request)
export const removeFriend = async (currentUserId: string, otherUserId: string): Promise<void> => {
  const q1 = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', currentUserId),
    where('toUserId', '==', otherUserId),
    where('status', '==', 'accepted')
  );
  const q2 = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', otherUserId),
    where('toUserId', '==', currentUserId),
    where('status', '==', 'accepted')
  );
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const allDocs = [...snap1.docs, ...snap2.docs];
  await Promise.all(allDocs.map(d => deleteDoc(d.ref)));
};

// Get incoming pending requests (with sender profile)
export const getIncomingRequests = async (userId: string): Promise<FriendRequest[]> => {
  const q = query(
    collection(db, FRIEND_REQUESTS),
    where('toUserId', '==', userId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  const requests = await Promise.all(
    snap.docs.map(async d => {
      const data = d.data();
      const fromUser = await getUserById(data.fromUserId);
      return {
        id: d.id,
        ...data,
        fromUser: fromUser || undefined,
      } as FriendRequest;
    })
  );
  return requests;
};

// Get sent pending requests (with recipient profile)
export const getSentRequests = async (userId: string): Promise<FriendRequest[]> => {
  const q = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', userId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  const requests = await Promise.all(
    snap.docs.map(async d => {
      const data = d.data();
      const toUser = await getUserById(data.toUserId);
      return {
        id: d.id,
        ...data,
        toUser: toUser || undefined,
      } as FriendRequest;
    })
  );
  return requests;
};

// Get all friend IDs for a user
export const getFriendIds = async (userId: string): Promise<string[]> => {
  const q1 = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', userId),
    where('status', '==', 'accepted')
  );
  const q2 = query(
    collection(db, FRIEND_REQUESTS),
    where('toUserId', '==', userId),
    where('status', '==', 'accepted')
  );
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const ids: string[] = [];
  snap1.docs.forEach(d => ids.push(d.data().toUserId));
  snap2.docs.forEach(d => ids.push(d.data().fromUserId));
  return ids;
};

// Get friendship status between two users
export const getFriendshipStatus = async (
  currentUserId: string,
  otherUserId: string
): Promise<'none' | 'pending_sent' | 'pending_received' | 'friends'> => {
  const q1 = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', currentUserId),
    where('toUserId', '==', otherUserId),
    where('status', 'in', ['pending', 'accepted'])
  );
  const q2 = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', otherUserId),
    where('toUserId', '==', currentUserId),
    where('status', 'in', ['pending', 'accepted'])
  );
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  for (const d of snap1.docs) {
    if (d.data().status === 'accepted') return 'friends';
    if (d.data().status === 'pending') return 'pending_sent';
  }
  for (const d of snap2.docs) {
    if (d.data().status === 'accepted') return 'friends';
    if (d.data().status === 'pending') return 'pending_received';
  }
  return 'none';
};

// Get the request ID for a pending received request
export const getPendingRequestId = async (
  fromUserId: string,
  toUserId: string
): Promise<string | null> => {
  const q = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', fromUserId),
    where('toUserId', '==', toUserId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].id;
};

// ==================== FOLLOWS ====================

/** Follow a user (instant for public accounts, called after accept for private) */
export const followUser = async (followerId: string, followingId: string, sender?: User): Promise<void> => {
  const q = query(collection(db, FOLLOWS), where('followerId', '==', followerId), where('followingId', '==', followingId));
  const snap = await getDocs(q);
  if (!snap.empty) return;
  await addDoc(collection(db, FOLLOWS), {
    followerId,
    followingId,
    createdAt: new Date().toISOString(),
  });
  if (sender) notifyFollow(sender, followingId).catch((e) => console.error('[notif trigger]', e));
};

/** Unfollow a user */
export const unfollowUser = async (followerId: string, followingId: string): Promise<void> => {
  const q = query(collection(db, FOLLOWS), where('followerId', '==', followerId), where('followingId', '==', followingId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
};

/** Get IDs of users who follow userId (followers / abonnés) */
export const getFollowerIds = async (userId: string): Promise<string[]> => {
  const q = query(collection(db, FOLLOWS), where('followingId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data().followerId);
};

/** Get IDs of users that userId follows (following / suivis) */
export const getFollowingIds = async (userId: string): Promise<string[]> => {
  const q = query(collection(db, FOLLOWS), where('followerId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data().followingId);
};

/** Get IDs of users with mutual follow (both follow each other) */
export const getMutualFollowIds = async (userId: string): Promise<string[]> => {
  const [followingIds, followerIds] = await Promise.all([
    getFollowingIds(userId),
    getFollowerIds(userId),
  ]);
  const followerSet = new Set(followerIds);
  return followingIds.filter(id => followerSet.has(id));
};

/** Check if followerId follows followingId */
export const isFollowingUser = async (followerId: string, followingId: string): Promise<boolean> => {
  const q = query(collection(db, FOLLOWS), where('followerId', '==', followerId), where('followingId', '==', followingId));
  const snap = await getDocs(q);
  return !snap.empty;
};

/** Get follow status from current user toward other user */
export const getFollowStatus = async (
  currentUserId: string,
  otherUserId: string
): Promise<'none' | 'following' | 'requested'> => {
  const followQ = query(collection(db, FOLLOWS), where('followerId', '==', currentUserId), where('followingId', '==', otherUserId));
  const followSnap = await getDocs(followQ);
  if (!followSnap.empty) return 'following';

  const reqQ = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', currentUserId),
    where('toUserId', '==', otherUserId),
    where('status', '==', 'pending')
  );
  const reqSnap = await getDocs(reqQ);
  if (!reqSnap.empty) return 'requested';

  return 'none';
};

/** Send a follow request (for private accounts only) */
export const sendFollowRequest = async (fromUserId: string, toUserId: string): Promise<void> => {
  const already = await isFollowingUser(fromUserId, toUserId);
  if (already) return;

  const q = query(
    collection(db, FRIEND_REQUESTS),
    where('fromUserId', '==', fromUserId),
    where('toUserId', '==', toUserId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error('Demande déjà envoyée');

  await addDoc(collection(db, FRIEND_REQUESTS), {
    fromUserId,
    toUserId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
};

/** Migrate accepted friendRequests to mutual follows for a user (one-time) */
export const migrateToFollows = async (userId: string): Promise<void> => {
  const userDoc = await getDoc(doc(db, USERS, userId));
  if (userDoc.exists() && userDoc.data()?.followsMigrated) return;

  const q1 = query(collection(db, FRIEND_REQUESTS), where('fromUserId', '==', userId), where('status', '==', 'accepted'));
  const q2 = query(collection(db, FRIEND_REQUESTS), where('toUserId', '==', userId), where('status', '==', 'accepted'));
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  for (const d of snap1.docs) {
    const data = d.data();
    await followUser(userId, data.toUserId);
    await followUser(data.toUserId, userId);
  }
  for (const d of snap2.docs) {
    const data = d.data();
    await followUser(data.fromUserId, userId);
    await followUser(userId, data.fromUserId);
  }

  await updateDoc(doc(db, USERS, userId), { followsMigrated: true });
};
