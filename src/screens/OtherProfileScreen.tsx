import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Layout } from '../constants';
import { Avatar, UserBadge, PrimaryButton, SecondaryButton } from '../components';
import { useColors } from '../hooks/useColors';
import { User } from '../types';
import { useAuthStore, useFriendsStore } from '../store';
import { getUserById, getFriendshipStatus, getPendingRequestId } from '../services/friendsService';

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

export const OtherProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const currentUser = useAuthStore(s => s.user);
  const { sendRequest, acceptRequest, declineRequest, removeFriend } = useFriendsStore();

  const [user, setUser] = useState<User | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const C = useColors();
  const [actionLoading, setActionLoading] = useState(false);

  const userId = route.params?.userId;

  useEffect(() => {
    if (!userId || !currentUser) return;
    getUserById(userId).then(setUser);
    getFriendshipStatus(currentUser.id, userId).then(async (status) => {
      setFriendStatus(status);
      if (status === 'pending_received') {
        const reqId = await getPendingRequestId(userId, currentUser.id);
        setPendingRequestId(reqId);
      }
    });
  }, [userId, currentUser]);

  const handleAddFriend = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    try {
      await sendRequest(currentUser.id, userId);
      setFriendStatus('pending_sent');
    } catch (e: any) {
      // Request already exists
    }
    setActionLoading(false);
  };

  const handleAccept = async () => {
    if (!pendingRequestId || !currentUser) return;
    setActionLoading(true);
    await acceptRequest(pendingRequestId, currentUser.id);
    setFriendStatus('friends');
    setActionLoading(false);
  };

  const handleDecline = async () => {
    if (!pendingRequestId || !currentUser) return;
    setActionLoading(true);
    await declineRequest(pendingRequestId, currentUser.id);
    setFriendStatus('none');
    setActionLoading(false);
  };

  const handleRemoveFriend = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    await removeFriend(currentUser.id, userId);
    setFriendStatus('none');
    setActionLoading(false);
  };

  if (!user) return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <Text style={styles.loading}>Chargement...</Text>
    </View>
  );

  const formatCount = (n: number) => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : n.toString();

  const renderFriendButton = () => {
    if (actionLoading) {
      return <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />;
    }
    switch (friendStatus) {
      case 'none':
        return (
          <View style={{ marginTop: 12 }}>
            <PrimaryButton label="Ajouter en ami" onPress={handleAddFriend} small />
          </View>
        );
      case 'pending_sent':
        return (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Demande envoyée</Text>
          </View>
        );
      case 'pending_received':
        return (
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
              <Text style={styles.acceptBtnText}>Accepter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
              <Text style={styles.declineBtnText}>Refuser</Text>
            </TouchableOpacity>
          </View>
        );
      case 'friends':
        return (
          <View style={{ marginTop: 12 }}>
            <SecondaryButton label="Amis" onPress={handleRemoveFriend} />
          </View>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.back, { color: C.black }]} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={[styles.headerTitle, { color: C.black }]}>{user.displayName}</Text>
        <View style={{ width: 30 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Avatar initials={user.initials} bg={user.avatarBg} color={user.avatarColor} size="L" avatarUrl={user.avatarUrl} borderColor={Colors.primary} />
          <Text style={styles.displayName}>{user.displayName}</Text>
          <Text style={styles.username}>@{user.username}</Text>
          <UserBadge type={user.badgeType} />
          {renderFriendButton()}
        </View>
        {user.bio && <Text style={styles.bio}>{user.bio}</Text>}
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statValue}>{user.planCount}</Text><Text style={styles.statLabel}>plans</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={styles.statValue}>{formatCount(user.followersCount)}</Text><Text style={styles.statLabel}>amis</Text></View>
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
  displayName: { fontSize: 19, fontWeight: '800', color: Colors.black, marginTop: 10, marginBottom: 2 },
  username: { fontSize: 13, color: Colors.gray700, marginBottom: 6 },
  bio: { fontSize: 13, color: Colors.gray800, textAlign: 'center', paddingHorizontal: 40, marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, marginHorizontal: Layout.screenPadding },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800', color: Colors.black },
  statLabel: { fontSize: 11, color: Colors.gray700, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  statusBadge: {
    marginTop: 12,
    backgroundColor: Colors.gray200,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusText: { fontSize: 13, color: Colors.gray700, fontWeight: '600' },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  acceptBtn: {
    backgroundColor: Colors.black,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 10,
  },
  acceptBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  declineBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  declineBtnText: { color: Colors.gray700, fontSize: 13, fontWeight: '600' },
});
