import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Image, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from '../components';
import { useAuthStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { useColors } from '../hooks/useColors';
import { ChatMessage, ConversationParticipant } from '../services/chatService';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];

const formatTime = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const formatDateSeparator = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
};

const shouldShowDateSeparator = (msg: ChatMessage, prevMsg?: ChatMessage): boolean => {
  if (!prevMsg) return true;
  const d1 = new Date(msg.createdAt).toDateString();
  const d2 = new Date(prevMsg.createdAt).toDateString();
  return d1 !== d2;
};

export const ConversationScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const C = useColors();
  const user = useAuthStore((s) => s.user);

  const { conversationId, otherUser } = route.params as {
    conversationId: string;
    otherUser: ConversationParticipant;
  };

  const {
    messages, isMessagesLoading,
    openConversation, closeConversation,
    sendText, sendPlan, toggleReaction,
  } = useChatStore();

  const [text, setText] = useState('');
  const [reactionMsgId, setReactionMsgId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const reactionScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user?.id) openConversation(conversationId, user.id);
    return () => closeConversation();
  }, [conversationId, user?.id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    Keyboard.dismiss();
    await sendText(trimmed);
  }, [text, sendText]);

  const handleLongPress = useCallback((messageId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReactionMsgId(messageId);
    Animated.spring(reactionScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 100,
    }).start();
  }, []);

  const handleReaction = useCallback((emoji: string) => {
    if (!reactionMsgId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleReaction(reactionMsgId, emoji);
    Animated.timing(reactionScale, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setReactionMsgId(null));
  }, [reactionMsgId, toggleReaction]);

  const dismissReactions = useCallback(() => {
    if (reactionMsgId) {
      Animated.timing(reactionScale, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => setReactionMsgId(null));
    }
  }, [reactionMsgId]);

  const handlePlanPress = useCallback((planId: string) => {
    navigation.navigate('PlanDetail', { planId });
  }, [navigation]);

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isMine = item.senderId === user?.id;
    const prevMsg = index > 0 ? messages[index - 1] : undefined;
    const showDate = shouldShowDateSeparator(item, prevMsg);
    const showReactionPicker = reactionMsgId === item.id;

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateSeparatorText, { color: C.gray600 }]}>
              {formatDateSeparator(item.createdAt)}
            </Text>
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => handleLongPress(item.id)}
          onPress={dismissReactions}
          style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}
        >
          {/* Avatar for other person */}
          {!isMine && (
            <Avatar
              initials={otherUser.initials}
              bg={otherUser.avatarBg}
              color={otherUser.avatarColor}
              size="SS"
              avatarUrl={otherUser.avatarUrl || undefined}
            />
          )}

          <View style={[
            styles.bubble,
            isMine
              ? [styles.bubbleMine, { backgroundColor: C.primary }]
              : [styles.bubbleOther, { backgroundColor: C.gray200 }],
          ]}>
            {item.type === 'plan' ? (
              <TouchableOpacity
                onPress={() => item.planId && handlePlanPress(item.planId)}
                activeOpacity={0.8}
              >
                {item.planCover ? (
                  <Image source={{ uri: item.planCover }} style={styles.planCover} />
                ) : (
                  <View style={[styles.planCoverPlaceholder, { backgroundColor: C.primary + '20' }]}>
                    <Ionicons name="map-outline" size={24} color={C.primary} />
                  </View>
                )}
                <View style={styles.planInfo}>
                  <Text style={[styles.planLabel, { color: isMine ? 'rgba(255,255,255,0.7)' : C.gray600 }]}>
                    Plan partagé
                  </Text>
                  <Text style={[styles.planTitle, { color: isMine ? '#FFF' : C.black }]} numberOfLines={2}>
                    {item.planTitle}
                  </Text>
                  {item.planAuthorName && (
                    <Text style={[styles.planAuthor, { color: isMine ? 'rgba(255,255,255,0.6)' : C.gray600 }]}>
                      par {item.planAuthorName}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.msgText, { color: isMine ? '#FFF' : C.black }]}>
                {item.content}
              </Text>
            )}

            <Text style={[styles.msgTime, { color: isMine ? 'rgba(255,255,255,0.6)' : C.gray600 }]}>
              {formatTime(item.createdAt)}
            </Text>
          </View>

          {/* Reactions display */}
          {item.reactions.length > 0 && (
            <View style={[styles.reactionsRow, isMine ? styles.reactionsRight : styles.reactionsLeft]}>
              {groupReactions(item.reactions).map((r) => (
                <View key={r.emoji} style={[styles.reactionChip, { backgroundColor: C.gray200 }]}>
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  {r.count > 1 && <Text style={[styles.reactionCount, { color: C.gray600 }]}>{r.count}</Text>}
                </View>
              ))}
            </View>
          )}

          {/* Reaction picker */}
          {showReactionPicker && (
            <Animated.View style={[
              styles.reactionPicker,
              { backgroundColor: C.white, transform: [{ scale: reactionScale }] },
              isMine ? styles.reactionPickerRight : styles.reactionPickerLeft,
            ]}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity key={emoji} onPress={() => handleReaction(emoji)} style={styles.reactionPickerBtn}>
                  <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.black} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => navigation.navigate('OtherProfile', { userId: otherUser.userId })}
          activeOpacity={0.7}
        >
          <Avatar
            initials={otherUser.initials}
            bg={otherUser.avatarBg}
            color={otherUser.avatarColor}
            size="S"
            avatarUrl={otherUser.avatarUrl || undefined}
          />
          <Text style={[styles.headerName, { color: C.black }]} numberOfLines={1}>
            {otherUser.displayName}
          </Text>
        </TouchableOpacity>
        <View style={{ width: 24 }} />
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.messagesList, { paddingBottom: 10 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input bar */}
        <View style={[styles.inputBar, { borderTopColor: C.borderLight, paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={[styles.inputRow, { backgroundColor: C.gray200 }]}>
            <TextInput
              style={[styles.input, { color: C.black }]}
              placeholder="Message..."
              placeholderTextColor={C.gray600}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
            />
            {text.trim().length > 0 && (
              <TouchableOpacity onPress={handleSend} style={[styles.sendBtn, { backgroundColor: C.primary }]}>
                <Ionicons name="arrow-up" size={18} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// Helper to group reactions by emoji
const groupReactions = (reactions: { emoji: string; userId: string }[]): { emoji: string; count: number }[] => {
  const map = new Map<string, number>();
  reactions.forEach((r) => map.set(r.emoji, (map.get(r.emoji) || 0) + 1));
  return Array.from(map.entries()).map(([emoji, count]) => ({ emoji, count }));
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    justifyContent: 'center',
  },
  headerName: {
    fontSize: 16,
    fontFamily: Fonts.serifBold,
    letterSpacing: -0.3,
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateSeparatorText: {
    fontSize: 12,
    fontFamily: Fonts.serifSemiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-end',
    gap: 6,
    position: 'relative',
  },
  msgRowLeft: { justifyContent: 'flex-start', marginRight: 50 },
  msgRowRight: { justifyContent: 'flex-end', marginLeft: 50 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: 15,
    fontFamily: Fonts.serif,
    lineHeight: 20,
  },
  msgTime: {
    fontSize: 10,
    fontFamily: Fonts.serif,
    marginTop: 4,
    alignSelf: 'flex-end',
  },

  // Plan card in message
  planCover: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 8,
  },
  planCoverPlaceholder: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planInfo: { gap: 2 },
  planLabel: {
    fontSize: 10,
    fontFamily: Fonts.serifSemiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planTitle: {
    fontSize: 14,
    fontFamily: Fonts.serifBold,
    lineHeight: 18,
  },
  planAuthor: {
    fontSize: 11,
    fontFamily: Fonts.serif,
    marginTop: 2,
  },

  // Reactions
  reactionsRow: {
    flexDirection: 'row',
    gap: 4,
    position: 'absolute',
    bottom: -10,
  },
  reactionsLeft: { left: 30 },
  reactionsRight: { right: 10 },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 2,
  },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 10, fontFamily: Fonts.serif },

  // Reaction picker
  reactionPicker: {
    position: 'absolute',
    top: -44,
    flexDirection: 'row',
    borderRadius: 22,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    gap: 2,
  },
  reactionPickerLeft: { left: 30 },
  reactionPickerRight: { right: 0 },
  reactionPickerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPickerEmoji: { fontSize: 22 },

  // Input bar
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.serif,
    maxHeight: 100,
    paddingVertical: 0,
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
