import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useCoPlanStore } from '../store/coPlanStore';
import { optimizeRoute, MAX_OPTIMIZABLE_PLACES, OptimizeRouteResult } from '../services/routeOptimizer';

/**
 * "TRAJET" section — on-demand route optimizer.
 *
 * User taps "Calculer le trajet optimal" → we fetch a pairwise duration
 * matrix from Google Directions and brute-force the best visit order
 * (starting from the first proposed place). Result displayed as the
 * ordered list + total walking duration ; "Appliquer cet ordre" updates
 * the draft's orderIndex map.
 *
 * Kept deliberately on-demand (not auto-recompute on every edit) to keep
 * Google API costs bounded and give the user visible agency.
 */
export const CoPlanRouteSection: React.FC = () => {
  const draft = useCoPlanStore((s) => s.draft);
  const places = useCoPlanStore((s) => s.getSortedPlaces());
  // We mutate orderIndex directly via movePlace calls in sequence.
  const movePlace = useCoPlanStore((s) => s.movePlace);

  const [isComputing, setIsComputing] = useState(false);
  const [result, setResult] = useState<OptimizeRouteResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Compute a signature so we can invalidate result when places change.
  const signature = useMemo(
    () => places.map((p) => p.id).join('|'),
    [places],
  );

  // Invalidate result if places change.
  React.useEffect(() => {
    setResult(null);
  }, [signature]);

  const placesWithCoords = places.filter((p) => p.latitude != null && p.longitude != null);

  const canOptimize = placesWithCoords.length >= 2 && placesWithCoords.length <= MAX_OPTIMIZABLE_PLACES;

  const handleCompute = async () => {
    if (!canOptimize || isComputing) return;
    setIsComputing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const r = await optimizeRoute(
        placesWithCoords.map((p) => ({
          id: p.id,
          lat: p.latitude!,
          lng: p.longitude!,
        })),
        'walking',
      );
      setResult(r);
    } catch (err) {
      console.warn('[CoPlanRouteSection] optimize error:', err);
    } finally {
      setIsComputing(false);
    }
  };

  const handleApply = async () => {
    if (!result || !draft || isApplying) return;
    setIsApplying(true);
    try {
      // Apply the ordered ids by reassigning orderIndex sequentially.
      // The simpler approach — rebuild proposedPlaces in the new order —
      // is done via the service directly to avoid N move-operations.
      // Here we optimistically reorder via a series of movePlace calls
      // so the live UI animates + Firestore stays in sync.
      const currentIds = places.map((p) => p.id);
      const targetIds = result.orderedIds;

      // Simple bubble-like reordering : walk target left to right,
      // for each desired position, if the id is not already there, move it up.
      const working = [...currentIds];
      for (let target = 0; target < targetIds.length; target++) {
        const want = targetIds[target];
        const have = working.indexOf(want);
        if (have === target) continue;
        // Bring it up to target via successive "up" moves.
        let cur = have;
        while (cur > target) {
          // eslint-disable-next-line no-await-in-loop
          await movePlace(want, 'up');
          // update the working array mirror
          [working[cur - 1], working[cur]] = [working[cur], working[cur - 1]];
          cur -= 1;
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // After apply the result is "consumed" — clear so user sees the fresh order.
      setResult(null);
    } catch (err) {
      console.warn('[CoPlanRouteSection] apply error:', err);
    } finally {
      setIsApplying(false);
    }
  };

  // ── Empty / gated states ─────────────────────

  if (places.length < 2) {
    return (
      <View style={styles.hintBox}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.textTertiary} />
        <Text style={styles.hintText}>
          Ajoute au moins 2 lieux pour optimiser un trajet.
        </Text>
      </View>
    );
  }

  if (placesWithCoords.length < 2) {
    return (
      <View style={styles.hintBox}>
        <Ionicons name="warning-outline" size={14} color={Colors.warning} />
        <Text style={styles.hintText}>
          Certains lieux n'ont pas de coordonnées — la recherche Google devrait les fournir, essaie de re-proposer les lieux.
        </Text>
      </View>
    );
  }

  if (places.length > MAX_OPTIMIZABLE_PLACES) {
    return (
      <View style={styles.hintBox}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.textTertiary} />
        <Text style={styles.hintText}>
          L'optimisation est limitée à {MAX_OPTIMIZABLE_PLACES} lieux max. Retire-en quelques-uns ou organise à la main.
        </Text>
      </View>
    );
  }

  // ── Main UI ──────────────────────────────────

  return (
    <View>
      {!result ? (
        <TouchableOpacity
          style={[styles.computeBtn, { opacity: isComputing ? 0.7 : 1 }]}
          onPress={handleCompute}
          disabled={isComputing}
          activeOpacity={0.85}
        >
          {isComputing ? (
            <>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.computeBtnText}>Calcul en cours…</Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles-outline" size={15} color={Colors.primary} />
              <Text style={styles.computeBtnText}>Calculer le trajet optimal</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View>
          {/* Result recap */}
          <View style={styles.resultHeader}>
            <View style={styles.resultBadge}>
              <Ionicons name="walk" size={12} color={Colors.textOnAccent} />
              <Text style={styles.resultBadgeText}>{result.totalDurationText}</Text>
            </View>
            <Text style={styles.resultDist}>
              {(result.totalDistanceMeters / 1000).toFixed(1)} km de trajet
            </Text>
          </View>

          {/* Ordered steps preview */}
          <View style={styles.stepsWrap}>
            {result.orderedIds.map((id, i) => {
              const place = places.find((p) => p.id === id);
              if (!place) return null;
              return (
                <View key={id} style={styles.stepRow}>
                  <View style={styles.stepIndex}>
                    <Text style={styles.stepIndexText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepName} numberOfLines={1}>{place.name}</Text>
                </View>
              );
            })}
          </View>

          {/* Apply / Dismiss */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => setResult(null)}
              activeOpacity={0.7}
              disabled={isApplying}
            >
              <Text style={styles.dismissBtnText}>Ignorer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyBtn, { opacity: isApplying ? 0.7 : 1 }]}
              onPress={handleApply}
              activeOpacity={0.85}
              disabled={isApplying}
            >
              {isApplying ? (
                <ActivityIndicator size="small" color={Colors.textOnAccent} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={14} color={Colors.textOnAccent} />
                  <Text style={styles.applyBtnText}>Appliquer cet ordre</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 17,
  },

  // Compute button
  computeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: Colors.terracotta200,
    backgroundColor: 'transparent',
  },
  computeBtnText: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },

  // Result
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  resultBadgeText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
  resultDist: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },

  stepsWrap: {
    backgroundColor: Colors.bgPrimary,
    borderRadius: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    gap: 8,
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: {
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    color: Colors.primaryDeep,
  },
  stepName: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  dismissBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  dismissBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },
  applyBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  applyBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
});
