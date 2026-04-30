import React from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { CoAuthor } from '../types';

interface MainAuthor {
  /** Stable user id — used to navigate to OtherProfile. */
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  initials: string;
  avatarBg: string;
  avatarColor: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  mainAuthor: MainAuthor;
  coAuthors?: CoAuthor[];
  /** Tap on a row → navigate to that user's profile. The sheet closes
   *  itself before calling the handler so the nav animation isn't
   *  competing with the modal close animation. */
  onProfilePress?: (userId: string) => void;
}

/**
 * Bottom-anchored modal listing every collaborator on a co-authored
 * Plan : the main author + each co-author. Each row shows the avatar,
 * display name, and username, and is tappable → navigates to that
 * user's profile. Mirrors Instagram's "Collaborateur(ice)s" sheet for
 * its discoverability gesture but stays in the editorial crème DA.
 *
 * Hidden when there are no co-authors — the parent should gate the
 * "tap → open sheet" behavior on coAuthors.length > 0 (a solo plan
 * already navigates straight to the single author's profile).
 */
export const CollaboratorsSheet: React.FC<Props> = ({
  visible, onClose, mainAuthor, coAuthors, onProfilePress,
}) => {
  const collaborators: MainAuthor[] = [
    mainAuthor,
    ...(coAuthors ?? []).map((c) => ({
      id: c.id,
      displayName: c.displayName,
      username: c.username,
      avatarUrl: c.avatarUrl ?? null,
      initials: c.initials,
      avatarBg: c.avatarBg,
      avatarColor: c.avatarColor,
    })),
  ];

  const handleRowPress = (userId: string) => {
    onClose();
    if (onProfilePress) {
      // Defer so the modal close anim doesn't overlap with the nav.
      setTimeout(() => onProfilePress(userId), 180);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Header — title + close */}
          <View style={styles.header}>
            <View style={{ width: 28 }} />
            <Text style={styles.title}>Collaborateur·ices</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Eyebrow count line */}
          <Text style={styles.countLine}>
            {collaborators.length} {collaborators.length > 1 ? 'personnes ont' : 'personne a'} co-créé ce plan
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {collaborators.map((c, i) => (
              <TouchableOpacity
                key={c.id || i}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => handleRowPress(c.id)}
              >
                <View style={[styles.avatar, { backgroundColor: c.avatarBg }]}>
                  {c.avatarUrl ? (
                    <Image source={{ uri: c.avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <Text style={[styles.initials, { color: c.avatarColor }]}>
                      {c.initials}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.displayName}
                    {i === 0 ? <Text style={styles.creatorTag}>  · créateur·ice</Text> : null}
                  </Text>
                  <Text style={styles.username} numberOfLines={1}>@{c.username}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bgPrimary,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 14,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countLine: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  list: { flex: 0 },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  initials: {
    fontSize: 15,
    fontWeight: '700',
  },
  name: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  creatorTag: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    letterSpacing: 0.05,
  },
  username: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});
