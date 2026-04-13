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
import { PlaceReview, ReviewSource, User } from '../types';

const PLACE_REVIEWS = 'placeReviews';

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

/** Find an existing review by this user for a specific place (one per user per place) */
const findUserReviewForPlace = async (
  authorId: string,
  placeId: string,
  googlePlaceId?: string,
): Promise<PlaceReview | null> => {
  try {
    // Try googlePlaceId first — more reliable cross-plan matching
    if (googlePlaceId) {
      const q = query(
        collection(db, PLACE_REVIEWS),
        where('authorId', '==', authorId),
        where('googlePlaceId', '==', googlePlaceId),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        return { ...d.data(), id: d.id } as PlaceReview;
      }
    }

    // Fallback to placeId
    const q = query(
      collection(db, PLACE_REVIEWS),
      where('authorId', '==', authorId),
      where('placeId', '==', placeId),
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { ...d.data(), id: d.id } as PlaceReview;
    }

    return null;
  } catch (err) {
    console.error('[placeReviewService] findUserReviewForPlace error:', err);
    return null;
  }
};

// ═══════════════════════════════════════════════
// Submit (upsert — one review per user per place)
// ═══════════════════════════════════════════════

/** Submit reviews for multiple places — upserts: creates if new, updates if existing */
export const submitPlaceReviews = async (
  reviews: { placeId: string; googlePlaceId?: string; planId: string; rating: number; text?: string }[],
  author: User,
  source: ReviewSource = 'already_done',
): Promise<void> => {
  const now = new Date().toISOString();
  let newRatingsCount = 0;

  for (const r of reviews) {
    if (r.rating < 1) continue; // skip unrated places

    const existing = await findUserReviewForPlace(author.id, r.placeId, r.googlePlaceId);

    if (existing) {
      // ── Update existing review ──
      const reviewRef = doc(db, PLACE_REVIEWS, existing.id);
      await updateDoc(reviewRef, {
        rating: r.rating,
        text: r.text || null,
        planId: r.planId,
        source,
        updatedAt: now,
      });
    } else {
      // ── Create new review ──
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
        source,
        createdAt: now,
      });
      newRatingsCount++;
    }
  }

  // Only increment stats for NEW reviews (not updates)
  if (newRatingsCount > 0) {
    try {
      const userRef = doc(db, 'users', author.id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const current = userSnap.data().places_rated_count || 0;
        await updateDoc(userRef, { places_rated_count: current + newRatingsCount });
      }
    } catch (err) {
      console.error('[placeReviewService] update user stats error:', err);
    }
  }
};

// ═══════════════════════════════════════════════
// Fetch
// ═══════════════════════════════════════════════

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

    reviews.sort((a, b) => {
      const dateA = a.updatedAt || a.createdAt;
      const dateB = b.updatedAt || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
    return reviews;
  } catch (err) {
    console.error('[placeReviewService] fetchPlaceReviews error:', err);
    return [];
  }
};

// ═══════════════════════════════════════════════
// Rating (deduplicated by author)
// ═══════════════════════════════════════════════

/** Get average Proof rating for a place — deduplicated: one rating per user */
export const getPlaceProofRating = async (placeId: string, googlePlaceId?: string): Promise<{ average: number; count: number }> => {
  const reviews = await fetchPlaceReviews(placeId, googlePlaceId);
  if (reviews.length === 0) return { average: 0, count: 0 };

  // Keep only the latest review per author
  const latestByAuthor = new Map<string, PlaceReview>();
  for (const r of reviews) {
    const existing = latestByAuthor.get(r.authorId);
    const rDate = new Date(r.updatedAt || r.createdAt).getTime();
    const eDate = existing ? new Date(existing.updatedAt || existing.createdAt).getTime() : 0;
    if (!existing || rDate > eDate) {
      latestByAuthor.set(r.authorId, r);
    }
  }

  const unique = Array.from(latestByAuthor.values());
  const sum = unique.reduce((acc, r) => acc + r.rating, 0);
  return { average: sum / unique.length, count: unique.length };
};
