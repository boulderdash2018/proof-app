import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, Text, TouchableOpacity, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { fetchPlanDraft, togglePlaceVote } from '../services/planDraftService';

interface Props {
  draftId: string;
  placeId: string;
  /** The user who is voting — usually the current user. */
  voterUserId: string;
}

/**
 * Inline pour/contre control rendered ON a `coplan_place_added` system
 * event in the chat. Tapping a button toggles the vote on the actual
 * draft place — so voting from the chat IS voting on the workspace.
 *
 * To avoid subscribing to the entire draft from inside the conv (heavy),
 * we do a one-shot fetch on mount to seed the vote count + my-vote
 * state, then update OPTIMISTICALLY on tap. Other participants' votes
 * land on the next mount or via a fresh re-render — good enough for an
 * MVP and far cheaper than a per-message live listener.
 *
 * Animations:
 *   • Tap → fast bounce on the pressed button (scale 1 → 0.92 → 1)
 *   • Vote count chip slides in/out when transitioning between
 *     "no votes" and "1+ votes" states
 *   • Soft confirm flash — the button briefly tints behind itself
 */
export const CoPlanInlineVote: React.FC<Props> = ({ draftId, placeId, voterUserId }) => {
  const [voteCount, setVoteCount] = useState<number | null>(null);
  const [myVote, setMyVote] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // One-shot hydrate. We don't need to refetch on draft updates —
  // optimistic state is enough for this MVP.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await fetchPlanDraft(draftId);
      if (cancelled || !draft) return;
      const place = draft.proposedPlaces.find((p) => p.id === placeId);
      if (!place) {
        // Place was removed since the system event was posted.
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
  const flash = useRef(new Animated.Value(0)).current;

  const animateTap = () => {
    Animated.sequence([
      Animated.timing(tapScale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(tapScale, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  };

  const handlePour = async () => {
    if (myVote === null || isLoading) return;
    if (myVote) return; // Already voted — UX choice: tap "contre" to undo
    animateTap();
    // Optimistic
    setMyVote(true);
    setVoteCount((c) => (c ?? 0) + 1);
    setIsLoading(true);
    try {
      await togglePlaceVote(draftId, placeId, voterUserId);
    } catch (err) {
      // Revert
      setMyVote(false);
      setVoteCount((c) => Math.max(0, (c ?? 0) - 1));
      console.warn('[CoPlanInlineVote] vote failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContre = async () => {
    if (myVote === null || isLoading) return;
    if (!myVote) return; // Not voted yet — "Contre" toggles a YES off
    animateTap();
    setMyVote(false);
    setVoteCount((c) => Math.max(0, (c ?? 0) - 1));
    setIsLoading(true);
    try {
      await togglePlaceVote(draftId, placeId, voterUserId);
    } catch (err) {
      setMyVote(true);
      setVoteCount((c) => (c ?? 0) + 1);
      console.warn('[CoPlanInlineVote] unvote failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const flashOpacity = flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] });

  return (
    <View style={styles.row}>
      {/* POUR button — primary terracotta when active */}
      <Animated.View style={{ transform: [{ scale: myVote ? tapScale : 1 }] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handlePour}
          disabled={voteCount === null || isLoading}
          style={[
            styles.btn,
            myVote === true ? styles.btnPourActive : styles.btnPourIdle,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Voter pour ce lieu"
        >
          <Animated.View style={[styles.flashLayer, { opacity: flashOpacity }]} />
          <Ionicons
            name={myVote === true ? 'heart' : 'heart-outline'}
            size={14}
            color={myVote === true ? Colors.textOnAccent : Colors.primary}
          />
          <Text style={[styles.btnText, myVote === true ? styles.btnTextActive : styles.btnTextIdle]}>
            Pour
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* CONTRE button — outline gray, only meaningful as "undo my pour" */}
      <Animated.View style={{ transform: [{ scale: myVote === false ? tapScale : 1 }] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleContre}
          disabled={voteCount === null || isLoading || !myVote}
          style={[
            styles.btn,
            styles.btnContre,
            !myVote && styles.btnContreDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Annuler mon vote"
        >
          <Ionicons
            name="close"
            size={14}
            color={myVote ? Colors.textSecondary : Colors.gray400}
          />
          <Text style={[styles.btnText, { color: myVote ? Colors.textSecondary : Colors.gray400 }]}>
            Annuler
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Vote count chip — soft fade-in once we have a number */}
      {voteCount !== null && voteCount > 0 && (
        <View style={styles.countChip}>
          <Text style={styles.countChipText}>
            {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
          </Text>
        </View>
      )}
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth + 0.3,
    overflow: 'hidden',
    position: 'relative',
  },
  btnPourIdle: {
    backgroundColor: Colors.bgSecondary,
    borderColor: Colors.terracotta200,
  },
  btnPourActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  btnContre: {
    backgroundColor: 'transparent',
    borderColor: Colors.borderSubtle,
  },
  btnContreDisabled: {
    opacity: 0.5,
  },
  flashLayer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.primary,
  },
  btnText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: -0.05,
  },
  btnTextIdle: {
    color: Colors.primary,
  },
  btnTextActive: {
    color: Colors.textOnAccent,
  },
  countChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
  },
  countChipText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodyBold,
    color: Colors.primary,
    letterSpacing: 0.2,
  },
});
