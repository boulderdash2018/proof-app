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

export type MapFilter = 'all' | 'places' | 'people';

interface Props {
  visible: boolean;
  sessionId: string;
  /** Current map filter — controlled by parent. */
  filter: MapFilter;
  /** User picked a filter chip → parent applies it on the embedded map. */
  onFilterChange: (filter: MapFilter) => void;
  /** User tapped a participant row → parent pans the EMBEDDED map to that
   *  participant's live position, then auto-closes the panel so the user
   *  can see the result. */
  onParticipantTap: (userId: string) => void;
  onClose: () => void;
}

/**
 * Group session control panel — replaces the old `GroupLiveMapSheet`
 * AND the misguided `GroupSessionMap` (which carried its own map and
 * thus DOUBLED the map surface — exactly what the user complained about).
 *
 * This panel is a bottom slide-up sheet that has NO map of its own.
 * The single source-of-truth map is the embedded one in DoItNowScreen.web,
 * which renders BOTH places AND friend-avatar overlays. The panel just
 * exposes :
 *   • filter chips (Tous / Lieux / Amis) — re-fits + applies visibility
 *     constraints on the embedded map via `onFilterChange`
 *   • participants list with progress (step chip "2/4" + status badge +
 *     "À 230m du Café X" line)
 *   • tap-to-fly on any participant → parent pans the embedded map +
 *     closes the panel so the result is visible
 *
 * Result : ONE map. The panel is purely a control + browse surface.
 */
export const GroupSessionPanel: React.FC<Props> = ({
  visible, sessionId, filter, onFilterChange, onParticipantTap, onClose,
}) => {
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
    return Object.values(session.participants)
      .map((p) => {
        const live = presences.find((lp) => lp.userId === p.userId) || null;
        const progress = computeParticipantProgress(p, session.placeOrder, placesById, live);
        return { participant: p, live, progress };
      })
      // Live participants first (more interesting / actionable), then
      // those without a shared position. Within each group, sort by
      // step desc so the leader appears first — soft-race feel.
      .sort((a, b) => {
        if (!!a.live !== !!b.live) return a.live ? -1 : 1;
        return b.progress.stepIdx - a.progress.stepIdx;
      });
  }, [session, plan, presences, placesById]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          <View style={styles.grabber} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>EN GROUPE</Text>
              <Text style={styles.title}>{plan?.title || 'Plan'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Filter chips — drive what's visible on the EMBEDDED map. */}
          <View style={styles.filterRow}>
            {([
              { key: 'all',    label: 'Tous',  icon: 'apps-outline'      as const },
              { key: 'places', label: 'Lieux', icon: 'location-outline'  as const },
              { key: 'people', label: 'Amis',  icon: 'people-outline'    as const },
            ]).map((opt) => {
              const active = filter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => onFilterChange(opt.key as MapFilter)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={opt.icon} size={13} color={active ? Colors.textOnAccent : Colors.textSecondary} />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Opt-in CTA */}
          {optInStatus === 'pending' && (
            <View style={styles.optInBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optInTitle}>Partager ta position ?</Text>
                <Text style={styles.optInBody}>
                  Tes amis te verront sur la carte, et tu pourras les suivre en temps réel.
                </Text>
              </View>
              <TouchableOpacity style={styles.optInPrimary} onPress={optIn} activeOpacity={0.85}>
                <Text style={styles.optInPrimaryText}>Partager</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Participants list */}
          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {participantRows.map(({ participant: p, live, progress }) => {
              const isMe = p.userId === user?.id;
              const tappable = !!live;
              const statusBadgeStyle = badgeStyleFor(progress.status);
              return (
                <Pressable
                  key={p.userId}
                  onPress={() => tappable && onParticipantTap(p.userId)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && tappable && { backgroundColor: Colors.bgPrimary },
                  ]}
                >
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
                      {progress.status === 'on_site' && (
                        <View style={styles.liveDot} />
                      )}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {live ? formatProgressLine(progress) : 'Position non partagée'}
                    </Text>
                  </View>
                  {tappable && (
                    <Ionicons name="locate" size={16} color={Colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {optInStatus === 'opted-in' && (
            <TouchableOpacity style={styles.optOutFooter} onPress={optOut} activeOpacity={0.7}>
              <Ionicons name="eye-off-outline" size={13} color={Colors.textTertiary} />
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
    maxHeight: '85%',
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    letterSpacing: -0.05,
  },
  chipTextActive: { color: Colors.textOnAccent },
  optInBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  optInTitle: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  optInBody: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  optInPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  optInPrimaryText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    borderRadius: 8,
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
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  rowMeta: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  optOutFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
    paddingBottom: 6,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  optOutFooterText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
});
