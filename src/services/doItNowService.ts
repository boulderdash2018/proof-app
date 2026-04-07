import { doc, setDoc, updateDoc, arrayUnion, increment, getDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { DoItNowSession, DoItNowPlaceVisit, PlanPhoto } from '../types';

const PLANS = 'plans';
const USERS = 'users';
const PLACE_REVIEWS = 'placeReviews';

/** Save a completed session to the user's document */
export async function saveSession(session: DoItNowSession): Promise<void> {
  const userRef = doc(db, USERS, session.userId);
  await updateDoc(userRef, {
    plan_sessions: arrayUnion({
      plan_id: session.planId,
      started_at: session.startedAt,
      completed_at: session.completedAt,
      transport_used: session.transport,
      places_visited: session.placesVisited.map((v) => v.placeId),
      photos: session.placesVisited.filter((v) => v.photoUrl).map((v) => v.photoUrl),
      total_duration_minutes: session.totalDurationMinutes,
    }),
    plans_completed_count: increment(1),
  }).catch(() => {
    // If field doesn't exist yet, set it
    setDoc(userRef, {
      plan_sessions: [{
        plan_id: session.planId,
        started_at: session.startedAt,
        completed_at: session.completedAt,
        transport_used: session.transport,
        places_visited: session.placesVisited.map((v) => v.placeId),
        photos: session.placesVisited.filter((v) => v.photoUrl).map((v) => v.photoUrl),
        total_duration_minutes: session.totalDurationMinutes,
      }],
    }, { merge: true });
  });
}

/** Save a place review from a Do It Now session */
export async function savePlaceReview(
  placeId: string,
  review: {
    userId: string;
    username: string;
    rating: number;
    comment?: string;
    timeSpentMinutes?: number;
    planId: string;
  }
): Promise<void> {
  const reviewId = `pr-${Date.now()}-${review.userId.slice(0, 6)}`;
  await setDoc(doc(db, PLACE_REVIEWS, reviewId), {
    id: reviewId,
    placeId,
    userId: review.userId,
    username: review.username,
    rating: review.rating,
    comment: review.comment || '',
    timeSpentMinutes: review.timeSpentMinutes || 0,
    planId: review.planId,
    createdAt: new Date().toISOString(),
  });
}

/** Record plan completion on the plan document */
export async function recordPlanCompletion(
  planId: string,
  userId: string,
  transport: string,
  totalDurationMinutes: number,
  photos: string[]
): Promise<void> {
  const planRef = doc(db, PLANS, planId);
  await updateDoc(planRef, {
    completions: arrayUnion({
      user_id: userId,
      completed_at: new Date().toISOString(),
      transport_used: transport,
      total_duration_minutes: totalDurationMinutes,
      photos,
    }),
    proof_validations_count: increment(1),
  }).catch(console.error);
}

/** Save a photo taken during Do It Now to user profile */
export async function savePlanPhoto(userId: string, photo: PlanPhoto): Promise<void> {
  const userRef = doc(db, USERS, userId);
  await updateDoc(userRef, {
    plan_photos: arrayUnion(photo),
  }).catch(() => {
    setDoc(userRef, { plan_photos: [photo] }, { merge: true });
  });
}
