import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { CoPlanProposal, CoPlanVote } from '../types';
import { subscribeProposal, voteOnProposal } from '../services/planDraftService';

interface Props {
  draftId: string;
  proposalId: string;
  /** Display fallback used until the live snapshot arrives. */
  proposalSubject: string;
  /** Total participants on the parent draft — denominator for "N/M votes". */
  participantCount: number;
  /** First name of the proposer — for the subtitle. */
  proposerName: string;
  /** Current viewer's user id — to highlight their vote. */
  voterUserId: string;
  /** Whether the current viewer is the proposer (hides vote buttons since
   *  they're auto-counted as 'pour'). */
  isProposer: boolean;
}

/**
 * Rich proposal card rendered inline in the conversation when a
 * `coplan_proposal` message lands. Subscribes to the underlying
 * `plan_drafts/{draftId}/proposals/{proposalId}` doc so vote counts +
 * status transitions are reflected live for everyone in the thread.
 *
 * Design (validated mockup) :
 *   ┌────────────────────────────────────────────────┐
 *   │  À VOTER  │  Léo propose une modif      01:32   │
 *   │  ─────────                                       │
 *   │  Retirer « Le Flandrin » du plan                 │
 *   │  Trop loin du métro. Casa Luisa serait mieux…    │
 *   │  ─────────────────                  1 / 3 votes  │
 *   │  ┌────────┐  ┌──────────┐                        │
 *   │  │ Rejeter │  │ Approuver │                       │
 *   │  └────────┘  └──────────┘                        │
 *   └────────────────────────────────────────────────┘
 *
 * On resolution, the card transforms — the vote bar locks at its final
 * value, buttons disappear, and a status line replaces them. The
 * separate `<CoPlanResolutionPill>` rendered later in the chat marks
 * the moment cleanly.
 */
export const CoPlanProposalCard: React.FC<Props> = ({
  draftId,
  proposalId,
  proposalSubject,
  participantCount,
  proposerName,
  voterUserId,
  isProposer,
}) => {
  const [prop, setProp] = useState<CoPlanProposal | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  // Live snapshot of the proposal — votes + status update in real time.
  useEffect(() => {
    const unsub = subscribeProposal(draftId, proposalId, setProp);
    return () => unsub();
  }, [draftId, proposalId]);

  // Slide-in entry animation.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  // Tap-bounce per button.
  const approveBounce = useRef(new Animated.Value(1)).current;
  const rejectBounce = useRef(new Animated.Value(1)).current;
  const animateBounce = (anim: Animated.Value) => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }),
    ]).start();
  };

  // Animated progress bar — width % of pour over participantCount.
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!prop) return;
    const pourCount = Object.values(prop.votes).filter((v) => v === 'pour').length;
    const target = participantCount > 0 ? Math.min(1, pourCount / participantCount) : 0;
    Animated.timing(progress, {
      toValue: target,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [prop, participantCount, progress]);

  const subject = prop?.payload.placeName || proposalSubject;
  const reason = prop?.reason;
  const status = prop?.status || 'pending';
  const votes = prop?.votes || {};
  const myVote: CoPlanVote | undefined = votes[voterUserId];
  const pourCount = Object.values(votes).filter((v) => v === 'pour').length;
  const contreCount = Object.values(votes).filter((v) => v === 'contre').length;

  const handleVote = async (vote: CoPlanVote) => {
    if (status !== 'pending' || isVoting) return;
    animateBounce(vote === 'pour' ? approveBounce : rejectBounce);
    setIsVoting(true);
    try {
      await voteOnProposal(draftId, proposalId, voterUserId, vote);
    } catch (err) {
      console.warn('[CoPlanProposalCard] vote failed:', err);
    } finally {
      setIsVoting(false);
    }
  };

  // Body line — describes the proposal action ("Retirer « Café Pinson » du plan").
  const bodyLine = (() => {
    const t = prop?.type || 'remove_place';
    switch (t) {
      case 'remove_place':  return `Retirer « ${subject} » du plan`;
      case 'replace_place': return `Remplacer « ${subject} »`;
      case 'change_meetup': return `Changer la date du rendez-vous`;
      case 'change_title':  return `Renommer le brouillon : « ${prop?.payload.title || subject} »`;
      default:              return subject;
    }
  })();

  // Animated transforms for entry.
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const opacity = enter;

  // Progress bar width — animated as a percentage string for layout.
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'] as any,
  });

  return (
    <Animated.View
      style={[
        styles.cardWrap,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.card}>
        {/* ── Header : "À VOTER" chip + "X propose une modif" + timestamp ── */}
        <View style={styles.header}>
          <View style={[styles.chip, status === 'pending' ? styles.chipPending : styles.chipResolved]}>
            <Text style={[styles.chipText, status === 'pending' ? styles.chipTextPending : styles.chipTextResolved]}>
              {status === 'pending' ? 'À VOTER' : status === 'applied' ? 'ADOPTÉE' : 'REJETÉE'}
            </Text>
          </View>
          <Text style={styles.headerCopy} numberOfLines={1}>
            <Text style={styles.headerActor}>{proposerName}</Text>
            <Text style={styles.headerVerb}> propose une modif</Text>
          </Text>
        </View>

        {/* Hairline divider */}
        <View style={styles.divider} />

        {/* ── Body : the action + optional reasoning ── */}
        <Text style={styles.body}>{bodyLine}</Text>
        {reason ? (
          <Text style={styles.reason} numberOfLines={3}>
            {reason}
          </Text>
        ) : null}

        {/* ── Progress bar + N/M ── */}
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.progressLabel}>
            {pourCount} / {participantCount} pour
          </Text>
        </View>

        {/* ── Vote breakdown : "X pour · Y contre · Z n'ont pas voté" ── */}
        {status === 'pending' && (
          <Text style={styles.breakdown}>
            {formatVoteBreakdown(participantCount, pourCount, contreCount)}
          </Text>
        )}

        {/* ── Contextual hint — fun, warmer, makes the math obvious ── */}
        {status === 'pending' && (() => {
          const hint = getProposalHint(participantCount, pourCount, contreCount);
          if (!hint) return null;
          return (
            <View style={[styles.hintRow, hint.urgent && styles.hintRowUrgent]}>
              <Ionicons
                name={hint.urgent ? 'flame' : 'information-circle-outline'}
                size={13}
                color={hint.urgent ? Colors.primary : Colors.textTertiary}
              />
              <Text
                style={[
                  styles.hintText,
                  hint.urgent && styles.hintTextUrgent,
                ]}
                numberOfLines={1}
              >
                {hint.text}
              </Text>
            </View>
          );
        })()}

        {/* ── Actions : Rejeter (outlined) + Approuver (terracotta) ── */}
        {status === 'pending' && !isProposer && (
          <View style={styles.actions}>
            <Animated.View style={[{ flex: 1 }, { transform: [{ scale: rejectBounce }] }]}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleVote('contre')}
                disabled={isVoting}
                style={[
                  styles.btnReject,
                  myVote === 'contre' && styles.btnRejectActive,
                ]}
              >
                <Text style={[
                  styles.btnRejectText,
                  myVote === 'contre' && styles.btnRejectTextActive,
                ]}>
                  Rejeter
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={[{ flex: 1 }, { transform: [{ scale: approveBounce }] }]}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleVote('pour')}
                disabled={isVoting}
                style={[
                  styles.btnApprove,
                  myVote === 'pour' && styles.btnApproveActive,
                ]}
              >
                <Text style={styles.btnApproveText}>Approuver</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {status === 'pending' && isProposer && (
          <Text style={styles.proposerHint}>
            Tu es l{'\u2019'}auteur — ton {'"'}pour{'"'} est automatique.
          </Text>
        )}

        {status !== 'pending' && (
          <View style={styles.tally}>
            <Text style={styles.tallyText}>
              {pourCount} pour · {contreCount} contre
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════════════════
// Copy helpers — vote breakdown + contextual hint
// ══════════════════════════════════════════════════════════════

/** Human-readable vote breakdown line ("2 pour · 1 contre · 1 n'a pas
 *  voté"). Skips empty buckets to stay terse. */
function formatVoteBreakdown(participants: number, pour: number, contre: number): string {
  const undecided = Math.max(0, participants - pour - contre);
  const parts: string[] = [];
  parts.push(`${pour} pour`);
  if (contre > 0) parts.push(`${contre} contre`);
  if (undecided > 0) {
    parts.push(undecided === 1 ? '1 n\'a pas voté' : `${undecided} n\'ont pas voté`);
  }
  return parts.join('  ·  ');
}

/** Contextual hint message — drives anticipation as the threshold
 *  approaches. Returns null when nothing useful to say. The `urgent`
 *  flag triggers a warmer terracotta tint + flame icon when only one
 *  vote separates from adoption / rejection. */
function getProposalHint(
  participants: number,
  pour: number,
  contre: number,
): { text: string; urgent: boolean } | null {
  if (participants <= 1) return null;
  const adoptThreshold = Math.floor(participants / 2) + 1;
  const remainingForAdopt = adoptThreshold - pour;
  const undecided = Math.max(0, participants - pour - contre);
  const maxPourPossible = pour + undecided;

  // Math is over — should be auto-applied/rejected, but guard anyway.
  if (remainingForAdopt <= 0) return { text: 'Adoptée', urgent: false };
  if (maxPourPossible < adoptThreshold) {
    return { text: 'Majorité plus atteignable — sera rejetée', urgent: true };
  }

  // Warm urgent message when one vote away.
  if (remainingForAdopt === 1) {
    return { text: 'Plus qu\'une voix pour adopter !', urgent: true };
  }
  // Warning if 1 contre away from forcing reject.
  const contreToReject = adoptThreshold - 1; // contre count that makes adoption impossible
  // actually: contre * 2 >= participants → reject. So contreToReject =
  // Math.ceil(participants / 2). One contre away = contre is ceil-1.
  const rejectThreshold = Math.ceil(participants / 2);
  if (rejectThreshold - contre === 1 && remainingForAdopt > 1) {
    return { text: '1 voix de plus contre va rejeter', urgent: true };
  }

  // Mid-stream — informational.
  if (pour === 0) return { text: 'Personne n\'a encore validé', urgent: false };
  return {
    text: remainingForAdopt === 1
      ? 'Plus qu\'une voix pour adopter'
      : `Encore ${remainingForAdopt} voix pour adopter`,
    urgent: false,
  };
}

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  cardWrap: {
    marginHorizontal: 14,
    marginVertical: 6,
  },
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  chipPending: {
    backgroundColor: Colors.terracotta100,
  },
  chipResolved: {
    backgroundColor: Colors.bgTertiary,
  },
  chipText: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.1,
  },
  chipTextPending: {
    color: Colors.primary,
  },
  chipTextResolved: {
    color: Colors.textTertiary,
  },
  headerCopy: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    letterSpacing: -0.05,
  },
  headerActor: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  headerVerb: {
    color: Colors.textSecondary,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderSubtle,
    marginVertical: 12,
  },

  // Body
  body: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.25,
    lineHeight: 21,
  },
  reason: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 18,
    letterSpacing: 0.05,
  },

  // Progress bar
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    marginBottom: 12,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.terracotta100,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    letterSpacing: 0.05,
  },

  // Vote breakdown line — explicit numbers per bucket.
  breakdown: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
    letterSpacing: 0.05,
    marginTop: -4,
    marginBottom: 8,
  },

  // Contextual hint row (with icon) — drives anticipation.
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.bgPrimary,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  hintRowUrgent: {
    backgroundColor: Colors.terracotta50,
  },
  hintText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    letterSpacing: 0.05,
  },
  hintTextUrgent: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  btnReject: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderMedium,
  },
  btnRejectActive: {
    backgroundColor: Colors.bgTertiary,
    borderColor: Colors.textTertiary,
  },
  btnRejectText: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    letterSpacing: -0.1,
  },
  btnRejectTextActive: {
    color: Colors.textPrimary,
  },
  btnApprove: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  btnApproveActive: {
    backgroundColor: Colors.primaryDeep,
  },
  btnApproveText: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },
  proposerHint: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // Final-state tally
  tally: {
    paddingTop: 4,
  },
  tallyText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
