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
  /** Required for the "vs N participants" line. Pulled from the conv. */
  participantCount: number;
  /** First name of the proposer — for the title. */
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
 * States :
 *   • pending  → "🛠 NOUVELLE PROPOSITION" + Pour/Contre buttons (live count)
 *   • applied  → "✓ PROPOSITION ADOPTÉE" — green tint, no vote buttons
 *   • rejected → "✕ PROPOSITION REJETÉE" — gray tint, no vote buttons
 *
 * Animations :
 *   • Card slide-in on mount (FadeInUp-like with translate + opacity).
 *   • Vote button tap-bounce.
 *   • State transition (pending → applied/rejected) pulses the card
 *     border once to draw the eye.
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
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  // Border pulse when status transitions from pending to a final state.
  const statusFlash = useRef(new Animated.Value(0)).current;
  const lastStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!prop) return;
    if (prop.status !== 'pending' && lastStatus.current === 'pending') {
      Animated.sequence([
        Animated.timing(statusFlash, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(statusFlash, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]).start();
    }
    lastStatus.current = prop.status;
  }, [prop?.status, statusFlash]);

  // Tap-bounce per button.
  const pourBounce = useRef(new Animated.Value(1)).current;
  const contreBounce = useRef(new Animated.Value(1)).current;
  const animateBounce = (anim: Animated.Value) => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }),
    ]).start();
  };

  // Loading shell while the live snap arrives.
  const subject = prop?.payload.placeName || proposalSubject;
  const status = prop?.status || 'pending';
  const votes = prop?.votes || {};
  const myVote: CoPlanVote | undefined = votes[voterUserId];
  const pourCount = Object.values(votes).filter((v) => v === 'pour').length;
  const contreCount = Object.values(votes).filter((v) => v === 'contre').length;
  const undecidedCount = Math.max(0, participantCount - pourCount - contreCount);

  const handleVote = async (vote: CoPlanVote) => {
    if (status !== 'pending' || isVoting) return;
    animateBounce(vote === 'pour' ? pourBounce : contreBounce);
    setIsVoting(true);
    try {
      await voteOnProposal(draftId, proposalId, voterUserId, vote);
    } catch (err) {
      console.warn('[CoPlanProposalCard] vote failed:', err);
    } finally {
      setIsVoting(false);
    }
  };

  // Compute card variant tokens.
  const variant: 'pending' | 'applied' | 'rejected' = status as any;
  const variantStyles = (() => {
    switch (variant) {
      case 'applied':
        return {
          card: styles.cardApplied,
          eyebrow: 'PROPOSITION ADOPTÉE',
          eyebrowColor: Colors.success,
          icon: 'checkmark-circle' as const,
          iconColor: Colors.success,
        };
      case 'rejected':
        return {
          card: styles.cardRejected,
          eyebrow: 'PROPOSITION REJETÉE',
          eyebrowColor: Colors.textTertiary,
          icon: 'close-circle' as const,
          iconColor: Colors.textTertiary,
        };
      default:
        return {
          card: styles.cardPending,
          eyebrow: `NOUVELLE PROPOSITION DE ${proposerName.toUpperCase()}`,
          eyebrowColor: Colors.primary,
          icon: 'construct' as const,
          iconColor: Colors.primary,
        };
    }
  })();

  // Body line — describes the proposal action ("Retirer Café Pinson").
  const bodyLine = (() => {
    const t = prop?.type || 'remove_place';
    switch (t) {
      case 'remove_place':  return `Retirer ${subject}`;
      case 'replace_place': return `Remplacer ${subject}`;
      case 'change_meetup': return `Changer la date du rendez-vous`;
      case 'change_title':  return `Renommer le brouillon : « ${prop?.payload.title || subject} »`;
      default:              return subject;
    }
  })();

  // Animated entry transform.
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const opacity = enter;

  // Border flash animated value → interpolated to border color.
  const borderColor = statusFlash.interpolate({
    inputRange: [0, 1],
    outputRange: [
      variant === 'applied' ? Colors.success : variant === 'rejected' ? Colors.borderSubtle : Colors.terracotta200,
      Colors.primary,
    ],
  });

  return (
    <Animated.View
      style={[
        styles.cardWrap,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Animated.View
        style={[
          styles.card,
          variantStyles.card,
          { borderColor },
        ]}
      >
        {/* Header — icon + eyebrow */}
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: variantStyles.iconColor + '18' }]}>
            <Ionicons name={variantStyles.icon} size={16} color={variantStyles.iconColor} />
          </View>
          <Text style={[styles.eyebrow, { color: variantStyles.eyebrowColor }]} numberOfLines={1}>
            {variantStyles.eyebrow}
          </Text>
        </View>

        {/* Body — the proposal action */}
        <Text style={styles.body}>{bodyLine}</Text>

        {variant === 'pending' ? (
          <>
            {/* Vote row — hidden for the proposer (they auto-pour) */}
            {!isProposer && (
              <View style={styles.voteRow}>
                <Animated.View style={{ transform: [{ scale: pourBounce }] }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleVote('pour')}
                    disabled={isVoting}
                    style={[
                      styles.voteBtn,
                      myVote === 'pour' ? styles.votePourActive : styles.votePourIdle,
                    ]}
                  >
                    <Ionicons
                      name={myVote === 'pour' ? 'checkmark-circle' : 'checkmark-circle-outline'}
                      size={15}
                      color={myVote === 'pour' ? Colors.textOnAccent : Colors.primary}
                    />
                    <Text style={[
                      styles.voteBtnText,
                      { color: myVote === 'pour' ? Colors.textOnAccent : Colors.primary },
                    ]}>
                      Pour {pourCount > 0 ? pourCount : ''}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>

                <Animated.View style={{ transform: [{ scale: contreBounce }] }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleVote('contre')}
                    disabled={isVoting}
                    style={[
                      styles.voteBtn,
                      myVote === 'contre' ? styles.voteContreActive : styles.voteContreIdle,
                    ]}
                  >
                    <Ionicons
                      name={myVote === 'contre' ? 'close-circle' : 'close-circle-outline'}
                      size={15}
                      color={myVote === 'contre' ? Colors.textOnAccent : Colors.textSecondary}
                    />
                    <Text style={[
                      styles.voteBtnText,
                      { color: myVote === 'contre' ? Colors.textOnAccent : Colors.textSecondary },
                    ]}>
                      Contre {contreCount > 0 ? contreCount : ''}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )}

            {isProposer && (
              <Text style={styles.proposerHint}>
                Tu es le proposeur — ton "pour" est automatique.
              </Text>
            )}

            {/* Footer — undecided count + threshold info */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {undecidedCount > 0
                  ? `${undecidedCount} ${undecidedCount === 1 ? 'personne n\'a' : 'personnes n\'ont'} pas voté`
                  : 'Tout le monde a voté'}
              </Text>
              <View style={styles.footerSep} />
              <Text style={styles.footerText}>Adoptée si majorité pour</Text>
            </View>
          </>
        ) : (
          // Final state — small recap of the vote tally.
          <View style={styles.tally}>
            <Text style={styles.tallyText}>
              {pourCount} pour · {contreCount} contre
            </Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  cardWrap: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    backgroundColor: Colors.bgSecondary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  cardPending: {
    backgroundColor: Colors.terracotta50,
  },
  cardApplied: {
    backgroundColor: 'rgba(123,153,113,0.08)', // success tint
  },
  cardRejected: {
    backgroundColor: Colors.bgTertiary,
    opacity: 0.8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    flex: 1,
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.1,
  },
  body: {
    fontSize: 15,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 12,
    lineHeight: 20,
  },
  voteRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  voteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth + 0.3,
  },
  votePourIdle: {
    backgroundColor: Colors.bgSecondary,
    borderColor: Colors.terracotta200,
  },
  votePourActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  voteContreIdle: {
    backgroundColor: 'transparent',
    borderColor: Colors.borderSubtle,
  },
  voteContreActive: {
    backgroundColor: Colors.textTertiary,
    borderColor: Colors.textTertiary,
  },
  voteBtnText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: -0.05,
  },
  proposerHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  footerText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
  footerSep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
    opacity: 0.4,
  },
  tally: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  tallyText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },
});
