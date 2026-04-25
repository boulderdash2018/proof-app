import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store';
import { useDoItNowStore } from '../store/doItNowStore';
import { useGroupSessionStore } from '../store/groupSessionStore';
import { ConversationParticipant } from '../services/chatService';

/**
 * Drop-in overlay rendered at the top of DoItNowScreen when the route carries
 * a sessionId. It does three things:
 *
 *   1. Observes the Firestore session doc (live participants + check-ins).
 *   2. Auto-joins the session if the current user isn't yet a participant.
 *   3. Syncs the local DoItNow progress to the server (check-in on arrive,
 *      complete on session completion).
 *
 * Visually it renders a compact horizontal strip of participant avatars with
 * their current "step" label — so everyone in the group sees who's where.
 */

interface GroupSessionLayerProps {
  sessionId: string;
  placesCount: number;
}

export const GroupSessionLayer: React.FC<GroupSessionLayerProps> = ({
  sessionId,
  placesCount,
}) => {
  const user = useAuthStore((s) => s.user);
  const observeSession = useGroupSessionStore((s) => s.observeSession);
  const stopObserving = useGroupSessionStore((s) => s.stopObserving);
  const activeSession = useGroupSessionStore((s) => s.activeSession);
  const join = useGroupSessionStore((s) => s.join);
  const checkIn = useGroupSessionStore((s) => s.checkIn);
  const complete = useGroupSessionStore((s) => s.complete);

  const localSession = useDoItNowStore((s) => s.session);
  const localPlan = useDoItNowStore((s) => s.plan);

  // ── Observe the Firestore session while mounted ──
  useEffect(() => {
    if (!user?.id) return;
    observeSession(sessionId, user.id);
    return () => stopObserving();
  }, [sessionId, user?.id, observeSession, stopObserving]);

  // ── Auto-join when I'm not in the participants yet ──
  const hasJoinedRef = useRef(false);
  useEffect(() => {
    if (!user || !activeSession || hasJoinedRef.current) return;
    if (!activeSession.participants[user.id]) {
      const me: ConversationParticipant = {
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        avatarBg: user.avatarBg,
        avatarColor: user.avatarColor,
        initials: user.initials,
      };
      join(me);
      hasJoinedRef.current = true;
    } else {
      hasJoinedRef.current = true;
    }
  }, [user, activeSession, join]);

  // ── Sync local check-ins -> server ──
  const lastSyncedPlaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id || !localSession || !localPlan) return;
    const visits = localSession.placesVisited;
    if (visits.length === 0) return;
    const latest = visits[visits.length - 1];
    if (lastSyncedPlaceIdRef.current === latest.placeId) return;
    lastSyncedPlaceIdRef.current = latest.placeId;
    checkIn(latest.placeId);
  }, [localSession?.placesVisited.length, localSession, localPlan, checkIn, user?.id]);

  // ── Sync completion -> server ──
  const hasCompletedRef = useRef(false);
  useEffect(() => {
    if (!user || !localSession || hasCompletedRef.current) return;
    if (localSession.status === 'completed' && activeSession?.status === 'active') {
      const me: ConversationParticipant = {
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        avatarBg: user.avatarBg,
        avatarColor: user.avatarColor,
        initials: user.initials,
      };
      complete(me);
      hasCompletedRef.current = true;
    }
  }, [user, localSession, activeSession, complete]);

  // ── Strip rendering ──
  const participantList = useMemo(() => {
    if (!activeSession) return [];
    return Object.values(activeSession.participants).sort((a, b) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    );
  }, [activeSession]);

  if (!activeSession) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.inner}>
        <View style={styles.headRow}>
          <View style={styles.dotLive} />
          <Text style={styles.liveLabel}>EN COURS ENSEMBLE</Text>
          <Text style={styles.liveSub}>
            {participantList.length} {participantList.length > 1 ? 'participants' : 'participant'}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.avatarRow}
        >
          {participantList.map((p) => {
            const checkins = Object.keys(p.checkins || {}).length;
            const isMe = p.userId === user?.id;
            return (
              <View key={p.userId} style={styles.avatarWrap}>
                <Avatar
                  initials={p.initials}
                  bg={p.avatarBg}
                  color={p.avatarColor}
                  size="S"
                  avatarUrl={p.avatarUrl ?? undefined}
                />
                <Text style={styles.avatarName} numberOfLines={1}>
                  {isMe ? 'Toi' : p.displayName.split(' ')[0]}
                </Text>
                <View style={styles.progressPill}>
                  <Ionicons name="location" size={9} color={Colors.primaryDeep} />
                  <Text style={styles.progressText}>
                    {checkins}/{placesCount}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingTop: 4,
  },
  inner: {
    // Symmetric margins again — the DoItNow close × is hidden in
    // group session mode (the Discussion FAB is the canonical way
    // back to the conv), so the widget can use the full width.
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: 'rgba(44,36,32,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dotLive: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.success,
  },
  liveLabel: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textPrimary,
  },
  liveSub: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginLeft: 'auto',
  },
  avatarRow: {
    gap: 14,
    alignItems: 'flex-start',
    paddingRight: 4,
  },
  avatarWrap: {
    alignItems: 'center',
    gap: 3,
    width: 52,
  },
  avatarName: {
    fontSize: 10.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
    maxWidth: 52,
    textAlign: 'center',
  },
  progressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta100,
  },
  progressText: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primaryDeep,
    letterSpacing: 0.1,
  },
});
