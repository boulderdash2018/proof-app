import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput as RNTextInput,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts } from '../constants';
import { Avatar, EmptyState, LoadingSkeleton } from '../components';
import { useAuthStore, useFriendsStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { FriendRequest, User } from '../types';
import { searchUsers } from '../services/friendsService';

type Tab = 'search' | 'received' | 'sent';

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

  const C = useColors();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (user) {
      fetchIncomingRequests(user.id);
      fetchSentRequests(user.id);
    }
  }, [user]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2 || !user) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchUsers(searchQuery, user.id);
      setSearchResults(results);
      setIsSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, user]);

  const handleAccept = async (requestId: string) => {
    if (user) await acceptRequest(requestId, user.id);
  };

  const handleDecline = async (requestId: string) => {
    if (user) await declineRequest(requestId, user.id);
  };

  const renderSearchItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: C.borderSubtle }]}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('OtherProfile', { userId: item.id })}
    >
      <Avatar initials={item.initials} bg={item.avatarBg} color={item.avatarColor} size="M" avatarUrl={item.avatarUrl ?? undefined} />
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: C.textPrimary }]}>{item.displayName}</Text>
        <Text style={[styles.rowUsername, { color: C.textSecondary }]}>@{item.username}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderReceivedItem = ({ item }: { item: FriendRequest }) => {
    const sender = item.fromUser;
    if (!sender) return null;
    return (
      <View style={[styles.row, { borderBottomColor: C.borderSubtle }]}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => navigation.navigate('OtherProfile', { userId: sender.id })}>
          <Avatar initials={sender.initials} bg={sender.avatarBg} color={sender.avatarColor} size="M" avatarUrl={sender.avatarUrl ?? undefined} />
          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: C.textPrimary }]}>{sender.displayName}</Text>
            <Text style={[styles.rowUsername, { color: C.textSecondary }]}>@{sender.username}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.acceptBtn, { backgroundColor: C.primary }]} onPress={() => handleAccept(item.id)}>
          <Text style={styles.acceptText}>{t.friend_requests_accept}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.declineBtn, { borderColor: C.borderMedium }]} onPress={() => handleDecline(item.id)}>
          <Text style={[styles.declineText, { color: C.textSecondary }]}>{t.friend_requests_decline}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSentItem = ({ item }: { item: FriendRequest }) => {
    const recipient = item.toUser;
    if (!recipient) return null;
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: C.borderSubtle }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('OtherProfile', { userId: recipient.id })}
      >
        <Avatar initials={recipient.initials} bg={recipient.avatarBg} color={recipient.avatarColor} size="M" avatarUrl={recipient.avatarUrl ?? undefined} />
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: C.textPrimary }]}>{recipient.displayName}</Text>
          <Text style={[styles.rowUsername, { color: C.textSecondary }]}>@{recipient.username}</Text>
        </View>
        <View style={[styles.pendingBadge, { backgroundColor: C.bgTertiary }]}>
          <Text style={[styles.pendingText, { color: C.textSecondary }]}>{t.friend_requests_pending}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSearchContent = () => (
    <>
      <View style={[styles.searchBar, { backgroundColor: C.bgTertiary }]}>
        <Ionicons name="search-outline" size={16} color={C.textTertiary} style={{ marginRight: 8 }} />
        <RNTextInput
          style={[styles.searchInput, { color: C.textPrimary }]}
          placeholder={t.friend_requests_search_placeholder}
          placeholderTextColor={C.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
            <Ionicons name="close-circle" size={18} color={C.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      {isSearching ? (
        <LoadingSkeleton variant="list" />
      ) : (
        <FlatList
          data={searchResults}
          renderItem={renderSearchItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            searchQuery.length >= 2 ? (
              <EmptyState icon="🔍" title={t.friend_requests_search_empty} subtitle={t.friend_requests_search_empty_sub} />
            ) : null
          }
        />
      )}
    </>
  );

  const renderRequestsContent = () => {
    const data = tab === 'received' ? incomingRequests : sentRequests;
    return isLoading ? (
      <LoadingSkeleton variant="list" />
    ) : (
      <FlatList
        data={data}
        renderItem={tab === 'received' ? renderReceivedItem : renderSentItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon={tab === 'received' ? '📬' : '📤'}
            title={tab === 'received' ? t.friend_requests_empty_received : t.friend_requests_empty_sent}
            subtitle={tab === 'received' ? t.friend_requests_empty_received_sub : t.friend_requests_empty_sent_sub}
          />
        }
      />
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.bgPrimary }]}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.borderMedium }]}>
        <Text style={[styles.back, { color: C.textPrimary }]} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>{t.friend_requests_title}</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: C.borderMedium }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'search' && [styles.tabActive, { borderBottomColor: C.primary }]]}
          onPress={() => setTab('search')}
        >
          <Text style={[styles.tabText, { color: C.textTertiary }, tab === 'search' && { color: C.textPrimary, fontFamily: Fonts.displaySemiBold }]}>
            {t.friend_requests_search}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'received' && [styles.tabActive, { borderBottomColor: C.primary }]]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.tabText, { color: C.textTertiary }, tab === 'received' && { color: C.textPrimary, fontFamily: Fonts.displaySemiBold }]}>
            {t.friend_requests_received} ({incomingRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'sent' && [styles.tabActive, { borderBottomColor: C.primary }]]}
          onPress={() => setTab('sent')}
        >
          <Text style={[styles.tabText, { color: C.textTertiary }, tab === 'sent' && { color: C.textPrimary, fontFamily: Fonts.displaySemiBold }]}>
            {t.friend_requests_sent} ({sentRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'search' ? renderSearchContent() : renderRequestsContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  back: { fontSize: 24, fontFamily: Fonts.bodySemiBold, width: 30 },
  headerTitle: { fontSize: 17, fontFamily: Fonts.displaySemiBold },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 13, fontFamily: Fonts.bodyMedium },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: Layout.screenPadding,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: Fonts.body },
  clearBtn: { fontSize: 16, paddingLeft: 8 },
  list: { padding: Layout.screenPadding, paddingTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowName: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  rowUsername: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
  acceptBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },
  acceptText: { color: Colors.textOnAccent, fontSize: 12, fontFamily: Fonts.bodySemiBold },
  declineBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  declineText: { fontSize: 12, fontFamily: Fonts.bodySemiBold },
  pendingBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pendingText: { fontSize: 12, fontFamily: Fonts.bodySemiBold },
});
