import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { fetchPlanDraft, togglePlaceVote } from '../services/planDraftService';

interface Props {
  draftId: string;
  placeId: string;
  /** Current viewer — used to show "voted" state. */
  voterUserId: string;
}

/**
 * Single-tap heart vote chip rendered next to a `coplan_place_added` line
 * in the chat. Voting from the chat IS voting on the workspace — same
 * `place.votes` array.
 *
 * Design (after UX feedback) :
 *   • One element instead of three (Pour / Annuler / count) — much
 *     calmer in the conv stream.
 *   • Heart outline → filled when voted; tap toggles.
 *   • Count shown only when ≥ 2 (1 = just the proposer, no info value).
 *   • Tap-bounce + flash animation; optimistic state.
 */
export const CoPlanInlineVote: React.FC<Props> = ({ draftId, placeId, voterUserId }) => {
  const [voteCount, setVoteCount] = useState<number | null>(null);
  const [myVote, setMyVote] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // One-shot hydrate from the draft. No live listener — optimistic
  // updates handle the local case; other participants' votes refresh
  // on next mount of this row.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await fetchPlanDraft(draftId);
      if (cancelled || !draft) return;
      const place = draft.proposedPlaces.find((p) => p.id === placeId);
      if (!place) {
        // Place was removed since the system event was posted — show as 0.
        setVoteCount(0);
        setMyVote(false);
        return;
      }
      setVoteCount(place.votes.length);
      setMyVote(place.votes.includes(voterUserId));
    })();
    return () => { cancelled = true; };
  }, [draftId, placeId, voterUserId]);

  const tapScale = useRef(new Animated.Value(1)).current;

  const handleTap = async () => {
    if (myVote === null || isLoading) return;
    Animated.sequence([
      Animated.timing(tapScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(tapScale, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }),
    ]).start();

    // Optimistic toggle.
    const wasVoting = myVote;
    setMyVote(!wasVoting);
    setVoteCount((c) => Math.max(0, (c ?? 0) + (wasVoting ? -1 : 1)));
    setIsLoading(true);
    try {
      await togglePlaceVote(draftId, placeId, voterUserId);
    } catch (err) {
      // Revert
      setMyVote(wasVoting);
      setVoteCount((c) => Math.max(0, (c ?? 0) + (wasVoting ? 1 : -1)));
      console.warn('[CoPlanInlineVote] toggle failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const isReady = voteCount !== null && myVote !== null;
  const showCount = (voteCount ?? 0) >= 2;

  return (
    <Animated.View style={{ transform: [{ scale: tapScale }] }}>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={handleTap}
        disabled={!isReady || isLoading}
        style={[
          styles.chip,
          myVote ? styles.chipActive : styles.chipIdle,
          !isReady && styles.chipLoading,
        ]}
        accessibilityRole="button"
        accessibilityLabel={myVote ? "Annuler mon vote" : "Voter pour ce lieu"}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons
          name={myVote ? 'heart' : 'heart-outline'}
          size={14}
          color={myVote ? Colors.textOnAccent : Colors.primary}
        />
        {showCount && (
          <Text style={[styles.count, { color: myVote ? Colors.textOnAccent : Colors.primary }]}>
            {voteCount}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth + 0.3,
    minWidth: 36,
    justifyContent: 'center',
  },
  chipIdle: {
    backgroundColor: Colors.bgSecondary,
    borderColor: Colors.terracotta200,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipLoading: {
    opacity: 0.5,
  },
  count: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: -0.05,
  },
});
