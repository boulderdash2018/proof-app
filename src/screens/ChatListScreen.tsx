import React, { useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar, EmptyState } from '../components';
import { useAuthStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { useColors } from '../hooks/useColors';
import { Conversation } from '../services/chatService';

const formatTimeAgo = (dateStr: string): string => {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}j`;
  const weeks = Math.floor(days / 7);
  return `${weeks}sem`;
};

export const ChatListScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const user = useAuthStore((s) => s.user);
  const { conversations, totalUnread, isLoading, subscribe } = useChatStore();

  useEffect(() => {
    if (user?.id) subscribe(user.id);
  }, [user?.id]);

  const getOtherParticipant = (conv: Conversation) => {
    const otherId = conv.participants.find((id) => id !== user?.id);
    if (!otherId) return null;
    return conv.participantDetails[otherId] || null;
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const other = getOtherParticipant(item);
    if (!other) return null;

    const unread = user?.id ? (item.unreadCount[user.id] || 0) : 0;
    const isMyLastMsg = item.lastMessageSenderId === user?.id;
    const preview = item.lastMessage
      ? (isMyLastMsg ? `Toi : ${item.lastMessage}` : item.lastMessage)
      : 'Nouvelle conversation';

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: unread > 0 ? C.primary + '08' : 'transparent' }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('Conversation', { conversationId: item.id, otherUser: other })}
      >
        <Avatar
          initials={other.initials}
          bg={other.avatarBg}
          color={other.avatarColor}
          size="M"
          avatarUrl={other.avatarUrl || undefined}
        />
        <View style={styles.rowContent}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, { color: C.black }, unread > 0 && styles.nameBold]} numberOfLines={1}>
              {other.displayName}
            </Text>
            <Text style={[styles.time, { color: C.gray600 }]}>{formatTimeAgo(item.lastMessageAt)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text
              style={[styles.preview, { color: unread > 0 ? C.black : C.gray600 }, unread > 0 && styles.previewBold]}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {unread > 0 && (
              <View style={[styles.badge, { backgroundColor: C.primary }]}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.black }]}>Messages</Text>
        <TouchableOpacity onPress={() => navigation.navigate('NewConversation')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="create-outline" size={22} color={C.black} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading && conversations.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="💬"
              title="Aucun message"
              subtitle="Envoie un message ou partage un plan avec un ami"
              ctaLabel="Nouveau message"
              onCtaPress={() => navigation.navigate('NewConversation')}
            />
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
    fontFamily: Fonts.serifBold,
    letterSpacing: -0.3,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 14, fontFamily: Fonts.serifSemiBold, flex: 1, marginRight: 8 },
  nameBold: { fontFamily: Fonts.serifBold },
  time: { fontSize: 11, fontFamily: Fonts.serif },
  preview: { fontSize: 13, fontFamily: Fonts.serif, flex: 1, marginRight: 8 },
  previewBold: { fontFamily: Fonts.serifSemiBold },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#FFF' },
});
