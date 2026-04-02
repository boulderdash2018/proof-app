import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { Avatar, UserBadge, PrimaryButton, SecondaryButton } from '../components';
import { User } from '../types';
import mockApi from '../services/mockApi';

export const OtherProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [user, setUser] = useState<User | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    mockApi.getUserById(route.params?.userId).then(setUser);
  }, [route.params?.userId]);

  if (!user) return <View style={[styles.container, { paddingTop: insets.top }]}><Text style={styles.loading}>Chargement...</Text></View>;

  const formatCount = (n: number) => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : n.toString();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={styles.headerTitle}>{user.displayName}</Text>
        <View style={{ width: 30 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Avatar initials={user.initials} bg={user.avatarBg} color={user.avatarColor} size="L" borderColor={Colors.primary} />
          <Text style={styles.displayName}>{user.displayName}</Text>
          <UserBadge type={user.badgeType} />
          <View style={{ marginTop: 12 }}>
            {isFollowing ? (
              <SecondaryButton label="Suivi" onPress={() => { setIsFollowing(false); mockApi.unfollowUser(user.id); }} />
            ) : (
              <PrimaryButton label="Suivre" onPress={() => { setIsFollowing(true); mockApi.followUser(user.id); }} small />
            )}
          </View>
        </View>
        {user.bio && <Text style={styles.bio}>{user.bio}</Text>}
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statValue}>{user.planCount}</Text><Text style={styles.statLabel}>plans</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={styles.statValue}>{formatCount(user.followersCount)}</Text><Text style={styles.statLabel}>followers</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={styles.statValue}>{formatCount(user.likesReceived)}</Text><Text style={styles.statLabel}>likes</Text></View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  loading: { textAlign: 'center', marginTop: 40, color: Colors.gray600 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { fontSize: 24, fontWeight: '600', color: Colors.black, width: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { paddingBottom: 30 },
  hero: { alignItems: 'center', paddingVertical: 20 },
  displayName: { fontSize: 19, fontWeight: '800', color: Colors.black, marginTop: 10, marginBottom: 6 },
  bio: { fontSize: 13, color: Colors.gray800, textAlign: 'center', paddingHorizontal: 40, marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, marginHorizontal: Layout.screenPadding },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800', color: Colors.black },
  statLabel: { fontSize: 11, color: Colors.gray700, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
});
