import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { Avatar, UserBadge } from '../components';
import { User } from '../types';
import mockApi from '../services/mockApi';

export const FollowingScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    mockApi.getFollowing(route.params?.userId).then(setUsers);
  }, []);

  const renderItem = ({ item }: { item: User }) => (
    <TouchableOpacity style={styles.row} onPress={() => navigation.push('OtherProfile', { userId: item.id })} activeOpacity={0.7}>
      <Avatar initials={item.initials} bg={item.avatarBg} color={item.avatarColor} size="M" />
      <View style={styles.info}>
        <Text style={styles.name}>{item.displayName}</Text>
        <UserBadge type={item.badgeType} small />
      </View>
      <TouchableOpacity style={styles.followingBtn}><Text style={styles.followingText}>Suivi</Text></TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={styles.headerTitle}>Abonnements</Text>
        <View style={{ width: 30 }} />
      </View>
      <FlatList data={users} renderItem={renderItem} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { fontSize: 24, fontWeight: '600', color: Colors.black, width: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  list: { paddingBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: 10 },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '700', color: Colors.black },
  followingBtn: { backgroundColor: Colors.black, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  followingText: { fontSize: 12, fontWeight: '600', color: Colors.white },
});
