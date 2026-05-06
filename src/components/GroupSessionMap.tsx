import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useLivePresence } from '../hooks/useLivePresence';
import { useGroupSessionStore } from '../store/groupSessionStore';
import { useDoItNowStore } from '../store/doItNowStore';
import { useAuthStore } from '../store';
import {
  computeParticipantProgress,
  formatProgressLine,
  formatStepChip,
  ParticipantStatus,
} from '../utils/groupSessionProgress';

interface Props {
  visible: boolean;
  sessionId: string;
  myLocation?: { lat: number; lng: number } | null;
  onClose: () => void;
}

/**
 * Native variant — list-only fallback for the unified group session map.
 *
 * The web variant (`GroupSessionMap.web.tsx`) renders a Google Map with
 * places + avatars + filter chips. On native we'd need react-native-maps
 * which isn't wired in this commit — the list still delivers the key
 * value (per-participant progress + step + ETA), and the same drawer
 * pattern as the web variant. When native maps land, this file can
 * grow a MapView above the drawer without changing the API.
 */
export const GroupSessionMap: React.FC<Props> = ({ visible, sessionId, onClose }) => {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { presences, optInStatus, optIn, optOut } = useLivePresence(visible ? sessionId : undefined);
  const session = useGroupSessionStore((s) => s.activeSession);
  const plan = useDoItNowStore((s) => s.plan);

  const placesById = useMemo(() => {
    const out: Record<string, { id: string; name: string; latitude?: number; longitude?: number }> = {};
    plan?.places.forEach((p) => { out[p.id] = p; });
    return out;
  }, [plan]);

  const participantRows = useMemo(() => {
    if (!session || !plan) return [];
    return Object.values(session.participants).map((p) => {
      const live = presences.find((lp) => lp.userId === p.userId) || null;
      const progress = computeParticipantProgress(p, session.placeOrder, placesById, live);
      return { participant: p, live, progress };
    });
  }, [session, plan, presences, placesById]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>EN GROUPE</Text>
              <Text style={styles.title}>{plan?.title || 'Plan'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {optInStatus === 'pending' && (
            <View style={styles.optInBox}>
              <Text style={styles.optInTitle}>Partager ta position avec le groupe ?</Text>
              <Text style={styles.optInBody}>
                Tes amis verront ton point sur la carte. Tu peux te retirer à tout moment.
              </Text>
              <View style={styles.optInRow}>
                <TouchableOpacity style={styles.optInGhost} onPress={optOut} activeOpacity={0.7}>
                  <Text style={styles.optInGhostText}>Pas maintenant</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.optInPrimary} onPress={optIn} activeOpacity={0.85}>
                  <Text style={styles.optInPrimaryText}>Partager</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingTop: 4 }}>
            {participantRows.map(({ participant: p, live, progress }) => {
              const isMe = p.userId === user?.id;
              const statusBadgeStyle = badgeStyleFor(progress.status);
              return (
                <View key={p.userId} style={styles.row}>
                  <Avatar
                    initials={p.initials}
                    bg={p.avatarBg}
                    color={p.avatarColor}
                    size="M"
                    avatarUrl={p.avatarUrl ?? undefined}
                  />
                  <View style={styles.rowText}>
                    <View style={styles.rowNameLine}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {isMe ? 'Toi' : p.displayName.split(' ')[0]}
                      </Text>
                      <View style={[styles.stepChip, statusBadgeStyle.chip]}>
                        <Text style={[styles.stepChipText, statusBadgeStyle.text]}>
                          {formatStepChip(progress)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {formatProgressLine(progress)}
                    </Text>
                  </View>
                  <View style={[styles.statusDot, live ? styles.statusDotLive : styles.statusDotOff]} />
                </View>
              );
            })}
          </ScrollView>

          {optInStatus === 'opted-in' && (
            <TouchableOpacity style={styles.optOutFooter} onPress={optOut} activeOpacity={0.7}>
              <Ionicons name="eye-off-outline" size={14} color={Colors.textTertiary} />
              <Text style={styles.optOutFooterText}>Arrêter de partager ma position</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

function badgeStyleFor(status: ParticipantStatus): { chip: any; text: any } {
  switch (status) {
    case 'finished':
      return {
        chip:  { backgroundColor: Colors.successBg, borderColor: Colors.successBorder },
        text:  { color: Colors.success },
      };
    case 'on_site':
      return {
        chip:  { backgroundColor: Colors.terracotta100, borderColor: Colors.terracotta300 },
        text:  { color: Colors.terracotta700 },
      };
    case 'in_transit':
    default:
      return {
        chip:  { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderMedium },
        text:  { color: Colors.textSecondary },
      };
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '90%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderMedium,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    color: Colors.primary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  optInBox: {
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  optInTitle: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.15,
    marginBottom: 6,
  },
  optInBody: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 12,
  },
  optInRow: { flexDirection: 'row', gap: 8 },
  optInGhost: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  optInGhostText: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.textSecondary },
  optInPrimary: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  optInPrimaryText: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.textOnAccent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowName: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  stepChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stepChipText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.2,
  },
  rowMeta: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotLive: { backgroundColor: Colors.success },
  statusDotOff: { backgroundColor: Colors.borderMedium },
  optOutFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  optOutFooterText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
});
