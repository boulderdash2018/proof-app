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

const USERS = 'users';
const FRIEND_REQUESTS = 'friendRequests';

// Search users by username prefix
export const searchUsers = async (searchQuery: string, currentUserId: string): Promise<User[]> => {
  const q = query(
    collection(db, USERS),
    where('username', '>=', searchQuery.toLowerCase()),
    where('username', '<=', searchQuery.toLowerCase() + '\uf8ff'),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as User))
    .filter(u => u.id !== currentUserId);
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

// Accept a friend request
export const acceptFriendRequest = async (requestId: string): Promise<void> => {
  await updateDoc(doc(db, FRIEND_REQUESTS, requestId), { status: 'accepted' });
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
