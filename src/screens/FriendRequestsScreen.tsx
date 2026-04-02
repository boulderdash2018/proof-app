import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { Avatar, EmptyState } from '../components';
import { useAuthStore, useFriendsStore } from '../store';
import { FriendRequest } from '../types';

type Tab = 'received' | 'sent';

export const FriendRequestsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore(s => s.user);
  const {
    incomingRequests,
    sentRequests,
    isLoading,
    fetchIncomingRequests,
    fetchSentRequests,
    acceptRequest,
    declineRequest,
  } = useFriendsStore();

  const [tab, setTab] = useState<Tab>('received');

  useEffect(() => {
    if (user) {
      fetchIncomingRequests(user.id);
      fetchSentRequests(user.id);
    }
  }, [user]);

  const handleAccept = async (requestId: string) => {
    if (user) await acceptRequest(requestId, user.id);
  };

  const handleDecline = async (requestId: string) => {
    if (user) await declineRequest(requestId, user.id);
  };

  const renderReceivedItem = ({ item }: { item: FriendRequest }) => {
    const sender = item.fromUser;
    if (!sender) return null;
    return (
      <View style={styles.row}>
        <Avatar initials={sender.initials} bg={sender.avatarBg} color={sender.avatarColor} size="M" avatarUrl={sender.avatarUrl} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{sender.displayName}</Text>
          <Text style={styles.rowUsername}>@{sender.username}</Text>
        </View>
        <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(item.id)}>
          <Text style={styles.acceptText}>Accepter</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(item.id)}>
          <Text style={styles.declineText}>Refuser</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSentItem = ({ item }: { item: FriendRequest }) => {
    const recipient = item.toUser;
    if (!recipient) return null;
    return (
      <View style={styles.row}>
        <Avatar initials={recipient.initials} bg={recipient.avatarBg} color={recipient.avatarColor} size="M" avatarUrl={recipient.avatarUrl} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{recipient.displayName}</Text>
          <Text style={styles.rowUsername}>@{recipient.username}</Text>
        </View>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>En attente</Text>
        </View>
      </View>
    );
  };

  const data = tab === 'received' ? incomingRequests : sentRequests;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={styles.headerTitle}>Demandes d'amis</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'received' && styles.tabActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>
            Reçues ({incomingRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'sent' && styles.tabActive]}
          onPress={() => setTab('sent')}
        >
          <Text style={[styles.tabText, tab === 'sent' && styles.tabTextActive]}>
            Envoyées ({sentRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : (
        <FlatList
          data={data}
          renderItem={tab === 'received' ? renderReceivedItem : renderSentItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon={tab === 'received' ? '📬' : '📤'}
              title={tab === 'received' ? 'Aucune demande reçue' : 'Aucune demande envoyée'}
              subtitle={tab === 'received' ? 'Quand quelqu\'un t\'ajoutera, ça apparaîtra ici' : 'Recherche des amis dans Explorer avec @pseudo'}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  back: { fontSize: 24, fontWeight: '600', color: Colors.black, width: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.black,
  },
  tabText: { fontSize: 14, color: Colors.gray700, fontWeight: '500' },
  tabTextActive: { color: Colors.black, fontWeight: '700' },
  list: { padding: Layout.screenPadding },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowName: { fontSize: 14, fontWeight: '700', color: Colors.black },
  rowUsername: { fontSize: 12, color: Colors.gray700, marginTop: 1 },
  acceptBtn: {
    backgroundColor: Colors.black,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },
  acceptText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  declineBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  declineText: { color: Colors.gray700, fontSize: 12, fontWeight: '600' },
  pendingBadge: {
    backgroundColor: Colors.gray200,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pendingText: { fontSize: 12, color: Colors.gray700, fontWeight: '600' },
});
