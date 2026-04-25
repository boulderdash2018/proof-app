import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { fetchPlanDraft } from '../services/planDraftService';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

interface Props {
  draftId: string;
  /** Tap "Modifier" → workspace. */
  onOpenWorkspace: () => void;
  /** Tap "N modif en attente de vote" → scroll to the latest pending
   *  proposition card in the chat. The parent owns the FlatList ref so
   *  we just signal which proposal to surface. */
  onJumpToPendingProposal?: (proposalId: string) => void;
}

interface DraftSummary {
  placeCount: number;
  participantCount: number;
  participantsWithDispos: number;
  pendingProposalCount: number;
  /** ID of the most-recent pending proposal — used as the jump target. */
  latestPendingProposalId: string | null;
}

/**
 * Compact "draft status" widget pinned just below the conversation
 * header. Shows the live state of the linked plan draft and exposes
 * the two main shortcuts :
 *   • "Modifier"  → workspace (replaces the floating FAB)
 *   • "N modif"   → scroll to the freshest pending proposition card
 *
 * Visually : terracotta number-chip on the left for the place count,
 * a 2-line summary in the middle, and a CTA pill on the right.
 *
 * Data sourcing :
 *   • One-shot `fetchPlanDraft` for the draft scalars (places,
 *     participants, dispos).
 *   • A live `onSnapshot` over the proposals subcollection so the
 *     "X modif en attente" badge stays current as the group acts.
 *   • Re-runs whenever `draftId` changes (i.e., the user opens a
 *     different conv).
 */
export const CoPlanStatusBar: React.FC<Props> = ({ draftId, onOpenWorkspace, onJumpToPendingProposal }) => {
  const [summary, setSummary] = useState<DraftSummary | null>(null);

  // Hydrate the draft scalars once per draftId change.
  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    (async () => {
      const draft = await fetchPlanDraft(draftId);
      if (cancelled || !draft) return;
      const participantCount = draft.participants.length;
      const participantsWithDispos = draft.participants.filter((uid) => {
        const slots = draft.availability[uid]?.slots;
        return slots && slots.length > 0;
      }).length;
      setSummary({
        placeCount: draft.proposedPlaces.length,
        participantCount,
        participantsWithDispos,
        pendingProposalCount: 0,
        latestPendingProposalId: null,
      });
    })();
    return () => { cancelled = true; };
  }, [draftId]);

  // Live listen on the proposals subcollection — the "X modif en
  // attente de vote" badge needs to react in real time when someone
  // creates / votes / resolves a proposal.
  useEffect(() => {
    if (!draftId) return;
    const q = query(
      collection(db, 'plan_drafts', draftId, 'proposals'),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        let latestTs = 0;
        let latestId: string | null = null;
        snap.docs.forEach((d) => {
          const data: any = d.data();
          const ts = data.proposedAt?.toDate?.()?.getTime?.() ?? 0;
          if (ts > latestTs) {
            latestTs = ts;
            latestId = d.id;
          }
        });
        setSummary((prev) => prev ? {
          ...prev,
          pendingProposalCount: snap.size,
          latestPendingProposalId: latestId,
        } : prev);
      },
      (err) => {
        console.warn('[CoPlanStatusBar] proposals listener error:', err.message);
      },
    );
    return () => unsub();
  }, [draftId]);

  if (!summary) {
    // Render a neutral placeholder — same height as final widget so the
    // layout doesn't jump when data lands.
    return <View style={[styles.wrap, styles.wrapPlaceholder]} />;
  }

  const placeWord = summary.placeCount === 1 ? 'lieu' : 'lieux';
  const dispoSummary = `${summary.participantsWithDispos} dispo${summary.participantsWithDispos > 1 ? 's' : ''} sur ${summary.participantCount}`;
  const hasPending = summary.pendingProposalCount > 0;
  const pendingLabel = summary.pendingProposalCount === 1
    ? '1 modif en attente de vote'
    : `${summary.pendingProposalCount} modifs en attente de vote`;

  return (
    <View style={styles.wrap}>
      {/* Left chip — big terracotta count of places */}
      <View style={styles.countChip}>
        <Text style={styles.countChipText}>{summary.placeCount}</Text>
      </View>

      {/* Middle — summary lines */}
      <View style={styles.middle}>
        <Text style={styles.line1} numberOfLines={1}>
          {summary.placeCount} {placeWord}  ·  {dispoSummary}
        </Text>
        {hasPending && summary.latestPendingProposalId && onJumpToPendingProposal ? (
          <Pressable
            onPress={() => onJumpToPendingProposal(summary.latestPendingProposalId!)}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Text style={styles.line2Pending} numberOfLines={1}>
              {pendingLabel}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.line2} numberOfLines={1}>
            {hasPending ? pendingLabel : 'Brouillon en cours'}
          </Text>
        )}
      </View>

      {/* Right — Modifier CTA */}
      <TouchableOpacity
        style={styles.cta}
        onPress={onOpenWorkspace}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Modifier le brouillon"
      >
        <Text style={styles.ctaText}>Modifier</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.textOnAccent} />
      </TouchableOpacity>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.bgPrimary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  wrapPlaceholder: {
    height: 60, // matches final height
  },
  countChip: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  countChipText: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.4,
  },
  middle: {
    flex: 1,
    minWidth: 0,
  },
  line1: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  line2: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
    letterSpacing: 0.05,
  },
  line2Pending: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    marginTop: 2,
    letterSpacing: 0.05,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 14,
    paddingRight: 11,
    paddingVertical: 9,
    borderRadius: 99,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  ctaText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },
});
