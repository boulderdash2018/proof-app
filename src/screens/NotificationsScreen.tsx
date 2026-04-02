import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { Avatar, EmptyState } from '../components';
import { useNotifStore } from '../store';
import { Notification } from '../types';

const NOTIF_ICONS: Record<string, string> = {
  like: '❤️', follow: '👤', comment: '💬', xp_gained: '⭐', badge_unlocked: '🏆',
};

export const NotificationsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { notifications, fetchNotifications, markAllRead, markRead } = useNotifStore();

  useEffect(() => { fetchNotifications(); }, []);

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notifRow, !item.isRead && styles.notifUnread]}
      onPress={() => markRead(item.id)}
      activeOpacity={0.7}
    >
      {item.fromUser ? (
        <Avatar initials={item.fromUser.initials} bg={item.fromUser.avatarBg} color={item.fromUser.avatarColor} size="S" />
      ) : (
        <View style={styles.iconCircle}><Text style={styles.notifIcon}>{NOTIF_ICONS[item.type]}</Text></View>
      )}
      <View style={styles.notifContent}>
        <Text style={styles.notifMessage}>{item.message}</Text>
        {item.planTitle && <Text style={styles.notifPlan}>{item.planTitle}</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={markAllRead}><Text style={styles.markAll}>Tout lire</Text></TouchableOpacity>
      </View>
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState icon="🔔" title="Aucune notification" subtitle="Les interactions s'afficheront ici." />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { fontSize: 24, fontWeight: '600', color: Colors.black },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  markAll: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  list: { paddingBottom: 20 },
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Layout.screenPadding, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: 12 },
  notifUnread: { backgroundColor: '#FFF8F5' },
  iconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.gray200, alignItems: 'center', justifyContent: 'center' },
  notifIcon: { fontSize: 14 },
  notifContent: { flex: 1 },
  notifMessage: { fontSize: 13, color: Colors.black, lineHeight: 18 },
  notifPlan: { fontSize: 11, color: Colors.gray700, marginTop: 2 },
});
