import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Plan } from '../types';
import { useSocialProofStore, MinimalUser } from '../store';
import { Avatar } from './Avatar';

interface Props {
  plan: Plan;
}

type ActivityLevel = 'recreated' | 'saved' | 'liked';

export const FriendActivity: React.FC<Props> = ({ plan }) => {
  const followingIds = useSocialProofStore((s) => s.followingIds);
  const getUser = useSocialProofStore((s) => s.getUser);
  const loaded = useSocialProofStore((s) => s.loaded);

  if (!loaded || followingIds.length === 0) return null;

  const followingSet = new Set(followingIds);

  const recreatedFriends = (plan.recreatedByIds || []).filter((id) => followingSet.has(id));
  const savedFriends = (plan.savedByIds || []).filter((id) => followingSet.has(id));
  const likedFriends = (plan.likedByIds || []).filter((id) => followingSet.has(id));

  let friendIds: string[];
  let level: ActivityLevel;

  if (recreatedFriends.length > 0) {
    friendIds = recreatedFriends;
    level = 'recreated';
  } else if (savedFriends.length > 0) {
    friendIds = savedFriends;
    level = 'saved';
  } else if (likedFriends.length > 0) {
    friendIds = likedFriends;
    level = 'liked';
  } else {
    return null;
  }

  const users: MinimalUser[] = friendIds
    .map((id) => getUser(id))
    .filter(Boolean) as MinimalUser[];

  if (users.length === 0) return null;

  const firstName = (u: MinimalUser) => u.displayName.split(' ')[0];
  const count = friendIds.length;
  const avatarUsers = users.slice(0, 3);

  const actionStyle =
    level === 'recreated'
      ? { fontWeight: '600' as const, color: '#C8571A' }
      : level === 'saved'
      ? { fontWeight: '600' as const, color: '#6B6058' }
      : { fontWeight: '400' as const, color: '#8A8078' };

  const actionWord =
    level === 'recreated' ? 'recreated this' : level === 'saved' ? 'saved this' : 'liked this';

  let nameText: string;
  if (count === 1) {
    nameText = firstName(users[0]);
  } else if (count === 2 && users.length >= 2) {
    nameText = `${firstName(users[0])} and ${firstName(users[1])}`;
  } else {
    nameText = `${firstName(users[0])} and ${count - 1} other${count - 1 > 1 ? 's' : ''}`;
  }

  return (
    <View style={s.container}>
      <View style={s.avatars}>
        {avatarUsers.map((u, i) => (
          <View key={u.id} style={i > 0 ? { marginLeft: -4 } : undefined}>
            <Avatar
              initials={u.initials}
              bg={u.avatarBg}
              color={u.avatarColor}
              size="XS"
              avatarUrl={u.avatarUrl ?? undefined}
            />
          </View>
        ))}
      </View>
      <Text style={s.text} numberOfLines={1}>
        <Text style={s.name}>{nameText}</Text>
        {' '}
        <Text style={actionStyle}>{actionWord}</Text>
      </Text>
    </View>
  );
};

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    gap: 6,
  },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, fontSize: 11, fontWeight: '500', color: '#8A8078' },
  name: { fontWeight: '600', color: '#6B6058' },
});
