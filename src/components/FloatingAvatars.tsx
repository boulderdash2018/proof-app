import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Plan } from '../types';
import { useSocialProofStore, MinimalUser } from '../store';
import { Avatar } from './Avatar';

type InteractionType = 'proof' | 'save' | 'like';

interface AvatarSlot {
  user: MinimalUser;
  type: InteractionType;
}

interface FloatingAvatarsProps {
  plan: Plan;
  onProfilePress?: (userId: string) => void;
}

const MAX_SLOTS = 3;
const AVATAR_SIZE = 32;

// Triangle positions — bottom-right to top-left diagonal (like Instagram Reels)
// Index 0 = bottom-right (highest priority), 1 = middle, 2 = top-left
const POSITIONS = [
  { bottom: 0, right: 0 },
  { bottom: 22, right: 20 },
  { bottom: 44, right: 40 },
];

export const FloatingAvatars: React.FC<FloatingAvatarsProps> = ({ plan, onProfilePress }) => {
  const followingIds = useSocialProofStore((s) => s.followingIds);
  const getUser = useSocialProofStore((s) => s.getUser);
  const ensureUsers = useSocialProofStore((s) => s.ensureUsers);
  const loaded = useSocialProofStore((s) => s.loaded);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  // Gather all interacting user IDs and ensure their profiles are cached
  const allIds = [
    ...(plan.recreatedByIds || []),
    ...(plan.savedByIds || []),
    ...(plan.likedByIds || []),
  ];
  const uniqueIds = [...new Set(allIds)];

  useEffect(() => {
    if (uniqueIds.length > 0) {
      ensureUsers(uniqueIds);
    }
  }, [uniqueIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return null;

  const followingSet = new Set(followingIds);

  // Sort IDs: friends first, then others
  const sortByFriends = (ids: string[]) => {
    const friends = ids.filter((id) => followingSet.has(id));
    const others = ids.filter((id) => !followingSet.has(id));
    return [...friends, ...others];
  };

  const proofIds = sortByFriends(plan.recreatedByIds || []);
  const saveIds = sortByFriends(plan.savedByIds || []);
  const likeIds = sortByFriends(plan.likedByIds || []);

  // Build slots following strict priority: proof > save > like
  const slots: AvatarSlot[] = [];
  const usedIds = new Set<string>();

  const fillSlots = (ids: string[], type: InteractionType) => {
    for (const id of ids) {
      if (slots.length >= MAX_SLOTS) break;
      if (usedIds.has(id)) continue;
      const user = getUser(id);
      if (!user) continue;
      slots.push({ user, type });
      usedIds.add(id);
    }
  };

  fillSlots(proofIds, 'proof');
  fillSlots(saveIds, 'save');
  fillSlots(likeIds, 'like');

  // Animate in
  useEffect(() => {
    if (slots.length > 0) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }),
      ]).start();
    }
  }, [slots.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (slots.length === 0) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      {/* Render in reverse so index 0 (highest priority) is on top (highest zIndex) */}
      {[...slots].reverse().map((slot, reverseIdx) => {
        const i = slots.length - 1 - reverseIdx;
        const pos = POSITIONS[i];
        return (
          <TouchableOpacity
            key={slot.user.id}
            style={[styles.avatarWrap, { bottom: pos.bottom, right: pos.right, zIndex: MAX_SLOTS - i }]}
            activeOpacity={0.8}
            onPress={() => onProfilePress?.(slot.user.id)}
          >
            <View style={styles.avatarOuter}>
              <Avatar
                initials={slot.user.initials}
                bg={slot.user.avatarBg}
                color={slot.user.avatarColor}
                size="S"
                avatarUrl={slot.user.avatarUrl ?? undefined}
                borderColor="#FFF"
              />
            </View>
            {/* Interaction badge */}
            <View style={[
              styles.badge,
              slot.type === 'proof'
                ? { backgroundColor: '#C8571A' }
                : { backgroundColor: '#1A1410' },
            ]}>
              {slot.type === 'proof' ? (
                <Text style={styles.badgeCheck}>✓</Text>
              ) : slot.type === 'save' ? (
                <Ionicons name="bookmark" size={8} color="#FFF" />
              ) : (
                <Ionicons name="heart" size={8} color="#FFF" />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    width: AVATAR_SIZE + 44,
    height: AVATAR_SIZE + 48,
    zIndex: 10,
  },
  avatarWrap: {
    position: 'absolute',
  },
  avatarOuter: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  badgeCheck: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 10,
  },
});
