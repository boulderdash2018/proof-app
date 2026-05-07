import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, TouchableWithoutFeedback, ActivityIndicator, ScrollView, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store';
import { useColors } from '../hooks/useColors';
import { getMutualFollowIds } from '../services/friendsService';
import {
  ConversationParticipant,
  getOrCreateConversation,
  forwardPhotoMessage,
} from '../services/chatService';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { User } from '../types';

const QUICK_MESSAGES = [
  'Regarde !',
  'Trop bien',
  'Ça te dit ?',
  'Tu connais ?',
  'Je pensais à toi',
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

interface SharePhotoSheetProps {
  visible: boolean;
  onClose: () => void;
  /** URL Firebase Storage de la photo (réutilisée telle quelle, pas de
   *  re-upload). */
  photoUrl: string;
  photoWidth?: number;
  photoHeight?: number;
}

type Step = 'pick' | 'compose';

/**
 * SharePhotoSheet — flow de partage d'une photo reçue dans un DM vers
 * d'autres amis.
 *
 *   1. "pick"    — sélection multi-amis (multi-checkboxes)
 *   2. "compose" — preview de la photo + message optionnel + Envoyer
 *
 * Mirror exact de SharePlanSheet — même IA / même DA / mêmes textes —
 * mais branché sur `forwardPhotoMessage` plutôt que `sendPlanMessage`.
 * Garde la cohérence visuelle avec le reste de l'app au lieu d'un
 * `Share.share` natif système.
 */
export const SharePhotoSheet: React.FC<SharePhotoSheetProps> = ({
  visible, onClose, photoUrl, photoWidth, photoHeight,
}) => {
  const C = useColors();
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<Step>('pick');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [filtered, setFiltered] = useState<FriendItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentDone, setSentDone] = useState(false);

  // Reset whenever the sheet opens
  useEffect(() => {
    if (visible && user?.id) {
      loadFriends();
      setStep('pick');
      setSelectedIds(new Set());
      setMessage('');
      setSearch('');
      setSentDone(false);
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
      console.warn('[SharePhotoSheet] load friends error:', err);
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

  const toggleSelect = (friend: FriendItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(friend.id)) next.delete(friend.id);
      else next.add(friend.id);
      return next;
    });
  };

  const goToCompose = () => {
    if (selectedIds.size === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep('compose');
  };

  const backToPick = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep('pick');
  };

  const selectQuickMessage = (msg: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMessage((prev) => (prev === msg ? '' : msg));
  };

  const handleSend = useCallback(async () => {
    if (!user || isSending || selectedIds.size === 0) return;
    setIsSending(true);

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

      const selectedFriends = friends.filter((f) => selectedIds.has(f.id));
      const trimmedMessage = message.trim();

      // Fan out — un message par destinataire en parallèle.
      await Promise.all(
        selectedFriends.map(async (friend) => {
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
          return forwardPhotoMessage(convId, user.id, {
            photoUrl,
            photoWidth,
            photoHeight,
            caption: trimmedMessage || undefined,
          });
        }),
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSentDone(true);
      setTimeout(() => onClose(), 900);
    } catch (err) {
      console.warn('[SharePhotoSheet] send error:', err);
    } finally {
      setIsSending(false);
    }
  }, [user, isSending, selectedIds, friends, photoUrl, photoWidth, photoHeight, message, onClose]);

  const renderFriendRow = ({ item }: { item: FriendItem }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => toggleSelect(item)}
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
        <View style={[
          styles.checkbox,
          isSelected
            ? { backgroundColor: C.primary, borderColor: C.primary }
            : { borderColor: C.gray400 },
        ]}>
          {isSelected ? <Ionicons name="checkmark" size={14} color={Colors.textOnAccent} /> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const selectedCount = selectedIds.size;
  const selectedFriendsList = friends.filter((f) => selectedIds.has(f.id));
  const canSend = selectedCount > 0 && !isSending;
  const sendLabel = (() => {
    if (sentDone) return 'Envoyé ✓';
    if (isSending) return 'Envoi…';
    const hasMessage = message.trim().length > 0;
    if (selectedCount === 1) return hasMessage ? 'Envoyer avec le message' : 'Envoyer';
    return hasMessage ? `Envoyer à ${selectedCount} avec le message` : `Envoyer à ${selectedCount}`;
  })();

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

          {/* ═════════════════ STEP 1: pick friends ═════════════════ */}
          {step === 'pick' && (
            <>
              <View style={styles.header}>
                <View style={{ width: 28 }} />
                <Text style={[styles.title, { color: C.black }]}>Envoyer à…</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={C.gray700} />
                </TouchableOpacity>
              </View>

              <View style={[styles.searchRow, { backgroundColor: C.gray200 }]}>
                <Ionicons name="search-outline" size={16} color={C.gray600} />
                <TextInput
                  style={[styles.searchInput, { color: C.black }]}
                  placeholder="Rechercher un ami…"
                  placeholderTextColor={C.gray600}
                  value={search}
                  onChangeText={setSearch}
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={C.gray500} />
                  </TouchableOpacity>
                )}
              </View>

              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={C.primary} />
                </View>
              ) : (
                <FlatList
                  data={filtered}
                  renderItem={renderFriendRow}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.list}
                  style={styles.flatList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  extraData={selectedIds}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={[styles.emptyText, { color: C.gray600 }]}>
                        {search ? 'Aucun résultat' : 'Aucun ami mutuel'}
                      </Text>
                    </View>
                  }
                />
              )}

              {selectedCount > 0 && (
                <View style={[styles.pickFooter, { borderTopColor: C.borderLight }]}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.selectedRow}
                  >
                    {selectedFriendsList.map((f) => (
                      <View key={f.id} style={styles.selectedChip}>
                        <Avatar
                          initials={f.initials}
                          bg={f.avatarBg}
                          color={f.avatarColor}
                          size="XS"
                          avatarUrl={f.avatarUrl || undefined}
                        />
                        <Text style={[styles.selectedChipName, { color: C.black }]} numberOfLines={1}>
                          {f.displayName.split(' ')[0]}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={[styles.nextBtn, { backgroundColor: C.primary }]}
                    onPress={goToCompose}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.nextBtnText}>
                      {selectedCount === 1 ? 'Suivant' : `Suivant · ${selectedCount}`}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={Colors.textOnAccent} />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* ═════════════════ STEP 2: compose & send ═════════════════ */}
          {step === 'compose' && (
            <>
              <View style={styles.header}>
                <TouchableOpacity onPress={backToPick} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-back" size={22} color={C.black} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: C.black }]} numberOfLines={1}>
                  {selectedCount === 1
                    ? `À ${selectedFriendsList[0]?.displayName.split(' ')[0] ?? ''}`
                    : `À ${selectedCount} personnes`}
                </Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={C.gray700} />
                </TouchableOpacity>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.composeSelectedRow}
              >
                {selectedFriendsList.map((f) => (
                  <View key={f.id} style={styles.composeSelectedChip}>
                    <Avatar
                      initials={f.initials}
                      bg={f.avatarBg}
                      color={f.avatarColor}
                      size="S"
                      avatarUrl={f.avatarUrl || undefined}
                    />
                    <Text style={[styles.composeSelectedName, { color: C.gray700 }]} numberOfLines={1}>
                      {f.displayName.split(' ')[0]}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              {/* Photo preview — la diff vs SharePlanSheet : on affiche la
                  photo elle-même (au lieu d'une preview de plan). */}
              <View style={[styles.photoPreview, { backgroundColor: C.gray200, borderColor: C.borderLight }]}>
                <Image source={{ uri: photoUrl }} style={styles.photoPreviewImg} resizeMode="cover" />
                <View style={styles.photoPreviewBadge}>
                  <Ionicons name="image" size={12} color={Colors.textOnAccent} />
                  <Text style={styles.photoPreviewBadgeText}>Photo</Text>
                </View>
              </View>

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

              <View style={[styles.messageInputRow, {
                backgroundColor: C.gray200,
                borderColor: message.length > 0 ? C.primary + '60' : C.borderLight,
              }]}>
                <TextInput
                  style={[styles.messageInput, { color: C.black }]}
                  placeholder="Écrire un message (optionnel)…"
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

              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  {
                    backgroundColor: sentDone ? Colors.success : C.primary,
                    opacity: canSend || sentDone ? 1 : 0.5,
                  },
                ]}
                onPress={handleSend}
                disabled={!canSend}
                activeOpacity={0.85}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={Colors.textOnAccent} />
                ) : (
                  <>
                    <Ionicons
                      name={sentDone ? 'checkmark' : 'paper-plane'}
                      size={16}
                      color={Colors.textOnAccent}
                    />
                    <Text style={styles.sendBtnText}>{sendLabel}</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={[styles.sendHint, { color: C.gray600 }]}>
                {message.trim().length > 0
                  ? 'La photo et ton message seront envoyés dans le chat.'
                  : 'La photo sera envoyée sans message. Tu peux en ajouter un au-dessus.'}
              </Text>
            </>
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
    top: '15%',
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  flatList: { flex: 1 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray400,
    opacity: 0.3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 4,
    gap: 8,
  } as any,
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    flex: 1,
    textAlign: 'center',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 6,
  } as any,
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
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
  } as any,
  rowText: { flex: 1 },
  name: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  username: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: Fonts.body },

  pickFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
  } as any,
  selectedRow: {
    gap: 6,
    paddingRight: 6,
    alignItems: 'center',
  } as any,
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(196, 112, 75, 0.12)',
    maxWidth: 120,
  } as any,
  selectedChipName: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    maxWidth: 70,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  } as any,
  nextBtnText: {
    color: Colors.textOnAccent,
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
  },

  composeSelectedRow: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    alignItems: 'center',
  } as any,
  composeSelectedChip: {
    alignItems: 'center',
    gap: 4,
    maxWidth: 56,
  },
  composeSelectedName: {
    fontSize: 11,
    fontFamily: Fonts.body,
    maxWidth: 56,
    textAlign: 'center',
  },

  // Photo preview (différencie ce sheet de SharePlanSheet)
  photoPreview: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    height: 180,
    position: 'relative',
  },
  photoPreviewImg: {
    width: '100%',
    height: '100%',
  },
  photoPreviewBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(44,36,32,0.7)',
  } as any,
  photoPreviewBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    color: Colors.textOnAccent,
    letterSpacing: 0.6,
  },

  quickRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  } as any,
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
    paddingVertical: 10,
    borderWidth: 1.5,
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  } as any,
  messageInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },

  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    height: 52,
    borderRadius: 14,
  } as any,
  sendBtnText: {
    color: Colors.textOnAccent,
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
  },
  sendHint: {
    fontSize: 11,
    fontFamily: Fonts.body,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
    paddingHorizontal: 24,
  },
});
