import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { PlaceReview, User } from '../types';

const PLACE_REVIEWS = 'placeReviews';

/** Submit reviews for multiple places at once (from ProofSurvey) */
export const submitPlaceReviews = async (
  reviews: { placeId: string; googlePlaceId?: string; planId: string; rating: number; text?: string }[],
  author: User
): Promise<void> => {
  const now = new Date().toISOString();
  for (const r of reviews) {
    if (r.rating < 1) continue; // skip unrated places
    await addDoc(collection(db, PLACE_REVIEWS), {
      placeId: r.placeId,
      googlePlaceId: r.googlePlaceId || null,
      planId: r.planId,
      authorId: author.id,
      authorName: author.displayName,
      authorInitials: author.initials,
      authorAvatarBg: author.avatarBg,
      authorAvatarColor: author.avatarColor,
      authorAvatarUrl: author.avatarUrl || null,
      rating: r.rating,
      text: r.text || null,
      createdAt: now,
    });
  }

  // Update user stats
  try {
    const ratedCount = reviews.filter((r) => r.rating >= 1).length;
    if (ratedCount > 0) {
      const userRef = doc(db, 'users', author.id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const current = userSnap.data().places_rated_count || 0;
        await updateDoc(userRef, { places_rated_count: current + ratedCount });
      }
    }
  } catch (err) {
    console.error('[placeReviewService] update user stats error:', err);
  }
};

/** Fetch all Proof reviews for a place (by googlePlaceId first, fallback to placeId) */
export const fetchPlaceReviews = async (placeId: string, googlePlaceId?: string): Promise<PlaceReview[]> => {
  try {
    let reviews: PlaceReview[] = [];

    // Query by googlePlaceId if available (aggregates across plans)
    if (googlePlaceId) {
      const q = query(collection(db, PLACE_REVIEWS), where('googlePlaceId', '==', googlePlaceId));
      const snap = await getDocs(q);
      reviews = snap.docs.map((d) => ({ ...d.data(), id: d.id } as PlaceReview));
    }

    // If no results from googlePlaceId, try placeId
    if (reviews.length === 0) {
      const q = query(collection(db, PLACE_REVIEWS), where('placeId', '==', placeId));
      const snap = await getDocs(q);
      reviews = snap.docs.map((d) => ({ ...d.data(), id: d.id } as PlaceReview));
    }

    reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return reviews;
  } catch (err) {
    console.error('[placeReviewService] fetchPlaceReviews error:', err);
    return [];
  }
};

/** Get average Proof rating for a place */
export const getPlaceProofRating = async (placeId: string, googlePlaceId?: string): Promise<{ average: number; count: number }> => {
  const reviews = await fetchPlaceReviews(placeId, googlePlaceId);
  if (reviews.length === 0) return { average: 0, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return { average: sum / reviews.length, count: reviews.length };
};
