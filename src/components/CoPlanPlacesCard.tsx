import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { ChatMessage, ConversationParticipant } from '../services/chatService';
import { CoPlanInlineVote } from './CoPlanInlineVote';
import { Avatar } from './Avatar';
import { fetchPlanDraft } from '../services/planDraftService';

interface Props {
  /** All `coplan_place_added` events in the same run (1 if singleton, N if grouped). */
  events: ChatMessage[];
  /** Group participants — used to resolve actor name + avatar. */
  participants?: Record<string, ConversationParticipant>;
  /** Current viewer — used by the inline vote to show "I voted" state. */
  voterUserId?: string;
}

/**
 * Grouped "place proposals" card rendered in the conversation when one or
 * more participants propose places via the workspace. Replaces the broken
 * left-aligned text rendering with a single visually-coherent card.
 *
 * Design intent (from product feedback):
 *   • Pas de numéros — espace qui respire
 *   • Le nom du lieu en Fraunces SemiBold (fort visuel)
 *   • Sous-titre dérivé "Café · 17e" en Inter gris
 *   • Cœur de vote inline à droite (CoPlanInlineVote existant)
 *   • Header "X a proposé N lieux" avec avatar + timestamp à droite
 *   • Carte beige clair, soft border, padding généreux
 *
 * Subtle entry animation : the whole card fades-in + slides-up 8px on
 * mount. No per-row stagger — overkill for what's just a list view.
 */
export const CoPlanPlacesCard: React.FC<Props> = ({ events, participants, voterUserId }) => {
  const navigation = useNavigation<any>();
  const enter = useRef(new Animated.Value(0)).current;

  // Legacy fallback: events posted before we started carrying
  // `placeGoogleId` on SystemEvent need a one-shot draft fetch to
  // resolve the Google ID by local placeId. Cached per draftId so
  // multiple legacy rows in the same card share the lookup.
  const [legacyMap, setLegacyMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const needsLegacy = events.some(
      (e) => e.systemEvent?.placeId && !e.systemEvent?.placeGoogleId,
    );
    if (!needsLegacy) return;
    const draftId = events.find((e) => e.systemEvent?.draftId)?.systemEvent?.draftId;
    if (!draftId) return;
    let cancelled = false;
    (async () => {
      const draft = await fetchPlanDraft(draftId);
      if (cancelled || !draft) return;
      const map: Record<string, string> = {};
      draft.proposedPlaces.forEach((p) => {
        if (p.googlePlaceId) map[p.id] = p.googlePlaceId;
      });
      if (Object.keys(map).length > 0) setLegacyMap(map);
    })();
    return () => { cancelled = true; };
  }, [events]);
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  if (events.length === 0) return null;

  const first = events[0];
  const ev = first.systemEvent;
  if (!ev) return null;

  const actorId = ev.actorId || first.senderId;
  const actor = participants?.[actorId];
  const actorName = actor?.displayName?.split(' ')[0] || 'Quelqu\'un';
  const count = events.length;

  // Header copy — pluralizes naturally for both singletons and groups.
  const headerVerb = count === 1
    ? 'a proposé un lieu'
    : `a proposé ${count} lieux`;

  const opacity = enter;
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <Animated.View style={[styles.cardWrap, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.card}>
        {/* ── Header : actor + verb + timestamp on the right ── */}
        <View style={styles.header}>
          {actor ? (
            <Avatar
              initials={actor.initials}
              bg={actor.avatarBg}
              color={actor.avatarColor}
              size="XS"
              avatarUrl={actor.avatarUrl ?? undefined}
            />
          ) : (
            <View style={styles.actorDotFallback} />
          )}
          <View style={styles.headerCopy}>
            <Text style={styles.headerText} numberOfLines={1}>
              <Text style={styles.headerActor}>{actorName}</Text>
              <Text style={styles.headerVerb}> {headerVerb}</Text>
            </Text>
          </View>
          <Text style={styles.headerTime}>{formatHHMM(first.createdAt)}</Text>
        </View>

        {/* Hairline divider — soft, breathing space */}
        <View style={styles.divider} />

        {/* ── Place rows : flawless minimal design, no numbers ──
            Tap a row → opens PlaceDetail modal (photos, Google reviews,
            Proof community ratings, related plans). The chevron → on
            the right is the affordance hint. */}
        <View style={styles.list}>
          {events.map((event, idx) => {
            const e = event.systemEvent!;
            const placeName = e.payload || 'Lieu';
            const meta = formatPlaceMeta(e.placeCategory, e.placeAddress);
            const showVote =
              !!e.draftId && !!e.placeId && !!voterUserId && e.actorId !== voterUserId;
            // Resolve Google ID — prefer the field on the event, fall back
            // to the lookup map for legacy events posted before this field
            // existed.
            const resolvedGoogleId = e.placeGoogleId || (e.placeId ? legacyMap[e.placeId] : undefined);
            const canOpenDetail = !!resolvedGoogleId;

            const handleOpenDetail = () => {
              if (!resolvedGoogleId) return;
              navigation.navigate('PlaceDetail', { googlePlaceId: resolvedGoogleId });
            };

            return (
              <Pressable
                key={event.id}
                style={({ pressed }) => [
                  styles.row,
                  idx === events.length - 1 && styles.rowLast,
                  pressed && canOpenDetail && styles.rowPressed,
                ]}
                onPress={handleOpenDetail}
                disabled={!canOpenDetail}
                accessibilityRole={canOpenDetail ? 'button' : undefined}
                accessibilityLabel={canOpenDetail ? `Voir les détails de ${placeName}` : undefined}
              >
                <View style={styles.rowText}>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {placeName}
                  </Text>
                  {meta && (
                    <Text style={styles.placeMeta} numberOfLines={1}>
                      {meta}
                    </Text>
                  )}
                </View>
                {showVote && (
                  <CoPlanInlineVote
                    draftId={e.draftId!}
                    placeId={e.placeId!}
                    voterUserId={voterUserId!}
                  />
                )}
                {canOpenDetail && (
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={Colors.textTertiary}
                    style={styles.chevron}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════════════════
// Helpers — category translation + arrondissement extraction
// ══════════════════════════════════════════════════════════════

/** Google Place primary types → French human label. Conservative
 *  mapping; unknown types fall back to a Title-cased version of the raw. */
const CATEGORIES_FR: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  bakery: 'Boulangerie',
  pastry_shop: 'Pâtisserie',
  museum: 'Musée',
  art_gallery: 'Galerie',
  park: 'Parc',
  bookstore: 'Librairie',
  movie_theater: 'Cinéma',
  night_club: 'Club',
  food: 'Restaurant',
  meal_takeaway: 'Restaurant',
  meal_delivery: 'Restaurant',
  point_of_interest: 'Lieu',
  tourist_attraction: 'Attraction',
  store: 'Boutique',
  clothing_store: 'Boutique',
  shopping_mall: 'Centre commercial',
  spa: 'Spa',
  gym: 'Salle de sport',
  library: 'Bibliothèque',
  church: 'Église',
  zoo: 'Zoo',
  aquarium: 'Aquarium',
  amusement_park: 'Parc d\'attractions',
};

const formatPlaceCategory = (raw?: string): string | null => {
  if (!raw) return null;
  const key = raw.toLowerCase();
  const fr = CATEGORIES_FR[key];
  if (fr) return fr;
  // Fallback : Title-case the raw type (e.g. "spa_resort" → "Spa resort").
  const cleaned = raw.replace(/_/g, ' ').toLowerCase();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

/** Extract the Paris arrondissement from an address. Returns "1er" /
 *  "17e" / null if no Paris postcode found. */
const extractArrondissement = (address?: string): string | null => {
  if (!address) return null;
  const match = address.match(/\b75(\d{3})\b/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (num < 1 || num > 20) return null;
  return num === 1 ? '1er' : `${num}e`;
};

const formatPlaceMeta = (category?: string, address?: string): string | null => {
  const cat = formatPlaceCategory(category);
  const arr = extractArrondissement(address);
  const parts = [cat, arr].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : null;
};

const formatHHMM = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  cardWrap: {
    marginHorizontal: 14,
    marginVertical: 6,
  },
  card: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  actorDotFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerText: {
    fontSize: 13.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    letterSpacing: -0.05,
  },
  headerActor: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  headerVerb: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  headerTime: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    letterSpacing: 0.1,
  },

  // Divider — dashed, subtle, breathes
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderSubtle,
    marginVertical: 12,
  },

  // Place list
  list: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginHorizontal: -4, // negate the press-state padding shift
    borderRadius: 8,
    gap: 12,
  },
  rowLast: {
    paddingBottom: 4,
  },
  rowPressed: {
    backgroundColor: Colors.bgPrimary,
  },
  chevron: {
    marginLeft: -4,
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  placeName: {
    fontSize: 15,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  placeMeta: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
    letterSpacing: 0.05,
  },
});
