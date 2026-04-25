/**
 * Live geolocation presence for multi-user plan sessions.
 *
 * Each opted-in participant writes their current coordinates to a
 * subcollection of the parent session — `plan_sessions/{sessionId}/livePresence/{userId}`.
 * Other participants subscribe to the collection and render avatar
 * markers on the group map sheet.
 *
 * Privacy by absence : we ONLY write a doc when the participant has
 * explicitly opted-in. Opting out clears the doc. The opt-in choice
 * lives in component state (not persisted) so each new session asks
 * fresh — no surprises on a re-entry weeks later.
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

const SESSIONS = 'plan_sessions';
const LIVE = 'livePresence';

export interface LivePresence {
  userId: string;
  lat: number;
  lng: number;
  /** Best-effort accuracy in meters from the device. */
  accuracy?: number;
  /** ms epoch — used to grey-out stale presences (>2min old). */
  ts: number;
}

/**
 * Write/refresh the current participant's coordinates. Called on
 * geoloc updates (debounced upstream to ~30s) while the session is
 * active and the user has opted-in.
 *
 * Uses setDoc with merge so the doc is created on first call and
 * updated thereafter — no extra "is doc there?" check needed.
 */
export const writeLivePresence = async (
  sessionId: string,
  userId: string,
  lat: number,
  lng: number,
  accuracy?: number,
): Promise<void> => {
  const ref = doc(db, SESSIONS, sessionId, LIVE, userId);
  const payload: LivePresence = {
    userId,
    lat,
    lng,
    ts: Date.now(),
    ...(typeof accuracy === 'number' ? { accuracy } : {}),
  };
  await setDoc(ref, payload, { merge: true });
};

/**
 * Clear my live presence — called when:
 *   • the user opts out of sharing
 *   • the session is left / completed
 *   • the screen unmounts
 */
export const clearLivePresence = async (
  sessionId: string,
  userId: string,
): Promise<void> => {
  try {
    await deleteDoc(doc(db, SESSIONS, sessionId, LIVE, userId));
  } catch {
    // Best-effort — ignore (rules may reject after session is closed).
  }
};

/**
 * Subscribe to all participants' live presences. Returns the unsub
 * cleanup. The callback receives the full array on every snapshot.
 */
export const subscribeLivePresence = (
  sessionId: string,
  onData: (presences: LivePresence[]) => void,
  onError?: (err: Error) => void,
): (() => void) => {
  return onSnapshot(
    collection(db, SESSIONS, sessionId, LIVE),
    (snap) => {
      const arr: LivePresence[] = snap.docs.map((d) => {
        const data: any = d.data();
        return {
          userId: data.userId || d.id,
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy,
          ts: data.ts || 0,
        };
      });
      onData(arr);
    },
    (err) => {
      console.warn('[livePresenceService] subscribe error:', err.message);
      onError?.(err);
    },
  );
};
