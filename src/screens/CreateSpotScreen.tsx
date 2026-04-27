import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Pressable,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts } from '../constants';
import { useAuthStore } from '../store';
import { useCity } from '../hooks/useCity';
import {
  searchPlacesAutocomplete,
  getPlaceDetails,
} from '../services/googlePlacesService';
import {
  createSpot,
  validateQuote,
  QUOTE_MIN,
  QUOTE_MAX,
} from '../services/spotsService';
import { SpotCard } from '../components/SpotCard';
import { Spot } from '../types';

/**
 * CreateSpotScreen — flow de création d'un Spot.
 *
 * Layout volontairement éditorial : pas de stepper formaliste, juste
 * deux blocs verticaux (Lieu + Phrase) puis un aperçu live de la carte
 * telle qu'elle apparaîtra dans le feed. L'utilisateur voit ce qu'il
 * publie avant de valider — confiance + désir de soigner la phrase.
 *
 * Connectivité couverte :
 *   • Place picker = autocomplete Google Places (réutilise l'infra
 *     déjà câblée pour CoPlanPlacesSection)
 *   • Quote input = textarea avec compteur live, validation 30-180
 *     côté UI ET côté Firestore rule (defense-in-depth)
 *   • Aperçu live = mounter une instance de SpotCard avec un Spot
 *     fabriqué localement, mêmes tap-zones, même flip — what you see
 *     is exactement what you get
 *   • Publication = createSpot() service, success → navigation back
 *
 * Pas de cap mensuel enforce ici (décision produit en beta — on en
 * laisse poster beaucoup pour tester). Le helper countMySpotsThisMonth
 * existe dans le service pour l'activer plus tard.
 */
export const CreateSpotScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const cityConfig = useCity();

  // ── State ──
  const [pickedPlace, setPickedPlace] = useState<PickedPlace | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quote, setQuote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Validations ──
  const quoteValidation = useMemo(() => validateQuote(quote), [quote]);
  const canSubmit = !!pickedPlace && quoteValidation.ok && !submitting && !!user?.id;

  // ── Aperçu : Spot mocké pour le SpotCard preview ──
  const previewSpot: Spot | null = useMemo(() => {
    if (!pickedPlace || !user) return null;
    return {
      id: 'preview',
      recommenderId: user.id,
      recommenderName: user.displayName,
      recommenderUsername: user.username,
      recommenderAvatarUrl: user.avatarUrl ?? null,
      recommenderAvatarBg: user.avatarBg,
      recommenderAvatarColor: user.avatarColor,
      recommenderInitials: user.initials,
      googlePlaceId: pickedPlace.googlePlaceId,
      placeName: pickedPlace.name,
      placeCategory: pickedPlace.category,
      placeAddress: pickedPlace.address,
      photoUrl: pickedPlace.photoUrl,
      latitude: pickedPlace.latitude,
      longitude: pickedPlace.longitude,
      quote: quote.trim() || 'Ta phrase apparaîtra ici quand tu auras commencé à écrire.',
      savedByIds: [],
      city: cityConfig.name,
      createdAt: new Date().toISOString(),
      timeAgo: 'à l\'instant',
    };
  }, [pickedPlace, user, quote, cityConfig.name]);

  // ── Handlers ──
  const handlePickPlace = useCallback(async (placeId: string) => {
    setPickerOpen(false);
    try {
      const details = await getPlaceDetails(placeId);
      if (!details) {
        setSubmitError('Impossible de récupérer ce lieu, réessaye.');
        return;
      }
      setPickedPlace({
        googlePlaceId: details.placeId,
        name: details.name,
        address: details.address,
        category: details.types?.[0],
        photoUrl: details.photoUrls[0] || null,
        latitude: details.latitude,
        longitude: details.longitude,
      });
      setSubmitError(null);
    } catch (err) {
      console.warn('[CreateSpotScreen] getPlaceDetails error:', err);
      setSubmitError('Erreur lors du chargement du lieu.');
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !pickedPlace || !user) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createSpot({
        recommenderId: user.id,
        recommenderName: user.displayName,
        recommenderUsername: user.username,
        recommenderAvatarUrl: user.avatarUrl ?? null,
        recommenderAvatarBg: user.avatarBg,
        recommenderAvatarColor: user.avatarColor,
        recommenderInitials: user.initials,
        googlePlaceId: pickedPlace.googlePlaceId,
        placeName: pickedPlace.name,
        placeCategory: pickedPlace.category,
        placeAddress: pickedPlace.address,
        photoUrl: pickedPlace.photoUrl,
        latitude: pickedPlace.latitude,
        longitude: pickedPlace.longitude,
        quote: quote.trim(),
        city: cityConfig.name,
      });
      // Success — back to where the user came from.
      navigation.goBack();
    } catch (err: any) {
      const msg = err?.message || 'La publication a échoué, réessaye.';
      console.warn('[CreateSpotScreen] createSpot error:', err);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, pickedPlace, user, quote, cityConfig.name, navigation]);

  const remaining = QUOTE_MAX - quote.trim().length;
  const counterColor =
    quote.trim().length === 0 ? Colors.textTertiary :
    quoteValidation.ok ? Colors.success :
    quote.trim().length > QUOTE_MAX ? Colors.error : Colors.textTertiary;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.headerBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>NOUVEAU SPOT</Text>
          <Text style={styles.headerTitle}>Recommande un lieu</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Bloc 1 : place picker ── */}
          <View style={styles.block}>
            <Text style={styles.blockEyebrow}>01 · LE LIEU</Text>
            <Text style={styles.blockTitle}>Quel endroit veux-tu recommander ?</Text>
            <Text style={styles.blockHint}>
              Restau, café, expo, librairie, parc — n'importe quel lieu Google Maps.
            </Text>

            {pickedPlace ? (
              <TouchableOpacity
                style={styles.pickedCard}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.85}
              >
                <View style={styles.pickedIconWrap}>
                  <Ionicons name="location" size={18} color={Colors.primary} />
                </View>
                <View style={styles.pickedBody}>
                  <Text style={styles.pickedName} numberOfLines={1}>
                    {pickedPlace.name}
                  </Text>
                  <Text style={styles.pickedAddress} numberOfLines={1}>
                    {pickedPlace.address}
                  </Text>
                </View>
                <Ionicons name="swap-horizontal" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.pickerCta}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="search" size={17} color={Colors.primary} />
                <Text style={styles.pickerCtaText}>Chercher un lieu</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Bloc 2 : quote input ── */}
          <View style={styles.block}>
            <Text style={styles.blockEyebrow}>02 · TA PHRASE</Text>
            <Text style={styles.blockTitle}>Pourquoi ce lieu, en une phrase.</Text>
            <Text style={styles.blockHint}>
              Sois personnel, punchy, mémorable. C'est ça qui donnera envie d'y aller.
            </Text>

            <TextInput
              style={[
                styles.quoteInput,
                quoteValidation.ok && styles.quoteInputOk,
                quote.trim().length > QUOTE_MAX && styles.quoteInputOver,
              ]}
              placeholder="« Le seul endroit à Paris qui me donne l'impression d'être à Naples le dimanche matin. »"
              placeholderTextColor={Colors.textTertiary}
              value={quote}
              onChangeText={setQuote}
              multiline
              maxLength={QUOTE_MAX + 30}
              autoCorrect
              returnKeyType="default"
            />

            <View style={styles.counterRow}>
              <Text style={[styles.counterText, { color: counterColor }]}>
                {quote.trim().length === 0
                  ? `${QUOTE_MIN} caractères minimum`
                  : quoteValidation.ok
                    ? `${remaining} caractères restants ✓`
                    : quote.trim().length < QUOTE_MIN
                      ? `Encore ${QUOTE_MIN - quote.trim().length} caractères`
                      : `${quote.trim().length - QUOTE_MAX} de trop`}
              </Text>
            </View>
          </View>

          {/* ── Bloc 3 : aperçu live ── */}
          {previewSpot && (
            <View style={styles.block}>
              <Text style={styles.blockEyebrow}>03 · APERÇU LIVE</Text>
              <Text style={styles.blockTitle}>C'est ce que les autres verront.</Text>
              <Text style={styles.blockHint}>
                Tape la carte pour la retourner, comme dans le feed.
              </Text>

              <View style={styles.previewWrap}>
                <SpotCard spot={previewSpot} />
              </View>
            </View>
          )}

          {/* Erreur de submit */}
          {submitError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={15} color={Colors.error} />
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Bottom CTA bar ── */}
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.textOnAccent} />
            ) : (
              <>
                <Ionicons
                  name="paper-plane"
                  size={16}
                  color={canSubmit ? Colors.textOnAccent : Colors.textTertiary}
                />
                <Text
                  style={[
                    styles.ctaText,
                    !canSubmit && styles.ctaTextDisabled,
                  ]}
                >
                  Publier le spot
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Place picker modal — autocomplete Google Places ── */}
      <PlacePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickPlace}
      />
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// PlacePickerModal — autocomplete Google
// (Mêmes patterns que CoPlanPlacesSection.PlacePickerModal —
// dupliqué localement pour rester découplé.)
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

  // Debounced autocomplete
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
            <Text style={pickerStyles.eyebrow}>CHERCHER</Text>
            <Text style={pickerStyles.title}>Lieu Google Maps</Text>
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
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
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
// Types locaux + styles
// ══════════════════════════════════════════════════════════════

interface PickedPlace {
  googlePlaceId: string;
  name: string;
  address: string;
  category?: string;
  photoUrl?: string | null;
  latitude?: number;
  longitude?: number;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  flex: { flex: 1 },

  // Header
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
  headerEyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },

  // Scroll content
  scroll: { paddingHorizontal: 16, paddingTop: 24 },

  // Bloc éditorial (1 par section)
  block: { marginBottom: 32 },
  blockEyebrow: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    marginBottom: 8,
  },
  blockTitle: {
    fontSize: 22,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 27,
    marginBottom: 6,
  },
  blockHint: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
  },

  // Place picker CTA
  pickerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: Colors.terracotta200,
    backgroundColor: 'transparent',
  },
  pickerCtaText: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },

  // Picked place card
  pickedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
  },
  pickedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickedBody: { flex: 1, minWidth: 0 },
  pickedName: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  pickedAddress: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Quote textarea
  quoteInput: {
    minHeight: 110,
    maxHeight: 200,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },
  quoteInputOk: {
    borderColor: Colors.success,
  },
  quoteInputOver: {
    borderColor: Colors.error,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  counterText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    letterSpacing: 0.05,
  },

  // Preview wrap (négate les marges horizontales du SpotCard pour
  // qu'il occupe la pleine largeur du bloc)
  previewWrap: {
    marginHorizontal: -14,
  },

  // Error box
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.errorBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.errorBorder,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.error,
  },

  // CTA bar (sticky bottom)
  ctaBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.bgPrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaDisabled: {
    backgroundColor: Colors.bgTertiary,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaText: {
    fontSize: 14.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },
  ctaTextDisabled: {
    color: Colors.textTertiary,
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
