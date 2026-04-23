import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Plan } from '../types';
import { fetchPlanById, fetchUserPlans } from './plansService';

const USERS = 'users';

/**
 * Returns all plans tied to the user as a "place owner":
 *   - Plans they authored
 *   - Plans they completed via Do It Now (plan_sessions array on user doc)
 *
 * Deduped by planId. Used by the personal map mode ("Mes lieux") so the
 * markers come from places the user has ACTUALLY been to, not just saved.
 */
export const fetchMyPlansForMap = async (userId: string): Promise<Plan[]> => {
  try {
    const [authored, sessionPlans] = await Promise.all([
      fetchUserPlans(userId),
      fetchPlanSessionsAsPlans(userId),
    ]);

    const map = new Map<string, Plan>();
    for (const p of authored) map.set(p.id, p);
    for (const p of sessionPlans) if (!map.has(p.id)) map.set(p.id, p);
    return Array.from(map.values());
  } catch (err) {
    console.error('[myPlacesService] fetchMyPlansForMap error:', err);
    return [];
  }
};

/** Resolve plan_sessions[].plan_id → full Plan documents. */
async function fetchPlanSessionsAsPlans(userId: string): Promise<Plan[]> {
  try {
    const userRef = doc(db, USERS, userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return [];
    const data = snap.data() as { plan_sessions?: { plan_id?: string }[] };
    const sessionPlanIds = (data.plan_sessions || [])
      .map((s) => s?.plan_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (sessionPlanIds.length === 0) return [];

    const unique = Array.from(new Set(sessionPlanIds));
    const plans = await Promise.all(unique.map((id) => fetchPlanById(id)));
    return plans.filter((p): p is Plan => p !== null);
  } catch (err) {
    console.error('[myPlacesService] fetchPlanSessionsAsPlans error:', err);
    return [];
  }
}
