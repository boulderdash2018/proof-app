import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { useAuthStore } from '../store';
import {
  LivePresence,
  writeLivePresence,
  clearLivePresence,
  subscribeLivePresence,
} from '../services/livePresenceService';

const WRITE_INTERVAL_MS = 30_000;

export type OptInStatus = 'pending' | 'opted-in' | 'opted-out';

interface Result {
  /** All participants' live presences (mine + others). */
  presences: LivePresence[];
  /** My current opt-in choice. */
  optInStatus: OptInStatus;
  /** Trigger the OS permission prompt + start sharing. */
  optIn: () => Promise<void>;
  /** Stop sharing + clear my server-side doc. */
  optOut: () => Promise<void>;
}

/**
 * Hook used by the live map sheet. Owns three concerns :
 *   1. Subscribe to other participants' positions while the session is active.
 *   2. If the user opted-in, watch their geoloc and push to Firestore
 *      every WRITE_INTERVAL_MS (debounced) until they leave.
 *   3. Cleanup on unmount — clears the user's doc so they vanish from
 *      everyone's map (privacy-respectful default).
 *
 * The opt-in is gated client-side : refusing keeps the user able to SEE
 * the others without exposing their own position. (User explicit spec.)
 */
export const useLivePresence = (sessionId?: string): Result => {
  const user = useAuthStore((s) => s.user);
  const [presences, setPresences] = useState<LivePresence[]>([]);
  const [optInStatus, setOptInStatus] = useState<OptInStatus>('pending');

  // ── Always subscribe to others (no opt-in needed to see them) ──
  useEffect(() => {
    if (!sessionId) return;
    return subscribeLivePresence(sessionId, setPresences);
  }, [sessionId]);

  // ── Write my own position when opted-in ──
  const lastWriteRef = useRef<number>(0);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const stopSharing = useCallback(async () => {
    if (subRef.current) {
      subRef.current.remove();
      subRef.current = null;
    }
    if (watchIdRef.current !== null && Platform.OS === 'web' && (navigator as any).geolocation) {
      (navigator as any).geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (sessionId && user?.id) {
      await clearLivePresence(sessionId, user.id);
    }
  }, [sessionId, user?.id]);

  const startSharing = useCallback(async () => {
    if (!sessionId || !user?.id) return;
    const writeIfStale = (lat: number, lng: number, accuracy?: number) => {
      const now = Date.now();
      if (now - lastWriteRef.current < WRITE_INTERVAL_MS) return;
      lastWriteRef.current = now;
      writeLivePresence(sessionId, user.id, lat, lng, accuracy).catch(() => {});
    };

    if (Platform.OS === 'web') {
      // Browser geolocation API.
      if (!(navigator as any).geolocation) {
        setOptInStatus('opted-out');
        return;
      }
      try {
        // Permissions handled by the browser via navigator.geolocation.watchPosition's prompt.
        watchIdRef.current = (navigator as any).geolocation.watchPosition(
          (pos: any) => writeIfStale(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
          () => setOptInStatus('opted-out'),
          { enableHighAccuracy: false, maximumAge: 30_000, timeout: 60_000 },
        );
      } catch {
        setOptInStatus('opted-out');
      }
      return;
    }

    // Native — expo-location.
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setOptInStatus('opted-out');
      return;
    }
    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 30, timeInterval: WRITE_INTERVAL_MS },
      (pos) => writeIfStale(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? undefined),
    );
  }, [sessionId, user?.id]);

  const optIn = useCallback(async () => {
    setOptInStatus('opted-in');
    await startSharing();
  }, [startSharing]);

  const optOut = useCallback(async () => {
    setOptInStatus('opted-out');
    await stopSharing();
  }, [stopSharing]);

  // Cleanup on unmount or session change.
  useEffect(() => {
    return () => {
      stopSharing().catch(() => {});
    };
  }, [stopSharing]);

  return { presences, optInStatus, optIn, optOut };
};
