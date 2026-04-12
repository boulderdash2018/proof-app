import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Plan, Place, User, SavedPlan, Comment, CategoryTag, TransportMode, TravelSegment } from '../types';
import { notifyLike, notifyComment, notifySave, notifyProofIt } from './notificationsService';

const PLANS = 'plans';
const SAVED_PLANS = 'savedPlans';
const LIKED_PLANS = 'likedPlans';

// ==================== HELPERS ====================

const GRADIENTS = [
  'linear-gradient(135deg, #FF9A60, #FF6B35, #C94520)',
  'linear-gradient(135deg, #5ED4B4, #1D9E75, #0B5C48)',
  'linear-gradient(135deg, #F4A0C0, #D4537E, #993556)',
  'linear-gradient(135deg, #7C8CF8, #5B5EE8, #3A3DB0)',
  'linear-gradient(135deg, #FFD76E, #F5A623, #D48B07)',
  'linear-gradient(135deg, #82E0F5, #3EADD1, #1A7BA0)',
];

const capitalize = (s: string): string => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const getTimeAgo = (dateStr: string): string => {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'maintenant';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}j`;
  return `${Math.floor(days / 30)}m`;
};

// ==================== CITY FILTER HELPER ====================

/** Check if a plan belongs to a given city. Legacy plans without city field are treated as Paris. */
const planMatchesCity = (plan: Plan, city?: string): boolean => {
  if (!city) return true;
  const planCity = (plan as any).city || 'Paris';
  return planCity === city;
};

// ==================== PLANS CRUD ====================

/** Create a plan in Firestore */
export const createPlan = async (
  planData: {
    title: string;
    tags: CategoryTag[];
    places: Place[];
    price: string;
    duration: string;
    transport: TransportMode;
    travelSegments?: TravelSegment[];
    coverPhotos?: string[];
    city?: string;
  },
  author: User
): Promise<Plan> => {
  const planId = `plan-${Date.now()}`;
  const gradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
  const now = new Date().toISOString();

  const plan: Plan = {
    id: planId,
    authorId: author.id,
    author,
    title: planData.title,
    gradient,
    tags: planData.tags,
    places: planData.places,
    price: planData.price,
    duration: planData.duration,
    transport: planData.transport,
    travelSegments: planData.travelSegments || [],
    coverPhotos: planData.coverPhotos || [],
    city: planData.city || 'Paris',
    likesCount: 0,
    commentsCount: 0,
    proofCount: 0,
    declinedCount: 0,
    xpReward: 20,
    createdAt: now,
    timeAgo: 'maintenant',
  };

  await setDoc(doc(db, PLANS, planId), plan);
  return plan;
};

/** Update an existing plan in Firestore (edit flow) */
export const updatePlan = async (
  planId: string,
  data: {
    title: string;
    tags: CategoryTag[];
    places: Place[];
    price: string;
    duration: string;
    transport: TransportMode;
    travelSegments?: TravelSegment[];
    coverPhotos?: string[];
    city?: string;
  }
): Promise<void> => {
  const ref = doc(db, PLANS, planId);
  await updateDoc(ref, {
    title: data.title,
    tags: data.tags,
    places: data.places,
    price: data.price,
    duration: data.duration,
    transport: data.transport,
    travelSegments: data.travelSegments || [],
    coverPhotos: data.coverPhotos || [],
    ...(data.city && { city: data.city }),
  });
};

/** Fetch all plans for the feed (ordered by date), optionally filtered by city */
export const fetchFeedPlans = async (city?: string): Promise<Plan[]> => {
  try {
    const snap = await getDocs(collection(db, PLANS));
    console.log(`[plansService] fetchFeedPlans: ${snap.docs.length} plans found`);
    const plans = snap.docs.map((d) => {
      const data = d.data() as Plan;
      return { ...data, id: d.id, title: capitalize(data.title), timeAgo: getTimeAgo(data.createdAt) };
    }).filter((p) => !(p as any).archived && planMatchesCity(p, city));
    // Sort client-side (avoids Firestore index requirement)
    plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return plans;
  } catch (err) {
    console.error('[plansService] fetchFeedPlans error:', err);
    return [];
  }
};

/** Fetch plans created by a specific user */
export const fetchUserPlans = async (userId: string): Promise<Plan[]> => {
  try {
    const q = query(collection(db, PLANS), where('authorId', '==', userId));
    const snap = await getDocs(q);
    console.log(`[plansService] fetchUserPlans(${userId}): ${snap.docs.length} plans found`);
    const plans = snap.docs.map((d) => {
      const data = d.data() as Plan;
      return { ...data, id: d.id, title: capitalize(data.title), timeAgo: getTimeAgo(data.createdAt) };
    }).filter((p) => !(p as any).archived);
    plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return plans;
  } catch (err) {
    console.error('[plansService] fetchUserPlans error:', err);
    return [];
  }
};

/** Delete a plan permanently */
export const deletePlan = async (planId: string): Promise<void> => {
  await deleteDoc(doc(db, PLANS, planId));
};

/** Archive a plan (soft-delete — hidden from feed but recoverable) */
export const archivePlan = async (planId: string): Promise<void> => {
  await updateDoc(doc(db, PLANS, planId), { archived: true });
};

/** Unarchive (republish) a plan */
export const unarchivePlan = async (planId: string): Promise<void> => {
  await updateDoc(doc(db, PLANS, planId), { archived: false });
};

/** Fetch archived plans for a user */
export const fetchArchivedPlans = async (userId: string): Promise<Plan[]> => {
  try {
    const q = query(collection(db, PLANS), where('authorId', '==', userId), where('archived', '==', true));
    const snap = await getDocs(q);
    const plans = snap.docs.map((d) => {
      const data = d.data() as Plan;
      return { ...data, id: d.id, title: capitalize(data.title), timeAgo: getTimeAgo(data.createdAt) };
    });
    plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return plans;
  } catch (err) {
    console.error('[plansService] fetchArchivedPlans error:', err);
    return [];
  }
};

/** Fetch a single plan by ID */
export const fetchPlanById = async (planId: string): Promise<Plan | null> => {
  try {
    const snap = await getDoc(doc(db, PLANS, planId));
    if (!snap.exists()) return null;
    const data = snap.data() as Plan;
    return { ...data, id: snap.id, title: capitalize(data.title), timeAgo: getTimeAgo(data.createdAt) };
  } catch (err) {
    console.error('[plansService] fetchPlanById error:', err);
    return null;
  }
};

// ==================== LIKES ====================

/** Get liked plan IDs for a user */
export const fetchLikedPlanIds = async (userId: string): Promise<Set<string>> => {
  const q = query(collection(db, `users/${userId}/${LIKED_PLANS}`));
  const snap = await getDocs(q);
  return new Set(snap.docs.map((d) => d.id));
};

/** Toggle like on a plan */
export const toggleLikePlan = async (userId: string, planId: string, isLiked: boolean, sender?: User, plan?: Plan): Promise<void> => {
  const ref = doc(db, `users/${userId}/${LIKED_PLANS}`, planId);
  if (isLiked) {
    await deleteDoc(ref);
    // Decrement likes count
    const planRef = doc(db, PLANS, planId);
    const planSnap = await getDoc(planRef);
    if (planSnap.exists()) {
      const current = (planSnap.data() as Plan).likesCount || 0;
      await updateDoc(planRef, { likesCount: Math.max(0, current - 1), likedByIds: arrayRemove(userId) });
    }
  } else {
    await setDoc(ref, { likedAt: new Date().toISOString() });
    // Increment likes count
    const planRef = doc(db, PLANS, planId);
    const planSnap = await getDoc(planRef);
    if (planSnap.exists()) {
      const current = (planSnap.data() as Plan).likesCount || 0;
      await updateDoc(planRef, { likesCount: current + 1, likedByIds: arrayUnion(userId) });
    }
    // Notify plan author
    if (sender && plan) notifyLike(sender, plan).catch((e) => console.error('[notif trigger]', e));
  }
};

// ==================== SAVED PLANS ====================

/** Fetch saved plans for a user */
export const fetchSavedPlans = async (userId: string): Promise<SavedPlan[]> => {
  try {
    const snap = await getDocs(collection(db, `users/${userId}/${SAVED_PLANS}`));
    console.log(`[plansService] fetchSavedPlans(${userId}): ${snap.docs.length} saves found`);

    const results: SavedPlan[] = [];
    for (const d of snap.docs) {
      const data = d.data() as { isDone: boolean; proofStatus?: 'validated' | 'declined'; savedAt: string };
      const plan = await fetchPlanById(d.id);
      if (plan) {
        results.push({ planId: d.id, plan, isDone: data.isDone, proofStatus: data.proofStatus, savedAt: data.savedAt });
      }
    }
    // Sort client-side
    results.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    return results;
  } catch (err) {
    console.error('[plansService] fetchSavedPlans error:', err);
    return [];
  }
};

/** Get saved plan IDs for a user (quick lookup) */
export const fetchSavedPlanIds = async (userId: string): Promise<Set<string>> => {
  const q = query(collection(db, `users/${userId}/${SAVED_PLANS}`));
  const snap = await getDocs(q);
  return new Set(snap.docs.map((d) => d.id));
};

/** Save a plan (to do) */
export const savePlan = async (userId: string, planId: string, sender?: User, plan?: Plan): Promise<void> => {
  await setDoc(doc(db, `users/${userId}/${SAVED_PLANS}`, planId), {
    isDone: false,
    savedAt: new Date().toISOString(),
  });
  await updateDoc(doc(db, PLANS, planId), { savedByIds: arrayUnion(userId) }).catch(() => {});
  if (sender && plan) notifySave(sender, plan).catch((e) => console.error('[notif trigger]', e));
};

/** Save a created plan (already done) */
export const saveCreatedPlan = async (userId: string, planId: string): Promise<void> => {
  await setDoc(doc(db, `users/${userId}/${SAVED_PLANS}`, planId), {
    isDone: true,
    savedAt: new Date().toISOString(),
  });
};

/** Unsave a plan */
export const unsavePlan = async (userId: string, planId: string): Promise<void> => {
  await deleteDoc(doc(db, `users/${userId}/${SAVED_PLANS}`, planId));
  await updateDoc(doc(db, PLANS, planId), { savedByIds: arrayRemove(userId) }).catch(() => {});
};

/** Mark a saved plan as done with optional proof status (unique vote per user) */
export const markPlanAsDone = async (userId: string, planId: string, proofStatus?: 'validated' | 'declined', sender?: User, plan?: Plan): Promise<void> => {
  const data: Record<string, any> = { isDone: true };
  if (proofStatus) data.proofStatus = proofStatus;
  await updateDoc(doc(db, `users/${userId}/${SAVED_PLANS}`, planId), data);

  // Handle unique proof vote per user per plan
  if (proofStatus) {
    try {
      const voteRef = doc(db, `${PLANS}/${planId}/proofVotes`, userId);
      const voteSnap = await getDoc(voteRef);
      const planRef = doc(db, PLANS, planId);

      if (voteSnap.exists()) {
        const existingStatus = voteSnap.data().status;
        if (existingStatus === proofStatus) return; // Same vote, no change
        // Changed vote: swap counts
        const planSnap = await getDoc(planRef);
        if (planSnap.exists()) {
          const pd = planSnap.data();
          const oldField = existingStatus === 'validated' ? 'proofCount' : 'declinedCount';
          const newField = proofStatus === 'validated' ? 'proofCount' : 'declinedCount';
          await updateDoc(planRef, {
            [oldField]: Math.max(0, (pd[oldField] || 0) - 1),
            [newField]: (pd[newField] || 0) + 1,
          });
        }
      } else {
        // New vote: increment
        const planSnap = await getDoc(planRef);
        if (planSnap.exists()) {
          const pd = planSnap.data();
          const field = proofStatus === 'validated' ? 'proofCount' : 'declinedCount';
          await updateDoc(planRef, { [field]: (pd[field] || 0) + 1 });
        }
      }
      // Save/update the vote record
      await setDoc(voteRef, { status: proofStatus, votedAt: new Date().toISOString() });
      // Track in recreatedByIds
      if (proofStatus === 'validated') {
        await updateDoc(planRef, { recreatedByIds: arrayUnion(userId) }).catch(() => {});
      }
      // Notify plan author on validated proof
      if (proofStatus === 'validated' && sender && plan) {
        notifyProofIt(sender, plan).catch((e) => console.error('[notif trigger]', e));
      }
    } catch (err) {
      console.error('[plansService] update proof vote error:', err);
    }
  }
};

// ==================== PUBLIC PLAN QUERIES ====================

/** Fetch public plans that have a specific tag (category), optionally filtered by city */
export const fetchPublicPlansByTag = async (tag: string, city?: string): Promise<Plan[]> => {
  try {
    const q = query(collection(db, PLANS), where('tags', 'array-contains', tag));
    const snap = await getDocs(q);
    const plans = snap.docs
      .map((d) => {
        const data = d.data() as Plan;
        return { ...data, id: d.id, title: capitalize(data.title), timeAgo: getTimeAgo(data.createdAt) };
      })
      .filter((p) => p.author?.isPrivate === false && planMatchesCity(p, city));
    plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return plans;
  } catch (err) {
    console.error('[plansService] fetchPublicPlansByTag error:', err);
    return [];
  }
};

/** Fetch public plans matching ANY of the given tags (max 30 via batched array-contains-any), optionally filtered by city */
export const fetchPublicPlansByTags = async (tags: string[], city?: string): Promise<Plan[]> => {
  if (tags.length === 0) return [];
  try {
    // Firestore array-contains-any supports max 30 values
    const batches: string[][] = [];
    for (let i = 0; i < tags.length; i += 30) batches.push(tags.slice(i, i + 30));

    const allPlans = new Map<string, Plan>();
    for (const batch of batches) {
      const q = query(collection(db, PLANS), where('tags', 'array-contains-any', batch));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        if (!allPlans.has(d.id)) {
          const data = d.data() as Plan;
          allPlans.set(d.id, { ...data, id: d.id, title: capitalize(data.title), timeAgo: getTimeAgo(data.createdAt) });
        }
      });
    }
    const plans = Array.from(allPlans.values()).filter((p) => p.author?.isPrivate === false && planMatchesCity(p, city));
    plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return plans;
  } catch (err) {
    console.error('[plansService] fetchPublicPlansByTags error:', err);
    return [];
  }
};

/** Haversine distance in km between two lat/lng pairs */
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Fetch public plans whose places fall within a radius (km) of a given point */
export const fetchPublicPlansNearby = async (
  lat: number,
  lng: number,
  radiusKm: number,
  city?: string,
): Promise<Plan[]> => {
  try {
    const snap = await getDocs(collection(db, PLANS));
    const plans = snap.docs
      .map((d) => {
        const data = d.data() as Plan;
        return { ...data, id: d.id, title: capitalize(data.title), timeAgo: getTimeAgo(data.createdAt) };
      })
      .filter((p) => {
        if (p.author?.isPrivate !== false) return false;
        if (!planMatchesCity(p, city)) return false;
        return p.places.some(
          (place) =>
            place.latitude != null &&
            place.longitude != null &&
            haversineDistance(lat, lng, place.latitude, place.longitude) <= radiusKm,
        );
      });
    plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return plans;
  } catch (err) {
    console.error('[plansService] fetchPublicPlansNearby error:', err);
    return [];
  }
};

/** Fetch public plans that contain a given place (by googlePlaceId or placeId) */
export const fetchPublicPlansWithPlace = async (placeId: string, googlePlaceId?: string): Promise<Plan[]> => {
  try {
    const snap = await getDocs(collection(db, PLANS));
    const plans = snap.docs
      .map((d) => {
        const data = d.data() as Plan;
        return { ...data, id: d.id, title: capitalize(data.title), timeAgo: getTimeAgo(data.createdAt) };
      })
      .filter((p) => {
        if (p.author?.isPrivate !== false) return false;
        return p.places.some(
          (place) =>
            (googlePlaceId && place.googlePlaceId === googlePlaceId) ||
            place.id === placeId
        );
      });
    plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return plans;
  } catch (err) {
    console.error('[plansService] fetchPublicPlansWithPlace error:', err);
    return [];
  }
};

/** Search public plans by query (title, place names, tags), optionally filtered by city */
export const searchPublicPlans = async (queryStr: string, city?: string): Promise<Plan[]> => {
  try {
    const snap = await getDocs(collection(db, PLANS));
    const q = queryStr.toLowerCase();
    const plans = snap.docs
      .map((d) => {
        const data = d.data() as Plan;
        return { ...data, id: d.id, title: capitalize(data.title), timeAgo: getTimeAgo(data.createdAt) };
      })
      .filter((p) => {
        if (p.author?.isPrivate !== false) return false;
        if (!planMatchesCity(p, city)) return false;
        return (
          p.title.toLowerCase().includes(q) ||
          p.places.some((pl) => pl.name.toLowerCase().includes(q)) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
    plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return plans;
  } catch (err) {
    console.error('[plansService] searchPublicPlans error:', err);
    return [];
  }
};

// ==================== COMMENTS ====================

const COMMENTS = 'comments';

/** Fetch comments for a plan */
export const fetchComments = async (planId: string): Promise<Comment[]> => {
  try {
    const q = query(collection(db, COMMENTS), where('planId', '==', planId));
    const snap = await getDocs(q);
    const comments = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Comment));
    comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return comments;
  } catch (err) {
    console.error('[plansService] fetchComments error:', err);
    return [];
  }
};

/** Add a comment to a plan */
export const addComment = async (planId: string, author: User, text: string, plan?: Plan): Promise<Comment> => {
  const now = new Date().toISOString();
  const commentData = {
    planId,
    authorId: author.id,
    authorName: author.displayName,
    authorInitials: author.initials,
    authorAvatarBg: author.avatarBg,
    authorAvatarColor: author.avatarColor,
    authorAvatarUrl: author.avatarUrl || null,
    text,
    createdAt: now,
  };
  const ref = await addDoc(collection(db, COMMENTS), commentData);

  // Increment commentsCount on the plan
  try {
    const planRef = doc(db, PLANS, planId);
    const planSnap = await getDoc(planRef);
    if (planSnap.exists()) {
      const current = (planSnap.data() as Plan).commentsCount || 0;
      await updateDoc(planRef, { commentsCount: current + 1 });
    }
  } catch (err) {
    console.error('[plansService] update commentsCount error:', err);
  }

  // Notify plan author
  if (plan) notifyComment(author, plan, text).catch((e) => console.error('[notif trigger]', e));

  return { ...commentData, id: ref.id };
};
