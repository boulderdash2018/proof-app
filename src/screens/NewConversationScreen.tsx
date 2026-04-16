import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from '../components';
import { useAuthStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { useColors } from '../hooks/useColors';
import { getMutualFollowIds } from '../services/friendsService';
import { ConversationParticipant } from '../services/chatService';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { User } from '../types';

interface FriendItem {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  avatarBg: string;
  avatarColor: string;
  initials: string;
}

export const NewConversationScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const user = useAuthStore((s) => s.user);
  const startChat = useChatStore((s) => s.startChat);

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [filtered, setFiltered] = useState<FriendItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    loadFriends();
  }, [user?.id]);

  const loadFriends = async () => {
    if (!user?.id) return;
    try {
      const mutualIds = await getMutualFollowIds(user.id);
      if (mutualIds.length === 0) {
        setFriends([]);
        setFiltered([]);
        setIsLoading(false);
        return;
      }

      // Fetch user details in batches of 10 (Firestore 'in' limit)
      const allFriends: FriendItem[] = [];
      for (let i = 0; i < mutualIds.length; i += 10) {
        const batch = mutualIds.slice(i, i + 10);
        const q = query(collection(db, 'users'), where(documentId(), 'in', batch));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data() as User;
          allFriends.push({
            id: d.id,
            displayName: data.displayName,
            username: data.username,
            avatarUrl: data.avatarUrl || null,
            avatarBg: data.avatarBg,
            avatarColor: data.avatarColor,
            initials: data.initials,
          });
        });
      }

      allFriends.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setFriends(allFriends);
      setFiltered(allFriends);
    } catch (err) {
      console.warn('[NewConversation] load friends error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(friends);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(friends.filter((f) =>
      f.displayName.toLowerCase().includes(q) || f.username.toLowerCase().includes(q),
    ));
  }, [search, friends]);

  const handleSelect = useCallback(async (friend: FriendItem) => {
    if (!user) return;

    const me: ConversationParticipant = {
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      avatarUrl: user.avatarUrl || null,
      avatarBg: user.avatarBg,
      avatarColor: user.avatarColor,
      initials: user.initials,
    };

    const other: ConversationParticipant = {
      userId: friend.id,
      displayName: friend.displayName,
      username: friend.username,
      avatarUrl: friend.avatarUrl,
      avatarBg: friend.avatarBg,
      avatarColor: friend.avatarColor,
      initials: friend.initials,
    };

    const conversationId = await startChat(me, other);
    navigation.replace('Conversation', { conversationId, otherUser: other });
  }, [user, startChat, navigation]);

  const renderItem = ({ item }: { item: FriendItem }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => handleSelect(item)}>
      <Avatar
        initials={item.initials}
        bg={item.avatarBg}
        color={item.avatarColor}
        size="M"
        avatarUrl={item.avatarUrl || undefined}
      />
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: C.black }]} numberOfLines={1}>{item.displayName}</Text>
        <Text style={[styles.username, { color: C.gray600 }]} numberOfLines={1}>@{item.username}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.black }]}>Nouveau message</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search */}
      <View style={[styles.searchRow, { borderBottomColor: C.borderLight }]}>
        <Ionicons name="search-outline" size={18} color={C.gray600} />
        <TextInput
          style={[styles.searchInput, { color: C.black }]}
          placeholder="Rechercher un ami..."
          placeholderTextColor={C.gray600}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={C.gray600} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: C.gray600 }]}>
                {search ? 'Aucun résultat' : 'Aucun ami mutuel'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.3,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowText: { flex: 1 },
  name: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  username: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: Fonts.body },
});
