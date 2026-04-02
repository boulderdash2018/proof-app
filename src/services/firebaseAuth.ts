import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from './firebaseConfig';
import { User, SignupData } from '../types';

// Convert Firebase user to our User type
const convertFirebaseUser = (fbUser: FirebaseUser): User => {
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
    avatarUrl: fbUser.photoURL || undefined,
    avatarBg: '#E8E8E8',
    avatarColor: '#666666',
    badgeType: 'novice',
    isPrivate: false,
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

      // Update display name
      // await updateProfile(fbUser, {
      //   displayName: `${data.firstName} ${data.lastName}`,
      // });

      return convertFirebaseUser(fbUser);
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
      return convertFirebaseUser(fbUser);
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
      const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        unsubscribe();
        if (fbUser) {
          resolve(convertFirebaseUser(fbUser));
        } else {
          resolve(null);
        }
      });
    });
  },

  onAuthStateChange: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        callback(convertFirebaseUser(fbUser));
      } else {
        callback(null);
      }
    });
  },
};
