import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';
import { DoItNowTransport, TransportMode, Plan, Place } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (transport: DoItNowTransport) => void;
  recommendedTransport?: TransportMode;
  authorName?: string;
  loading?: boolean;
  /** The plan the user is about to start — used to compute stats (nb steps, distance, per-mode durations). */
  plan?: Plan;
  /** Optional weather line shown at the bottom. Falls back to a generic pleasant message. */
  weatherHint?: string;
}

// ── Transport options with a mode descriptor (shown on selected card) ──────
const TRANSPORT_OPTIONS: {
  key: DoItNowTransport;
  label: string;
  icon: string;
  descriptor: string;
}[] = [
  { key: 'walking',   label: 'À pied',  icon: 'walk-outline',    descriptor: 'SLOW' },
  { key: 'bicycling', label: 'Vélo',    icon: 'bicycle-outline', descriptor: 'MEDIUM' },
  { key: 'transit',   label: 'Métro',   icon: 'train-outline',   descriptor: 'FAST' },
  { key: 'driving',   label: 'Voiture', icon: 'car-outline',     descriptor: 'FAST' },
];

const TRANSPORT_MAP: Record<TransportMode, DoItNowTransport> = {
  'À pied':      'walking',
  'Métro':       'transit',
  'Vélo':        'bicycling',
  'Voiture':     'driving',
  'Trottinette': 'walking',
};

// Average city speeds (km/h) — tuned for urban context incl. stops/waits.
const SPEEDS_KMH: Record<DoItNowTransport, number> = {
  walking:   4.5,
  bicycling: 15,
  transit:   18,
  driving:   22,
};

/** Haversine distance between two lat/lng points, in km. */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function totalDistanceKm(places: Place[]): number {
  let km = 0;
  for (let i = 0; i < places.length - 1; i++) {
    const a = places[i];
    const b = places[i + 1];
    if (a.latitude && a.longitude && b.latitude && b.longitude) {
      km += haversineKm(
        { lat: a.latitude, lng: a.longitude },
        { lat: b.latitude, lng: b.longitude },
      );
    }
  }
  return km;
}

function estimateMinutes(km: number, mode: DoItNowTransport): number {
  if (km <= 0) return 0;
  return Math.max(1, Math.round((km / SPEEDS_KMH[mode]) * 60));
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes} MIN`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}H${m.toString().padStart(2, '0')}` : `${h}H`;
}

function formatKm(km: number): string {
  if (km < 0.1) return '0,1';
  return km.toFixed(1).replace('.', ',');
}

/** Mini prose hint under the stats, based on the recommended mode. */
function modeHint(rec?: TransportMode): string {
  switch (rec) {
    case 'À pied':
      return "À pied, tu gagnes le meilleur d'une journée — les vitrines, les odeurs.";
    case 'Vélo':
      return 'À vélo, tu couvres plus de terrain sans perdre la sensation de la ville.';
    case 'Métro':
      return "En métro, tu enchaines les lieux sans souffler. Parfait pour les journées chargées.";
    case 'Voiture':
      return 'En voiture, la logistique devient triviale — bagages, enfants, sorties éloignées.';
    case 'Trottinette':
      return "En trottinette, le compromis parfait entre vitesse et liberté.";
    default:
      return 'Choisis ce qui te va le mieux — chaque mode change la texture de la journée.';
  }
}

export const TransportChooser: React.FC<Props> = ({
  visible,
  onClose,
  onSelect,
  recommendedTransport,
  loading,
  plan,
  weatherHint,
}) => {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<DoItNowTransport | null>(null);

  const recommendedKey: DoItNowTransport | undefined = recommendedTransport
    ? TRANSPORT_MAP[recommendedTransport]
    : undefined;

  // Pre-select the recommended mode when the sheet opens.
  useEffect(() => {
    if (visible) {
      setSelected(recommendedKey ?? null);
    }
  }, [visible, recommendedKey]);

  // Stats from the plan (if provided).
  const stats = useMemo(() => {
    if (!plan || !plan.places || plan.places.length === 0) {
      return { nbSteps: 0, km: 0, durations: {} as Record<DoItNowTransport, number> };
    }
    const km = totalDistanceKm(plan.places);
    const durations: Record<DoItNowTransport, number> = {
      walking: estimateMinutes(km, 'walking'),
      bicycling: estimateMinutes(km, 'bicycling'),
      transit: estimateMinutes(km, 'transit'),
      driving: estimateMinutes(km, 'driving'),
    };
    return { nbSteps: plan.places.length, km, durations };
  }, [plan?.id, plan?.places?.length]);

  const subtitleHint = modeHint(recommendedTransport);
  const fallbackWeather = '19°C, léger vent. Météo agréable pour sortir.';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: Colors.bgPrimary, paddingTop: insets.top + 4 }]}>
        {/* Top bar — back only */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Overline */}
          <Text style={styles.overline}>— ÉTAPE 1 / 4 · PRÉPARATION</Text>

          {/* Editorial title */}
          <Text style={styles.title}>
            Comment{'\n'}
            <Text style={styles.titleItalic}>tu te déplaces</Text> ?
          </Text>

          {/* Subtitle with stats */}
          <Text style={styles.subtitle}>
            {stats.nbSteps > 0 ? (
              <>
                <Text style={styles.subtitleStrong}>
                  {stats.nbSteps} étape{stats.nbSteps > 1 ? 's' : ''} · {formatKm(stats.km)} km au total.
                </Text>{' '}
              </>
            ) : null}
            {subtitleHint}
          </Text>

          {/* Transport options */}
          <View style={styles.options}>
            {TRANSPORT_OPTIONS.map((opt) => {
              const isSelected = selected === opt.key;
              const isRecommended = opt.key === recommendedKey;
              const mins = stats.durations[opt.key] ?? 0;
              const durationText = formatDuration(mins);

              // Rich descriptor only on the selected card: "1H02 · SLOW — RECOMMANDÉ"
              const richLabel = isSelected
                ? `${durationText} · ${opt.descriptor}${isRecommended ? ' — RECOMMANDÉ' : ''}`
                : durationText;

              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.optionCard,
                    isSelected
                      ? {
                          backgroundColor: Colors.bgSecondary,
                          borderColor: Colors.primary,
                        }
                      : {
                          backgroundColor: Colors.bgTertiary,
                          borderColor: 'transparent',
                        },
                  ]}
                  onPress={() => setSelected(opt.key)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.optionIconWrap,
                      {
                        backgroundColor: isSelected
                          ? Colors.terracotta100
                          : 'rgba(44, 36, 32, 0.06)',
                      },
                    ]}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={20}
                      color={isSelected ? Colors.primary : Colors.textSecondary}
                    />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, { color: Colors.textPrimary }]}>
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        styles.optionDuration,
                        { color: isSelected ? Colors.primary : Colors.textSecondary },
                      ]}
                    >
                      {richLabel}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={[styles.checkWrap, { backgroundColor: Colors.primary }]}>
                      <Ionicons name="checkmark" size={14} color={Colors.textOnAccent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Weather hint */}
          <View style={[styles.weatherCard, { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}>
            <Text style={styles.weatherIcon}>🌤️</Text>
            <Text style={[styles.weatherText, { color: Colors.textSecondary }]}>
              {weatherHint ?? fallbackWeather}
            </Text>
          </View>
        </ScrollView>

        {/* Footer CTA */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 14, borderTopColor: Colors.borderSubtle }]}>
          <TouchableOpacity
            style={[
              styles.goBtn,
              {
                backgroundColor:
                  selected && !loading ? Colors.primary : Colors.borderMedium,
              },
            ]}
            onPress={() => selected && !loading && onSelect(selected)}
            disabled={!selected || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.textOnAccent} size="small" />
            ) : (
              <>
                <Text style={styles.goBtnText}>C'est parti !</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.textOnAccent} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },

  overline: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 34,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
    lineHeight: 40,
    marginTop: 12,
  },
  titleItalic: {
    fontFamily: Fonts.displaySemiBoldItalic,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginTop: 14,
  },
  subtitleStrong: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },

  options: {
    marginTop: 22,
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
  },
  optionDuration: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  checkWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  weatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  weatherIcon: {
    fontSize: 18,
  },
  weatherText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: Fonts.body,
    lineHeight: 17,
  },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  goBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 16,
  },
  goBtnText: {
    color: Colors.textOnAccent,
    fontSize: 16,
    fontFamily: Fonts.bodySemiBold,
  },
});
