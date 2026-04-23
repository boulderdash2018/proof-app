import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, TouchableWithoutFeedback, ActivityIndicator, ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store';
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

interface AddParticipantsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** User IDs already in the group — they'll be hidden/disabled in the picker. */
  existingParticipantIds: string[];
  /** Called once for each newly-selected participant (parent decides how to persist). */
  onAdd: (participant: ConversationParticipant) => Promise<void> | void;
}

/**
 * Sheet to add more people to an existing group conversation.
 * Shows the user's mutual follows, minus anyone already in the group.
 * Multi-select + confirm → calls onAdd for each new participant.
 */
export const AddParticipantsSheet: React.FC<AddParticipantsSheetProps> = ({
  visible, onClose, existingParticipantIds, onAdd,
}) => {
  const user = useAuthStore((s) => s.user);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && user?.id) {
      loadFriends();
      setSelectedIds(new Set());
      setSearch('');
      setIsSubmitting(false);
    }
  }, [visible, user?.id]);

  const loadFriends = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const mutualIds = await getMutualFollowIds(user.id);
      if (mutualIds.length === 0) {
        setFriends([]);
        setIsLoading(false);
        return;
      }
      const all: FriendItem[] = [];
      for (let i = 0; i < mutualIds.length; i += 10) {
        const batch = mutualIds.slice(i, i + 10);
        const q = query(collection(db, 'users'), where(documentId(), 'in', batch));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data() as User;
          all.push({
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
      all.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setFriends(all);
    } catch (err) {
      console.warn('[AddParticipantsSheet] load friends error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const existingSet = new Set(existingParticipantIds);
    const base = friends.filter((f) => !existingSet.has(f.id));
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter((f) =>
      f.displayName.toLowerCase().includes(q) || f.username.toLowerCase().includes(q),
    );
  }, [friends, existingParticipantIds, search]);

  const toggleSelect = (friend: FriendItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(friend.id)) next.delete(friend.id);
      else next.add(friend.id);
      return next;
    });
  };

  const handleAdd = useCallback(async () => {
    if (selectedIds.size === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const selected = friends.filter((f) => selectedIds.has(f.id));
      for (const f of selected) {
        const p: ConversationParticipant = {
          userId: f.id,
          displayName: f.displayName,
          username: f.username,
          avatarUrl: f.avatarUrl,
          avatarBg: f.avatarBg,
          avatarColor: f.avatarColor,
          initials: f.initials,
        };
        // Sequential to avoid racing on the same conv doc write.
        await onAdd(p);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
    } catch (err) {
      console.warn('[AddParticipantsSheet] add error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedIds, friends, onAdd, onClose, isSubmitting]);

  const renderRow = ({ item }: { item: FriendItem }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => toggleSelect(item)}>
        <Avatar
          initials={item.initials}
          bg={item.avatarBg}
          color={item.avatarColor}
          size="M"
          avatarUrl={item.avatarUrl ?? undefined}
        />
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
          <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
        </View>
        <View
          style={[
            styles.checkbox,
            isSelected
              ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
              : { borderColor: Colors.gray400 },
          ]}
        >
          {isSelected ? <Ionicons name="checkmark" size={14} color={Colors.textOnAccent} /> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const selectedCount = selectedIds.size;
  const selectedList = friends.filter((f) => selectedIds.has(f.id));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ width: 28 }} />
            <Text style={styles.title}>Ajouter au groupe</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher"
              placeholderTextColor={Colors.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              renderItem={renderRow}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 10 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              extraData={selectedIds}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {search ? 'Aucun résultat' : 'Tous tes amis mutuels sont déjà dans le groupe'}
                  </Text>
                </View>
              }
            />
          )}

          {selectedCount > 0 && (
            <View style={styles.footer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectedRow}
              >
                {selectedList.map((f) => (
                  <View key={f.id} style={styles.selectedChip}>
                    <Avatar
                      initials={f.initials}
                      bg={f.avatarBg}
                      color={f.avatarColor}
                      size="XS"
                      avatarUrl={f.avatarUrl ?? undefined}
                    />
                    <Text style={styles.selectedChipName} numberOfLines={1}>
                      {f.displayName.split(' ')[0]}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[styles.addBtn, { opacity: isSubmitting ? 0.6 : 1 }]}
                onPress={handleAdd}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={Colors.textOnAccent} />
                ) : (
                  <>
                    <Ionicons name="person-add" size={15} color={Colors.textOnAccent} />
                    <Text style={styles.addBtnText}>
                      Ajouter{selectedCount > 1 ? ` · ${selectedCount}` : ''}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
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
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
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
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    flex: 1,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 6,
    backgroundColor: Colors.bgTertiary,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    paddingVertical: 0,
    color: Colors.textPrimary,
  },
  loadingContainer: { paddingVertical: 40, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  rowText: { flex: 1 },
  name: { fontSize: 14, fontFamily: Fonts.bodySemiBold, color: Colors.textPrimary },
  username: { fontSize: 12, fontFamily: Fonts.body, color: Colors.textSecondary, marginTop: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: { paddingVertical: 40, alignItems: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 13, fontFamily: Fonts.body, color: Colors.textSecondary, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  selectedRow: { gap: 6, paddingRight: 6, alignItems: 'center' },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    maxWidth: 120,
  },
  selectedChipName: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    maxWidth: 70,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  addBtnText: {
    color: Colors.textOnAccent,
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
  },
});
