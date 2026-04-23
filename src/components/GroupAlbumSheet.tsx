import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Pressable,
  Image, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../constants';
import { ChatMessage, fetchMessages } from '../services/chatService';

interface GroupAlbumSheetProps {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  /** Optional filter — only photos tagged with this sessionId. If absent, show all photos. */
  sessionId?: string;
}

interface AlbumItem {
  id: string;
  url: string;
  senderId: string;
  createdAt: string;
  width?: number;
  height?: number;
}

const COLS = 3;

/**
 * Full-screen sheet showing every photo sent in a group conversation,
 * optionally filtered to a given sessionId (post-session souvenir album).
 *
 * Grid is reactive: it re-fetches when `visible` flips to true. Tap opens
 * a fullscreen lightbox; long-press could expose download / react but for
 * this MVP we keep it read-only.
 */
export const GroupAlbumSheet: React.FC<GroupAlbumSheetProps> = ({
  visible, onClose, conversationId, sessionId,
}) => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const all = await fetchMessages(conversationId);
        if (cancelled) return;
        const photos: AlbumItem[] = all
          .filter((m: ChatMessage) => m.type === 'photo' && !!m.photoUrl)
          .filter((m: ChatMessage) => !sessionId || (m as any).sessionId === sessionId)
          .map((m: ChatMessage) => ({
            id: m.id,
            url: m.photoUrl!,
            senderId: m.senderId,
            createdAt: m.createdAt,
            width: m.photoWidth,
            height: m.photoHeight,
          }))
          // newest first
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setItems(photos);
      } catch (err) {
        console.warn('[GroupAlbumSheet] fetch error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, conversationId, sessionId]);

  const tileSize = useMemo(() => {
    // Grid tiles respect the screen width — sized at render time via onLayout.
    // Default to a reasonable thumb; real width is set on the FlatList below.
    return 120;
  }, []);

  const renderTile = ({ item }: { item: AlbumItem }) => (
    <TouchableOpacity
      onPress={() => setLightboxUrl(item.url)}
      style={[styles.tile, { width: `${100 / COLS}%`, aspectRatio: 1 }]}
      activeOpacity={0.85}
    >
      <Image source={{ uri: item.url }} style={styles.tileImage} />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.headerBtn}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTxt}>
            <Text style={styles.eyebrow}>
              {sessionId ? 'SESSION · SOUVENIRS' : 'ALBUM'}
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {items.length > 0
                ? `${items.length} photo${items.length > 1 ? 's' : ''}`
                : 'Aucune photo'}
            </Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="image-outline" size={28} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Pas encore de photos</Text>
            <Text style={styles.emptySub}>
              {sessionId
                ? 'Prenez des clichés pendant la session — ils apparaîtront ici.'
                : 'Envoyez des photos dans la conversation pour alimenter l\u2019album.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            numColumns={COLS}
            renderItem={renderTile}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            columnWrapperStyle={{ justifyContent: 'flex-start' }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Lightbox — reuses the fullscreen dark pattern */}
        {lightboxUrl && (
          <Modal
            visible
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setLightboxUrl(null)}
          >
            <Pressable style={lightboxStyles.backdrop} onPress={() => setLightboxUrl(null)}>
              <Image source={{ uri: lightboxUrl }} style={lightboxStyles.image} resizeMode="contain" />
              <TouchableOpacity
                style={[lightboxStyles.closeBtn, { top: insets.top + 12 }]}
                onPress={() => setLightboxUrl(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={Colors.textOnAccent} />
              </TouchableOpacity>
            </Pressable>
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTxt: { flex: 1, alignItems: 'center' },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  tile: {
    padding: 2,
  },
  tileImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.bgTertiary,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : null),
  },
});

const lightboxStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
