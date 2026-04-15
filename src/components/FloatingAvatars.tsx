import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Plan } from '../types';
import { useSocialProofStore, MinimalUser } from '../store';
import { MiniStampIcon } from './MiniStampIcon';

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
const AVATAR_SIZE = 34;
const BORDER_W = 2.5;
const AVATAR_OUTER = AVATAR_SIZE + BORDER_W * 2; // 39px total
const OVERLAP = 10;
const BADGE_SIZE = 14;

export const FloatingAvatars: React.FC<FloatingAvatarsProps> = ({ plan, onProfilePress }) => {
  const followingIds = useSocialProofStore((s) => s.followingIds);
  // Subscribe to userCache OBJECT — re-renders when profiles arrive
  const userCache = useSocialProofStore((s) => s.userCache);
  const ensureUsers = useSocialProofStore((s) => s.ensureUsers);

  // Collect all user IDs who interacted with this plan
  const allIds = [
    ...(plan.recreatedByIds || []),
    ...(plan.savedByIds || []),
    ...(plan.likedByIds || []),
  ];
  const uniqueIds = [...new Set(allIds)];

  // Ensure profiles are fetched and cached
  useEffect(() => {
    if (uniqueIds.length > 0) ensureUsers(uniqueIds);
  }, [uniqueIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort: friends first, then others
  const followingSet = new Set(followingIds);
  const sortByFriends = (ids: string[]) => {
    const friends = ids.filter((id) => followingSet.has(id));
    const others = ids.filter((id) => !followingSet.has(id));
    return [...friends, ...others];
  };

  const proofIds = sortByFriends(plan.recreatedByIds || []);
  const saveIds = sortByFriends(plan.savedByIds || []);
  const likeIds = sortByFriends(plan.likedByIds || []);

  // Fill slots: proof > save > like priority, max 3
  const slots: AvatarSlot[] = [];
  const usedIds = new Set<string>();

  const fillSlots = (ids: string[], type: InteractionType) => {
    for (const id of ids) {
      if (slots.length >= MAX_SLOTS) break;
      if (usedIds.has(id)) continue;
      const user = userCache[id]; // Direct cache access — reactive
      if (!user) continue;
      slots.push({ user, type });
      usedIds.add(id);
    }
  };

  fillSlots(proofIds, 'proof');
  fillSlots(saveIds, 'save');
  fillSlots(likeIds, 'like');

  if (slots.length === 0) return null;

  // Container height: first avatar full + remaining avatars minus overlap
  const containerHeight = AVATAR_OUTER + (slots.length - 1) * (AVATAR_OUTER - OVERLAP);

  return (
    <View style={[styles.container, { height: containerHeight }]}>
      {/* Render lowest priority first → highest priority last = on top in z-order */}
      {[...slots].reverse().map((slot, reverseIdx) => {
        const i = slots.length - 1 - reverseIdx; // original index
        const bottomOffset = i * (AVATAR_OUTER - OVERLAP);

        return (
          <TouchableOpacity
            key={slot.user.id}
            style={[styles.slotWrap, { bottom: bottomOffset, zIndex: i + 1 }]}
            activeOpacity={0.8}
            onPress={() => onProfilePress?.(slot.user.id)}
          >
            {/* Avatar photo */}
            <View style={styles.avatarShadow}>
              <View style={[styles.avatarCircle, { backgroundColor: slot.user.avatarBg }]}>
                {slot.user.avatarUrl ? (
                  <Image source={{ uri: slot.user.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.initials, { color: slot.user.avatarColor }]}>
                    {slot.user.initials}
                  </Text>
                )}
              </View>
            </View>

            {/* Interaction badge */}
            {slot.type === 'proof' ? (
              <View style={styles.proofBadge}>
                <MiniStampIcon type="proof" size={12} />
              </View>
            ) : (
              <View style={styles.badge}>
                <Ionicons
                  name={slot.type === 'save' ? 'bookmark' : 'heart'}
                  size={8}
                  color="#FFF"
                />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 6,
    left: 12,
    width: AVATAR_OUTER + 4, // slight extra for badge overhang
    zIndex: 10,
  },
  slotWrap: {
    position: 'absolute',
    left: 0,
  },
  avatarShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarCircle: {
    width: AVATAR_OUTER,
    height: AVATAR_OUTER,
    borderRadius: AVATAR_OUTER / 2,
    borderWidth: BORDER_W,
    borderColor: '#FFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  initials: {
    fontWeight: '700',
    fontSize: 12,
  },
  proofBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1C1917',
    borderWidth: 1.5,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  badge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: '#1A1410',
    borderWidth: 1.5,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
});
