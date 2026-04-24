import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal,
  FlatList, ActivityIndicator, Image, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store';
import { useCoPlanStore } from '../store/coPlanStore';
import {
  searchPlacesAutocomplete,
  getPlaceDetails,
} from '../services/googlePlacesService';
import { CoPlanProposedPlace, CoPlanParticipant } from '../types';

interface Props {
  participants: Record<string, CoPlanParticipant>;
}

/**
 * "Où ?" section — collaborative list of proposed places with voting + reorder.
 *
 * Rows are ordered by orderIndex (manual). Votes are a secondary signal
 * shown as a chip; sort stays manual to give participants agency over the
 * final trajet order (the Tier 2 route optimizer in commit 9 will re-suggest
 * an ordering from these votes).
 */
export const CoPlanPlacesSection: React.FC<Props> = ({ participants }) => {
  const user = useAuthStore((s) => s.user);
  const places = useCoPlanStore((s) => s.getSortedPlaces());
  const proposePlace = useCoPlanStore((s) => s.proposePlace);
  const toggleVote = useCoPlanStore((s) => s.toggleVote);
  const movePlace = useCoPlanStore((s) => s.movePlace);
  const removePlace = useCoPlanStore((s) => s.removePlace);

  const [pickerOpen, setPickerOpen] = useState(false);

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPickerOpen(true);
  };

  const handleVote = useCallback((placeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggleVote(placeId);
  }, [toggleVote]);

  const handleMove = useCallback((placeId: string, dir: 'up' | 'down') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    movePlace(placeId, dir);
  }, [movePlace]);

  const handleRemove = useCallback((placeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    removePlace(placeId);
  }, [removePlace]);

  const isEmpty = places.length === 0;

  return (
    <View>
      {/* Primary action — promoted to the TOP of the section so the move
          to "propose something" feels like the natural next step, not an
          afterthought hidden under an empty state. */}
      <TouchableOpacity
        style={[styles.addBtn, isEmpty && styles.addBtnPrimary]}
        onPress={handleAdd}
        activeOpacity={0.85}
      >
        <Ionicons
          name="add"
          size={18}
          color={isEmpty ? Colors.textOnAccent : Colors.primary}
        />
        <Text style={[styles.addBtnText, isEmpty && styles.addBtnTextPrimary]}>
          Proposer un lieu
        </Text>
      </TouchableOpacity>

      {isEmpty ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="sparkles" size={20} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Lance le mouvement</Text>
          <Text style={styles.emptyBody}>
            Café, expo, balade, restau… le premier lieu donne souvent le ton
            de la journée. Vous pourrez voter, réordonner et en ajouter
            d'autres ensuite.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10, marginTop: 12 }}>
          {places.map((p, i) => (
            <PlaceRow
              key={p.id}
              place={p}
              index={i}
              total={places.length}
              proposer={participants[p.proposedBy]}
              currentUserId={user?.id}
              onVote={handleVote}
              onMoveUp={() => handleMove(p.id, 'up')}
              onMoveDown={() => handleMove(p.id, 'down')}
              onRemove={() => handleRemove(p.id)}
            />
          ))}
        </View>
      )}

      <PlacePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={async (placeId) => {
          setPickerOpen(false);
          // Fetch richer details in background then propose.
          try {
            const details = await getPlaceDetails(placeId);
            if (!details) return;
            await proposePlace({
              googlePlaceId: details.placeId,
              name: details.name,
              address: details.address,
              // photoUrls entries are already full URLs (transformed by getPlaceDetails).
              photoUrl: details.photoUrls[0],
              category: details.types?.[0],
              priceLevel: details.priceLevel,
              latitude: details.latitude,
              longitude: details.longitude,
            });
          } catch (err) {
            console.warn('[CoPlanPlacesSection] pick error:', err);
          }
        }}
      />
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Place row
// ══════════════════════════════════════════════════════════════

interface PlaceRowProps {
  place: CoPlanProposedPlace;
  index: number;
  total: number;
  proposer?: CoPlanParticipant;
  currentUserId?: string;
  onVote: (placeId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

const PlaceRow: React.FC<PlaceRowProps> = ({
  place, index, total, proposer, currentUserId, onVote, onMoveUp, onMoveDown, onRemove,
}) => {
  const hasVoted = !!currentUserId && place.votes.includes(currentUserId);
  const voteCount = place.votes.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const mine = !!currentUserId && place.proposedBy === currentUserId;

  return (
    <View style={rowStyles.container}>
      {/* Thumbnail */}
      {place.photoUrl ? (
        <Image source={{ uri: place.photoUrl }} style={rowStyles.thumb} />
      ) : (
        <View style={[rowStyles.thumb, rowStyles.thumbFallback]}>
          <Ionicons name="location" size={16} color={Colors.primary} />
        </View>
      )}

      {/* Body */}
      <View style={rowStyles.body}>
        <Text style={rowStyles.name} numberOfLines={1}>{place.name}</Text>
        <Text style={rowStyles.address} numberOfLines={1}>{place.address}</Text>
        {proposer && (
          <View style={rowStyles.proposerRow}>
            <Avatar
              initials={proposer.initials}
              bg={proposer.avatarBg}
              color={proposer.avatarColor}
              size="XS"
              avatarUrl={proposer.avatarUrl ?? undefined}
            />
            <Text style={rowStyles.proposerText}>
              {mine ? 'Toi' : `par ${proposer.displayName.split(' ')[0]}`}
            </Text>
          </View>
        )}
      </View>

      {/* Right column — actions stacked */}
      <View style={rowStyles.actions}>
        <TouchableOpacity
          style={[
            rowStyles.voteChip,
            hasVoted
              ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
              : { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle },
          ]}
          onPress={() => onVote(place.id)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={hasVoted ? 'heart' : 'heart-outline'}
            size={13}
            color={hasVoted ? Colors.textOnAccent : Colors.primary}
          />
          <Text
            style={[
              rowStyles.voteCount,
              { color: hasVoted ? Colors.textOnAccent : Colors.textPrimary },
            ]}
          >
            {voteCount}
          </Text>
        </TouchableOpacity>

        <View style={rowStyles.reorderRow}>
          <TouchableOpacity
            style={[rowStyles.reorderBtn, isFirst && rowStyles.reorderBtnDisabled]}
            onPress={onMoveUp}
            disabled={isFirst}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-up" size={14} color={isFirst ? Colors.gray400 : Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[rowStyles.reorderBtn, isLast && rowStyles.reorderBtnDisabled]}
            onPress={onMoveDown}
            disabled={isLast}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-down" size={14} color={isLast ? Colors.gray400 : Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={rowStyles.removeBtn}
          onPress={onRemove}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="close" size={13} color={Colors.textTertiary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Place picker modal — Google Places autocomplete
// ══════════════════════════════════════════════════════════════

interface PickerProps {
  visible: boolean;
  onClose: () => void;
  onPick: (placeId: string) => void | Promise<void>;
}

interface Suggestion {
  placeId: string;
  name: string;
  address: string;
}

const PlacePickerModal: React.FC<PickerProps> = ({ visible, onClose, onPick }) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await searchPlacesAutocomplete(trimmed);
        setResults(res);
      } catch (err) {
        console.warn('[PlacePickerModal] search error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query, visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[pickerStyles.container, { paddingTop: insets.top }]}>
        <View style={pickerStyles.header}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={pickerStyles.headerBtn}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={pickerStyles.headerCenter}>
            <Text style={pickerStyles.eyebrow}>AJOUTER UN LIEU</Text>
            <Text style={pickerStyles.title}>Proposer</Text>
          </View>
          <View style={pickerStyles.headerBtn} />
        </View>

        <View style={pickerStyles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textTertiary} />
          <TextInput
            style={pickerStyles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Nom du lieu ou adresse"
            placeholderTextColor={Colors.textTertiary}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View style={pickerStyles.loadingWrap}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.placeId}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ItemSeparatorComponent={() => (
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: Colors.borderSubtle, marginLeft: 52 }} />
            )}
            renderItem={({ item }) => (
              <Pressable
                style={pickerStyles.row}
                onPress={() => onPick(item.placeId)}
                android_ripple={{ color: Colors.borderSubtle }}
              >
                <View style={pickerStyles.rowIcon}>
                  <Ionicons name="location" size={15} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={pickerStyles.rowName} numberOfLines={1}>{item.name}</Text>
                  <Text style={pickerStyles.rowAddress} numberOfLines={1}>{item.address}</Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              query.trim().length >= 2 ? (
                <View style={pickerStyles.emptyWrap}>
                  <Text style={pickerStyles.emptyText}>Aucun résultat</Text>
                </View>
              ) : (
                <View style={pickerStyles.emptyWrap}>
                  <Text style={pickerStyles.emptyText}>Tape au moins 2 caractères</Text>
                </View>
              )
            }
          />
        )}
      </View>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // Empty state — turned into a real "card" with a soft icon + inviting copy
  // to make the section feel like a starting point, not a void.
  emptyCard: {
    marginTop: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  emptyBody: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 17,
    textAlign: 'center',
  },

  // Default (= already has places) — outlined dashed button.
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: Colors.terracotta200,
    backgroundColor: 'transparent',
  },
  // Empty — promoted to a solid, inviting CTA.
  addBtnPrimary: {
    borderStyle: 'solid',
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
  },
  addBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  addBtnTextPrimary: {
    color: Colors.textOnAccent,
  },
});

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: Colors.bgTertiary,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  address: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  proposerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  proposerText: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },

  actions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  voteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth + 0.3,
    minWidth: 42,
    justifyContent: 'center',
  },
  voteCount: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
  },
  reorderRow: { flexDirection: 'row', gap: 2 },
  reorderBtn: {
    width: 24,
    height: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  reorderBtnDisabled: {
    opacity: 0.35,
  },
  removeBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const pickerStyles = StyleSheet.create({
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
  headerCenter: { flex: 1, alignItems: 'center' },
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 13,
    backgroundColor: Colors.bgTertiary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    padding: 0,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  rowAddress: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyWrap: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 13, fontFamily: Fonts.body, color: Colors.textSecondary },
});
