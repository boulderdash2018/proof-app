import { create } from 'zustand';
import { DoItNowSession, DoItNowPlaceVisit, DoItNowTransport, Plan } from '../types';

interface DoItNowStore {
  session: DoItNowSession | null;
  plan: Plan | null;
  isFirstTime: boolean;

  startSession: (plan: Plan, transport: DoItNowTransport, userId: string) => void;
  arriveAtPlace: (placeIndex: number) => void;
  leavePlace: () => void;
  addPhoto: (placeIndex: number, photoUrl: string) => void;
  ratePlace: (placeIndex: number, rating: number, reviewText?: string) => void;
  nextStop: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  completeSession: () => void;
  clearSession: () => void;
  setFirstTimeDone: () => void;
}

export const useDoItNowStore = create<DoItNowStore>((set, get) => ({
  session: null,
  plan: null,
  isFirstTime: true,

  startSession: (plan, transport, userId) => {
    const session: DoItNowSession = {
      id: `din-${Date.now()}`,
      planId: plan.id,
      planTitle: plan.title,
      userId,
      transport,
      startedAt: new Date().toISOString(),
      currentPlaceIndex: 0,
      placesVisited: [],
      isPaused: false,
      status: 'active',
    };
    set({ session, plan });
  },

  arriveAtPlace: (placeIndex) => {
    const { session, plan } = get();
    if (!session || !plan) return;
    const place = plan.places[placeIndex];
    if (!place) return;

    const visit: DoItNowPlaceVisit = {
      placeId: place.id,
      placeName: place.name,
      arrivedAt: new Date().toISOString(),
    };

    const existing = session.placesVisited.find((v) => v.placeId === place.id);
    if (existing) return; // Already arrived

    set({
      session: {
        ...session,
        currentPlaceIndex: placeIndex,
        placesVisited: [...session.placesVisited, visit],
      },
    });
  },

  leavePlace: () => {
    const { session } = get();
    if (!session) return;
    const visits = [...session.placesVisited];
    const current = visits[visits.length - 1];
    if (current && !current.leftAt) {
      const arrivedTime = new Date(current.arrivedAt).getTime();
      const now = Date.now();
      current.leftAt = new Date().toISOString();
      current.timeSpentMinutes = Math.round((now - arrivedTime) / 60000);
    }
    set({ session: { ...session, placesVisited: visits } });
  },

  addPhoto: (placeIndex, photoUrl) => {
    const { session } = get();
    if (!session) return;
    const visits = [...session.placesVisited];
    const visit = visits.find((v) => v.placeId === session.planId) || visits[placeIndex];
    if (visit) visit.photoUrl = photoUrl;
    set({ session: { ...session, placesVisited: visits } });
  },

  ratePlace: (placeIndex, rating, reviewText) => {
    const { session } = get();
    if (!session) return;
    const visits = [...session.placesVisited];
    if (visits[placeIndex]) {
      visits[placeIndex] = { ...visits[placeIndex], rating, reviewText };
    }
    set({ session: { ...session, placesVisited: visits } });
  },

  nextStop: () => {
    const { session } = get();
    if (!session) return;
    // Leave current place first
    get().leavePlace();
    set({
      session: {
        ...get().session!,
        currentPlaceIndex: session.currentPlaceIndex + 1,
      },
    });
  },

  pauseSession: () => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, isPaused: true, status: 'paused' } });
  },

  resumeSession: () => {
    const { session } = get();
    if (!session) return;
    set({ session: { ...session, isPaused: false, status: 'active' } });
  },

  completeSession: () => {
    const { session } = get();
    if (!session) return;
    get().leavePlace();
    const now = new Date();
    const startedAt = new Date(session.startedAt).getTime();
    const totalMinutes = Math.round((now.getTime() - startedAt) / 60000);
    set({
      session: {
        ...get().session!,
        completedAt: now.toISOString(),
        totalDurationMinutes: totalMinutes,
        status: 'completed',
      },
    });
  },

  clearSession: () => set({ session: null, plan: null }),

  setFirstTimeDone: () => set({ isFirstTime: false }),
}));
