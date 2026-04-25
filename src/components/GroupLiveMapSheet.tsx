import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useLivePresence } from '../hooks/useLivePresence';
import { useGroupSessionStore } from '../store/groupSessionStore';
import { useAuthStore } from '../store';
import {
  haversineKm,
  walkingMinutes,
  formatDistanceShort,
  formatRelativePresence,
} from './GroupLiveMapShared';

interface Props {
  visible: boolean;
  sessionId: string;
  /** My current coordinates — used to compute relative distance/ETA to
   *  each other participant. */
  myLocation?: { lat: number; lng: number } | null;
  onClose: () => void;
}

/**
 * Native variant — list-only.
 *
 * The map background uses `react-native-maps` which we haven't wired
 * into this commit; the list view alone delivers most of the value
 * (who's where, how far, last update). A follow-up commit can layer
 * the actual map under it.
 */
export const GroupLiveMapSheet: React.FC<Props> = ({ visible, sessionId, myLocation, onClose }) => {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { presences, optInStatus, optIn, optOut } = useLivePresence(visible ? sessionId : undefined);
  const session = useGroupSessionStore((s) => s.activeSession);

  // Pair each participant with their (optional) live presence.
  const rows = useMemo(() => {
    if (!session) return [];
    return Object.values(session.participants).map((p) => {
      const live = presences.find((lp) => lp.userId === p.userId);
      const distKm = (live && myLocation)
        ? haversineKm(myLocation.lat, myLocation.lng, live.lat, live.lng)
        : null;
      return { participant: p, live, distKm };
    });
  }, [session, presences, myLocation]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          {/* Grabber */}
          <View style={styles.grabber} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>LE GROUPE EN LIVE</Text>
              <Text style={styles.title}>{rows.length} {rows.length > 1 ? 'amis' : 'ami'} en route</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Opt-in CTA — shown only on first open if user hasn't decided */}
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

          {/* List */}
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ paddingTop: 4 }}>
            {rows.map(({ participant: p, live, distKm }) => {
              const isMe = p.userId === user?.id;
              const distLabel = distKm !== null ? formatDistanceShort(distKm) : null;
              const minutes = distKm !== null ? walkingMinutes(distKm) : null;
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
                    <Text style={styles.rowName} numberOfLines={1}>
                      {isMe ? 'Toi' : p.displayName.split(' ')[0]}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {live ? (
                        isMe ? 'Tu partages ta position' :
                        distLabel ? `À ${minutes} min · ${distLabel}` :
                        `Position partagée · ${formatRelativePresence(live.ts)}`
                      ) : 'Position non partagée'}
                    </Text>
                  </View>
                  <View style={[styles.statusDot, live ? styles.statusDotLive : styles.statusDotOff]} />
                </View>
              );
            })}
          </ScrollView>

          {/* Bottom — opt-out shortcut once opted-in */}
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
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
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
  optInRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optInGhost: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  optInGhostText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },
  optInPrimary: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  optInPrimaryText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  rowMeta: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
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
