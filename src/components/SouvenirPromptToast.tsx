import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text, TouchableOpacity, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { ConversationParticipant } from '../services/chatService';
import { SouvenirPrompt } from '../hooks/useSouvenirPrompts';

interface Props {
  prompt: SouvenirPrompt | null;
  /** Other participants — used to render the avatar mosaic on the toast. */
  participants: ConversationParticipant[];
  /** Tap "Photo" — caller wires to image picker / camera. */
  onTakePhoto: () => void;
  /** Tap × or background → dismiss. */
  onDismiss: () => void;
}

/**
 * Bottom-anchored "Souvenir à plusieurs" toast that appears at session
 * trigger points (arrived, mid-checkpoint, about to leave). Different
 * from the solo Do It Now's "note this place" cue — this one is
 * explicitly social : avatar mosaic of the others + warm copy that
 * rotates each time.
 *
 * Behavior :
 *   • Slides up + spring on mount, slides down on dismiss.
 *   • Auto-dismiss handled by the parent hook (~9s).
 *   • Tap "Photo" → opens picker (caller's responsibility) ; the toast
 *     stays in place during the picker so we don't lose context.
 *   • Tap "Plus tard" → dismiss without action ; same trigger key
 *     won't re-fire (deduped in the hook).
 */
export const SouvenirPromptToast: React.FC<Props> = ({
  prompt, participants, onTakePhoto, onDismiss,
}) => {
  const insets = useSafeAreaInsets();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!prompt) {
      Animated.timing(enter, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.spring(enter, {
      toValue: 1,
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [prompt, enter]);

  // We don't early-return when prompt is null — the exit animation needs
  // to play. The wrapper's pointerEvents drops to 'none' so taps pass
  // through to the screen behind.
  if (!prompt) {
    // Reset to fully closed once dismissed (no anim once null is set,
    // since enter is already settling toward 0 from the effect above).
  }

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const opacity = enter;

  // Show up to 4 avatar dots, +N badge for the rest.
  const visibleAvatars = participants.slice(0, 4);
  const overflow = Math.max(0, participants.length - visibleAvatars.length);

  return (
    <Animated.View
      pointerEvents={prompt ? 'auto' : 'none'}
      style={[
        styles.wrap,
        { bottom: insets.bottom + 16, opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.card}>
        {/* Avatar mosaic — visual cue that this is a SOCIAL prompt */}
        <View style={styles.avatars}>
          {visibleAvatars.map((p, idx) => (
            <View
              key={p.userId}
              style={[
                styles.avatarSlot,
                { marginLeft: idx === 0 ? 0 : -10, zIndex: visibleAvatars.length - idx },
              ]}
            >
              <Avatar
                initials={p.initials}
                bg={p.avatarBg}
                color={p.avatarColor}
                size="S"
                avatarUrl={p.avatarUrl ?? undefined}
              />
            </View>
          ))}
          {overflow > 0 && (
            <View style={[styles.avatarOverflow, { marginLeft: -10 }]}>
              <Text style={styles.avatarOverflowText}>+{overflow}</Text>
            </View>
          )}
        </View>

        {/* Body */}
        <View style={styles.body}>
          <Text style={styles.eyebrow}>SOUVENIR À PLUSIEURS</Text>
          <Text style={styles.copy} numberOfLines={2}>
            {prompt?.copy || ''}
          </Text>
        </View>

        {/* Actions : Plus tard (ghost) + Photo (terracotta CTA) */}
        <View style={styles.actions}>
          <Pressable onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.dismiss}>Plus tard</Text>
          </Pressable>
          <TouchableOpacity
            style={styles.photoBtn}
            onPress={onTakePhoto}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Prendre une photo souvenir"
          >
            <Ionicons name="camera" size={16} color={Colors.textOnAccent} />
            <Text style={styles.photoBtnText}>Photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 60,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarSlot: {
    borderWidth: 2,
    borderColor: Colors.bgSecondary,
    borderRadius: 99,
  },
  avatarOverflow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bgTertiary,
    borderWidth: 2,
    borderColor: Colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverflowText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodyBold,
    color: Colors.textSecondary,
    letterSpacing: 0.1,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  copy: {
    fontSize: 13.5,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.15,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dismiss: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
    letterSpacing: 0.05,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  photoBtnText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.05,
  },
});
