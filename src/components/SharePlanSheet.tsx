import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, TouchableWithoutFeedback, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { useColors } from '../hooks/useColors';
import { getMutualFollowIds } from '../services/friendsService';
import { ConversationParticipant, getOrCreateConversation, sendPlanMessage } from '../services/chatService';
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

interface SharePlanSheetProps {
  visible: boolean;
  onClose: () => void;
  planId: string;
  planTitle: string;
  planCover?: string;
  planAuthorName: string;
}

export const SharePlanSheet: React.FC<SharePlanSheetProps> = ({
  visible, onClose, planId, planTitle, planCover, planAuthorName,
}) => {
  const C = useColors();
  const user = useAuthStore((s) => s.user);

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [filtered, setFiltered] = useState<FriendItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible && user?.id) {
      loadFriends();
      setSentTo(new Set());
      setSearch('');
    }
  }, [visible, user?.id]);

  const loadFriends = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const mutualIds = await getMutualFollowIds(user.id);
      if (mutualIds.length === 0) {
        setFriends([]);
        setFiltered([]);
        setIsLoading(false);
        return;
      }

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
      console.warn('[SharePlanSheet] load friends error:', err);
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

  const handleSend = useCallback(async (friend: FriendItem) => {
    if (!user || sendingTo) return;
    setSendingTo(friend.id);

    try {
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

      const convId = await getOrCreateConversation(me, other);
      await sendPlanMessage(convId, user.id, {
        id: planId,
        title: planTitle,
        coverPhoto: planCover,
        authorName: planAuthorName,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSentTo((prev) => new Set(prev).add(friend.id));
    } catch (err) {
      console.warn('[SharePlanSheet] send error:', err);
    } finally {
      setSendingTo(null);
    }
  }, [user, planId, planTitle, planCover, planAuthorName, sendingTo]);

  const renderItem = ({ item }: { item: FriendItem }) => {
    const isSent = sentTo.has(item.id);
    const isSending = sendingTo === item.id;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => !isSent && handleSend(item)}
        disabled={isSent || isSending}
      >
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
        {isSending ? (
          <ActivityIndicator size="small" color={C.primary} />
        ) : isSent ? (
          <View style={[styles.sentBadge, { backgroundColor: C.primary + '15' }]}>
            <Text style={[styles.sentText, { color: C.primary }]}>Envoyé</Text>
          </View>
        ) : (
          <View style={[styles.sendBtn, { backgroundColor: C.primary }]}>
            <Ionicons name="paper-plane" size={14} color="#FFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { backgroundColor: C.white }]}>
        <View style={styles.handle} />

        <Text style={[styles.title, { color: C.black }]}>Envoyer à un ami</Text>

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: C.gray200 }]}>
          <Ionicons name="search-outline" size={16} color={C.gray600} />
          <TextInput
            style={[styles.searchInput, { color: C.black }]}
            placeholder="Rechercher..."
            placeholderTextColor={C.gray600}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* List */}
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
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 34,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray600,
    opacity: 0.3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: Fonts.serifBold,
    textAlign: 'center',
    marginBottom: 14,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.serif,
    paddingVertical: 0,
  },
  loadingContainer: { paddingVertical: 40, alignItems: 'center' },
  list: { paddingBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  rowText: { flex: 1 },
  name: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  username: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 1 },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sentText: {
    fontSize: 12,
    fontFamily: Fonts.serifSemiBold,
  },
  emptyContainer: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: Fonts.serif },
});
