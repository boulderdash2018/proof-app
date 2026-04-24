import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useCoPlanStore, CoPlanActivityEvent, CoPlanActivityKind } from '../store/coPlanStore';

/**
 * Live "signaux de vie" — small toast stack anchored bottom-LEFT of the
 * workspace (the chat bubble owns bottom-right). Each entry surfaces
 * a single action taken by another participant, so the doc feels alive
 * even before the chat thread takes over.
 *
 * Events come from `coPlanStore.recentActivity` (computed via snapshot
 * diffs in observeDraft). Auto-prune is handled in the store; this
 * component only renders + animates entries in/out.
 */
export const CoPlanActivityToasts: React.FC = () => {
  const insets = useSafeAreaInsets();
  const events = useCoPlanStore((s) => s.recentActivity);
  const dismiss = useCoPlanStore((s) => s.dismissActivity);

  // Show at most 3 stacked, newest on top.
  const visible = events.slice(0, 3);

  if (visible.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 18 }]}
    >
      {visible.map((evt, idx) => (
        <ActivityToast
          key={evt.id}
          event={evt}
          stackIdx={idx}
          onDismiss={() => dismiss(evt.id)}
        />
      ))}
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Single toast — owns its own enter/exit animation.
// ══════════════════════════════════════════════════════════════

const ActivityToast: React.FC<{
  event: CoPlanActivityEvent;
  stackIdx: number;
  onDismiss: () => void;
}> = ({ event, stackIdx, onDismiss }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  // Older toasts peek above newer ones via a small upward stack offset, and
  // fade slightly so the eye lands on the freshest one.
  const stackOffset = -stackIdx * 6;
  const stackFadeMax = 1 - stackIdx * 0.18;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, stackOffset], // start below, settle at the stack offset
  });
  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, stackFadeMax],
  });
  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <Pressable
        onPress={onDismiss}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`${event.actorName} — ${labelFor(event.kind)}`}
      >
        <Avatar
          initials={event.actorInitials}
          bg={event.actorAvatarBg}
          color={event.actorAvatarColor}
          size="XS"
          avatarUrl={event.actorAvatarUrl ?? undefined}
        />
        <View style={styles.iconBadge}>
          <Ionicons name={iconFor(event.kind)} size={10} color={Colors.textOnAccent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.text} numberOfLines={1}>
            <Text style={styles.actor}>{event.actorName}</Text>
            <Text style={styles.verb}> {labelFor(event.kind)} </Text>
            <Text style={styles.detail}>{event.detail}</Text>
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════════════════
// Copy + icon helpers
// ══════════════════════════════════════════════════════════════

function labelFor(kind: CoPlanActivityKind): string {
  switch (kind) {
    case 'place_added':       return 'a ajouté';
    case 'place_removed':     return 'a retiré';
    case 'vote_added':        return 'a voté pour';
    case 'availability_added': return 'a ajouté';
  }
}

function iconFor(kind: CoPlanActivityKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'place_added':       return 'add';
    case 'place_removed':     return 'close';
    case 'vote_added':        return 'heart';
    case 'availability_added': return 'calendar';
  }
}

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    // Reserve room so the stack doesn't run under the chat bubble (right side).
    right: 90,
    zIndex: 40,
    gap: 6,
  },
  toast: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Tiny terracotta circle pinned to the avatar's bottom-right via negative
  // margins — visually identifies the action kind without taking real estate.
  iconBadge: {
    position: 'absolute',
    left: 16,
    top: 14,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.bgSecondary,
  },
  text: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    lineHeight: 16,
  },
  actor: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  verb: {
    color: Colors.textSecondary,
  },
  detail: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
});
