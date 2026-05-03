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
  /**
   * Mode "picker" : si défini, le sheet affiche des cases à cocher sur
   *   chaque photo + un footer "Confirmer (N)". Le tap simple ne déclenche
   *   plus la lightbox mais coche/décoche la photo. Le callback
   *   `onSelected` est appelé au tap "Confirmer" avec les URLs cochées.
   *
   * Si absent, comportement read-only historique (lightbox au tap, pas
   *   de sélection multiple).
   */
  selectionMode?: {
    /** Limite max d'éléments sélectionnables (0 = illimité). Défaut 1. */
    max?: number;
    /** Pré-cochés au mount (URLs). */
    initialSelected?: string[];
    /** Appelé au tap "Confirmer". */
    onSelected: (urls: string[]) => void;
  };
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
  visible, onClose, conversationId, sessionId, selectionMode,
}) => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const isPicker = !!selectionMode;
  const pickerMax = selectionMode?.max ?? 1;
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(
    () => new Set(selectionMode?.initialSelected || []),
  );

  // Reset picker selection chaque fois qu'on rouvre, depuis initialSelected.
  useEffect(() => {
    if (visible && selectionMode) {
      setPickerSelected(new Set(selectionMode.initialSelected || []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const togglePick = (url: string) => {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        if (pickerMax > 0 && next.size >= pickerMax) {
          // Max atteint → on remplace l'élément le plus ancien.
          // Pour max=1, c'est le mode "single-select" classique.
          if (pickerMax === 1) next.clear();
        }
        next.add(url);
      }
      return next;
    });
  };

  const handleConfirmPick = () => {
    if (!selectionMode) return;
    selectionMode.onSelected(Array.from(pickerSelected));
    onClose();
  };

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

  const renderTile = ({ item }: { item: AlbumItem }) => {
    const isPicked = pickerSelected.has(item.url);
    return (
      <TouchableOpacity
        onPress={() => isPicker ? togglePick(item.url) : setLightboxUrl(item.url)}
        style={[styles.tile, { width: `${100 / COLS}%`, aspectRatio: 1 }]}
        activeOpacity={0.85}
      >
        <Image source={{ uri: item.url }} style={styles.tileImage} />
        {isPicker && (
          <View
            style={[
              styles.pickCheckbox,
              isPicked && styles.pickCheckboxOn,
            ]}
          >
            {isPicked && (
              <Ionicons name="checkmark" size={14} color={Colors.textOnAccent} />
            )}
          </View>
        )}
        {isPicker && isPicked && <View style={styles.pickedOverlay} pointerEvents="none" />}
      </TouchableOpacity>
    );
  };

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
              {isPicker
                ? 'SÉLECTIONNE UNE PHOTO'
                : sessionId
                  ? 'SESSION · SOUVENIRS'
                  : 'ALBUM'}
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {isPicker && pickerSelected.size > 0
                ? `${pickerSelected.size} sélectionnée${pickerSelected.size > 1 ? 's' : ''}`
                : items.length > 0
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
            contentContainerStyle={{
              paddingBottom: insets.bottom + (isPicker ? 80 : 16),
            }}
            columnWrapperStyle={{ justifyContent: 'flex-start' }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Footer "Confirmer" — uniquement en mode picker */}
        {isPicker && items.length > 0 && (
          <View
            style={[
              styles.pickerFooter,
              { paddingBottom: insets.bottom + 12 },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.pickerConfirmBtn,
                pickerSelected.size === 0 && styles.pickerConfirmBtnDisabled,
              ]}
              onPress={handleConfirmPick}
              disabled={pickerSelected.size === 0}
              activeOpacity={0.85}
            >
              <Ionicons
                name="checkmark"
                size={15}
                color={
                  pickerSelected.size === 0
                    ? Colors.textTertiary
                    : Colors.textOnAccent
                }
              />
              <Text
                style={[
                  styles.pickerConfirmText,
                  pickerSelected.size === 0 && {
                    color: Colors.textTertiary,
                  },
                ]}
              >
                {pickerSelected.size === 0
                  ? 'Sélectionne une photo'
                  : `Confirmer (${pickerSelected.size})`}
              </Text>
            </TouchableOpacity>
          </View>
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
    position: 'relative',
  },
  tileImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.bgTertiary,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : null),
  },
  // Picker mode
  pickCheckbox: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textOnAccent,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickCheckboxOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pickedOverlay: {
    position: 'absolute',
    top: 2, left: 2, right: 2, bottom: 2,
    borderWidth: 3,
    borderColor: Colors.primary,
    borderRadius: 4,
  },
  pickerFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: Colors.bgSecondary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  pickerConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  pickerConfirmBtnDisabled: {
    backgroundColor: Colors.gray200,
  },
  pickerConfirmText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
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
