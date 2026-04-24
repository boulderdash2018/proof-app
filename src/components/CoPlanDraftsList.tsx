import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store';
import { subscribeMyDrafts } from '../services/planDraftService';
import { PlanDraft } from '../types';

interface Props {
  onOpenDraft: (draftId: string) => void;
}

/**
 * Lightweight list of active drafts for the current user — displayed
 * below the entry cards in the Create screen so drafts are discoverable
 * without adding a dedicated tab.
 *
 * Uses a direct service subscription (not coPlanStore) so browsing this
 * list doesn't clobber the active workspace's draft state.
 */
export const CoPlanDraftsList: React.FC<Props> = ({ onOpenDraft }) => {
  const user = useAuthStore((s) => s.user);
  const [drafts, setDrafts] = useState<PlanDraft[] | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeMyDrafts(user.id, (ds) => {
      setDrafts(ds);
    });
    return () => unsub();
  }, [user?.id]);

  if (!drafts || drafts.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>BROUILLONS EN COURS</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {drafts.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            meId={user?.id}
            onPress={() => onOpenDraft(d.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Draft card
// ══════════════════════════════════════════════════════════════

interface CardProps {
  draft: PlanDraft;
  meId?: string;
  onPress: () => void;
}

const DraftCard: React.FC<CardProps> = ({ draft, meId, onPress }) => {
  const placesCount = draft.proposedPlaces.length;
  const participantCount = draft.participants.length;
  const others = draft.participants
    .filter((id) => id !== meId)
    .slice(0, 3)
    .map((id) => draft.participantDetails[id])
    .filter(Boolean);
  const hiddenCount = Math.max(0, (participantCount - 1) - others.length);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <Ionicons name="people" size={14} color={Colors.primary} />
        </View>
        <Text style={styles.cardEyebrow}>
          BROUILLON
        </Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{draft.title}</Text>
      <View style={styles.cardMeta}>
        <Ionicons name="location-outline" size={11} color={Colors.textSecondary} />
        <Text style={styles.cardMetaText}>
          {placesCount} lieu{placesCount > 1 ? 'x' : ''}
        </Text>
        <Text style={styles.cardMetaSep}>·</Text>
        <Ionicons name="people-outline" size={11} color={Colors.textSecondary} />
        <Text style={styles.cardMetaText}>
          {participantCount}
        </Text>
      </View>
      <View style={styles.cardAvatars}>
        {others.map((p) => (
          <View key={p.userId} style={styles.avatarRing}>
            <Avatar
              initials={p.initials}
              bg={p.avatarBg}
              color={p.avatarColor}
              size="XS"
              avatarUrl={p.avatarUrl ?? undefined}
            />
          </View>
        ))}
        {hiddenCount > 0 && (
          <View style={styles.moreChip}>
            <Text style={styles.moreChipText}>+{hiddenCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    marginTop: 22,
    marginHorizontal: -16, // bleed past the container padding so cards reach the edge
  },
  label: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  list: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    width: 180,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  cardIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEyebrow: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 18,
    minHeight: 36,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  cardMetaText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },
  cardMetaSep: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginHorizontal: 2,
  },
  cardAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: -6, // overlap
  },
  avatarRing: {
    borderWidth: 2,
    borderColor: Colors.bgSecondary,
    borderRadius: 99,
  },
  moreChip: {
    marginLeft: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: Colors.bgTertiary,
  },
  moreChipText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },
});
