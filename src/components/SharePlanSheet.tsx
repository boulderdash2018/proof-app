import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, TouchableWithoutFeedback, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform,
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

const QUICK_MESSAGES = [
  'Regarde ce plan !',
  'On fait ça ?',
  'Parfait pour nous',
  'Tu connais ?',
  'Faut qu\'on teste',
];

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
  const messageInputRef = useRef<TextInput>(null);

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [filtered, setFiltered] = useState<FriendItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (visible && user?.id) {
      loadFriends();
      setSentTo(new Set());
      setSearch('');
      setMessage('');
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
      }, message || undefined);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSentTo((prev) => new Set(prev).add(friend.id));
    } catch (err) {
      console.warn('[SharePlanSheet] send error:', err);
    } finally {
      setSendingTo(null);
    }
  }, [user, planId, planTitle, planCover, planAuthorName, sendingTo, message]);

  const selectQuickMessage = (msg: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMessage((prev) => prev === msg ? '' : msg);
  };

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
            <Ionicons name="paper-plane" size={14} color={Colors.textOnAccent} />
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: C.white }]}>
          <View style={styles.handle} />

          <Text style={[styles.title, { color: C.black }]}>Envoyer à un ami</Text>

          {/* ── Message composer ── */}
          <View style={styles.messageSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}
            >
              {QUICK_MESSAGES.map((msg) => {
                const isSelected = message === msg;
                return (
                  <TouchableOpacity
                    key={msg}
                    style={[
                      styles.quickChip,
                      { borderColor: isSelected ? C.primary : C.borderLight, backgroundColor: isSelected ? C.primary + '15' : C.gray200 },
                    ]}
                    onPress={() => selectQuickMessage(msg)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickChipText, { color: isSelected ? C.primary : C.gray700 }]}>{msg}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={[styles.messageInputRow, { backgroundColor: C.gray200, borderColor: message.length > 0 ? C.primary + '50' : C.borderLight }]}>
              <TextInput
                ref={messageInputRef}
                style={[styles.messageInput, { color: C.black }]}
                placeholder="Écrire un message..."
                placeholderTextColor={C.gray600}
                value={message}
                onChangeText={setMessage}
                maxLength={200}
                multiline={false}
              />
              {message.length > 0 && (
                <TouchableOpacity onPress={() => setMessage('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={C.gray500} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Search ── */}
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

          {/* ── Friends list ── */}
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
              keyboardShouldPersistTaps="handled"
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
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(44,36,32,0.4)' },
  sheetWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '80%',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    maxHeight: '100%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray400,
    opacity: 0.3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    textAlign: 'center',
    marginBottom: 12,
  },

  // Message composer
  messageSection: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  quickRow: {
    gap: 8,
    paddingBottom: 10,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  quickChipText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
  },
  messageInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    gap: 8,
  },
  messageInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },

  // Search
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
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },

  // List
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
  name: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  username: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
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
    fontFamily: Fonts.bodySemiBold,
  },
  emptyContainer: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: Fonts.body },
});
