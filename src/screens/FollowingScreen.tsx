import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Layout, Fonts } from '../constants';
import { Avatar, EmptyState, LoadingSkeleton } from '../components';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { User } from '../types';
import { getFollowingIds, getUserById } from '../services/friendsService';

export const FollowingScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const C = useColors();
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFollowing = async () => {
      const userId = route.params?.userId;
      if (!userId) { setLoading(false); return; }
      const ids = await getFollowingIds(userId);
      const profiles = await Promise.all(ids.map(id => getUserById(id)));
      setUsers(profiles.filter((u): u is User => u !== null));
      setLoading(false);
    };
    loadFollowing();
  }, []);

  const renderItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: C.borderSubtle }]}
      onPress={() => navigation.push('OtherProfile', { userId: item.id })}
      activeOpacity={0.7}
    >
      <Avatar initials={item.initials} bg={item.avatarBg} color={item.avatarColor} size="M" avatarUrl={item.avatarUrl ?? undefined} />
      <View style={styles.info}>
        <Text style={[styles.name, { color: C.textPrimary }]}>{item.displayName}</Text>
        <Text style={[styles.username, { color: C.textSecondary }]}>@{item.username}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.bgPrimary }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { borderBottomColor: C.borderMedium }]}>
        <Text style={[styles.back, { color: C.textPrimary }]} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>{t.profile_following}</Text>
        <View style={{ width: 30 }} />
      </View>
      {loading ? (
        <LoadingSkeleton variant="list" />
      ) : (
        <FlatList
          data={users}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="👥" title={t.friend_requests_empty_sent} subtitle="" />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  back: { fontSize: 24, fontFamily: Fonts.bodySemiBold, width: 30 },
  headerTitle: { fontSize: 17, fontFamily: Fonts.displaySemiBold },
  list: { paddingBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  info: { flex: 1 },
  name: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  username: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
});
