import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  deleteUser,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { User, SignupData } from '../types';

// Default values for a new user
const newUserDefaults = (fbUser: FirebaseUser): User => {
  const email = fbUser.email || '';
  const displayName = fbUser.displayName || email.split('@')[0];
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return {
    id: fbUser.uid,
    username: email.split('@')[0],
    displayName,
    initials,
    avatarUrl: fbUser.photoURL || null,
    avatarBg: '#E8E8E8',
    avatarColor: '#666666',
    badgeType: 'novice',
    isPrivate: false,
    setupComplete: false,
    xpPoints: 0,
    coins: 0,
    level: 1,
    xpForNextLevel: 100,
    rank: 'Novice',
    planCount: 0,
    followersCount: 0,
    followingCount: 0,
    likesReceived: 0,
    unlockedBadges: [],
    createdAt: fbUser.metadata?.creationTime || new Date().toISOString(),
  };
};

// Save user profile to Firestore (strip undefined values)
const saveUserProfile = async (user: User): Promise<void> => {
  const { id, ...data } = user;
  const clean = JSON.parse(JSON.stringify(data));
  await setDoc(doc(db, 'users', id), clean);
};

// Load user profile from Firestore, or create it if it doesn't exist
const loadUserProfile = async (fbUser: FirebaseUser): Promise<User> => {
  const userDoc = await getDoc(doc(db, 'users', fbUser.uid));

  if (userDoc.exists()) {
    // User exists in Firestore — load their saved data
    const data = userDoc.data();
    return { id: fbUser.uid, ...data } as User;
  } else {
    // First time (e.g. Google sign-in) — create profile with defaults
    const user = newUserDefaults(fbUser);
    await saveUserProfile(user);
    return user;
  }
};

// Update specific fields in Firestore
export const updateUserProfile = async (userId: string, data: Partial<User>): Promise<void> => {
  const { id, ...fields } = data as any;
  await updateDoc(doc(db, 'users', userId), fields);
};

// Delete all Firestore data for a user (RGPD)
const deleteAllUserData = async (userId: string): Promise<void> => {
  // Helper: delete all docs from a query
  const deleteQuery = async (q: ReturnType<typeof query>) => {
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    if (snap.size > 0) await batch.commit();
  };

  // Helper: delete all docs in a subcollection
  const deleteSub = async (path: string) => {
    const snap = await getDocs(collection(db, path));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    if (snap.size > 0) await batch.commit();
  };

  // 1. User subcollections
  await deleteSub(`users/${userId}/savedPlans`);
  await deleteSub(`users/${userId}/likedPlans`);

  // 2. Plans authored by user + their proofVotes subcollections
  const plansQ = query(collection(db, 'plans'), where('authorId', '==', userId));
  const plansSnap = await getDocs(plansQ);
  for (const planDoc of plansSnap.docs) {
    await deleteSub(`plans/${planDoc.id}/proofVotes`);
    await deleteDoc(planDoc.ref);
  }

  // 3. Comments by user
  await deleteQuery(query(collection(db, 'comments'), where('authorId', '==', userId)));

  // 4. Friend requests (sent & received)
  await deleteQuery(query(collection(db, 'friendRequests'), where('fromUserId', '==', userId)));
  await deleteQuery(query(collection(db, 'friendRequests'), where('toUserId', '==', userId)));

  // 5. Follows (follower & following)
  await deleteQuery(query(collection(db, 'follows'), where('followerId', '==', userId)));
  await deleteQuery(query(collection(db, 'follows'), where('followingId', '==', userId)));

  // 6. Place reviews
  await deleteQuery(query(collection(db, 'placeReviews'), where('authorId', '==', userId)));

  // 7. User document itself
  await deleteDoc(doc(db, 'users', userId));
};

// Set persistence to local (keep user logged in)
setPersistence(auth, browserLocalPersistence).catch(console.error);

export const firebaseAuthService = {
  signup: async (data: SignupData): Promise<User> => {
    try {
      const { user: fbUser } = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );

      // Create user with defaults and save to Firestore
      const user = newUserDefaults(fbUser);
      user.displayName = data.firstName;
      user.initials = data.firstName.charAt(0).toUpperCase();
      await saveUserProfile(user);

      return user;
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Cet email est déjà utilisé');
      }
      if (error.code === 'auth/weak-password') {
        throw new Error('Le mot de passe est trop faible');
      }
      throw new Error(error.message || "Erreur lors de l'inscription");
    }
  },

  login: async (email: string, password: string): Promise<User> => {
    try {
      const { user: fbUser } = await signInWithEmailAndPassword(auth, email, password);
      return await loadUserProfile(fbUser);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        throw new Error('Email ou mot de passe incorrect');
      }
      throw new Error(error.message || 'Erreur lors de la connexion');
    }
  },

  logout: async (): Promise<void> => {
    await signOut(auth);
  },

  getCurrentUser: async (): Promise<User | null> => {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        unsubscribe();
        if (fbUser) {
          resolve(await loadUserProfile(fbUser));
        } else {
          resolve(null);
        }
      });
    });
  },

  signInWithGoogle: async (): Promise<User> => {
    try {
      const provider = new GoogleAuthProvider();
      const { user: fbUser } = await signInWithPopup(auth, provider);
      // loadUserProfile will create the profile if it's a new Google user
      return await loadUserProfile(fbUser);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Connexion annulée');
      }
      if (error.code === 'auth/popup-blocked') {
        throw new Error('Le popup a été bloqué par le navigateur');
      }
      throw new Error(error.message || 'Erreur lors de la connexion Google');
    }
  },

  deleteAccount: async (): Promise<void> => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('Aucun utilisateur connecté');
    // Delete all Firestore data first, then the Auth user
    await deleteAllUserData(fbUser.uid);
    await deleteUser(fbUser);
  },

  onAuthStateChange: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        callback(await loadUserProfile(fbUser));
      } else {
        callback(null);
      }
    });
  },
};
