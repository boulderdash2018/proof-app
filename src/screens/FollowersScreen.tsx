import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { Avatar, EmptyState } from '../components';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { User } from '../types';
import { getFollowerIds, getUserById } from '../services/friendsService';

export const FollowersScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const C = useColors();
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFollowers = async () => {
      const userId = route.params?.userId;
      if (!userId) { setLoading(false); return; }
      const ids = await getFollowerIds(userId);
      const profiles = await Promise.all(ids.map(id => getUserById(id)));
      setUsers(profiles.filter((u): u is User => u !== null));
      setLoading(false);
    };
    loadFollowers();
  }, []);

  const renderItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: C.borderLight }]}
      onPress={() => navigation.push('OtherProfile', { userId: item.id })}
      activeOpacity={0.7}
    >
      <Avatar initials={item.initials} bg={item.avatarBg} color={item.avatarColor} size="M" avatarUrl={item.avatarUrl} />
      <View style={styles.info}>
        <Text style={[styles.name, { color: C.black }]}>{item.displayName}</Text>
        <Text style={[styles.username, { color: C.gray700 }]}>@{item.username}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.back, { color: C.black }]} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={[styles.headerTitle, { color: C.black }]}>{t.profile_followers}</Text>
        <View style={{ width: 30 }} />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
      ) : (
        <FlatList
          data={users}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="👥" title={t.friend_requests_empty_received} subtitle="" />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  back: { fontSize: 24, fontWeight: '600', width: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  list: { paddingBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700' },
  username: { fontSize: 12, marginTop: 1 },
});
