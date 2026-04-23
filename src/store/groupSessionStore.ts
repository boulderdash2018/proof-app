import { create } from 'zustand';
import {
  GroupPlanSession,
  subscribeSession,
  checkInAtPlace,
  completeGroupSession,
  joinGroupSession,
} from '../services/planSessionService';
import { ConversationParticipant } from '../services/chatService';

interface GroupSessionStore {
  /** Currently-observed session (set when a DoItNow screen opens with a sessionId). */
  activeSession: GroupPlanSession | null;
  activeSessionId: string | null;
  _unsub: (() => void) | null;
  _userId: string | null;

  // ── Subscription ──
  observeSession: (sessionId: string, userId: string) => void;
  stopObserving: () => void;

  // ── Actions ──
  checkIn: (placeId: string, photoUrl?: string) => Promise<void>;
  join: (participant: ConversationParticipant) => Promise<void>;
  complete: (actor: ConversationParticipant) => Promise<void>;
}

export const useGroupSessionStore = create<GroupSessionStore>((set, get) => ({
  activeSession: null,
  activeSessionId: null,
  _unsub: null,
  _userId: null,

  observeSession: (sessionId: string, userId: string) => {
    const existing = get();
    if (existing.activeSessionId === sessionId && existing._unsub) return;

    // Close previous listener if any.
    existing._unsub?.();

    set({ activeSessionId: sessionId, activeSession: null, _userId: userId });

    const unsub = subscribeSession(
      sessionId,
      (session) => {
        set({ activeSession: session });
      },
      (err) => {
        console.warn('[groupSessionStore] observe error:', err);
      },
    );

    set({ _unsub: unsub });
  },

  stopObserving: () => {
    const { _unsub } = get();
    _unsub?.();
    set({
      _unsub: null,
      activeSessionId: null,
      activeSession: null,
      _userId: null,
    });
  },

  checkIn: async (placeId, photoUrl) => {
    const { activeSessionId, _userId } = get();
    if (!activeSessionId || !_userId) return;
    try {
      await checkInAtPlace(activeSessionId, _userId, placeId, photoUrl);
    } catch (err) {
      console.warn('[groupSessionStore] checkIn error:', err);
    }
  },

  join: async (participant) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    try {
      await joinGroupSession(activeSessionId, participant);
    } catch (err) {
      console.warn('[groupSessionStore] join error:', err);
    }
  },

  complete: async (actor) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    try {
      await completeGroupSession(activeSessionId, actor);
    } catch (err) {
      console.warn('[groupSessionStore] complete error:', err);
    }
  },
}));
