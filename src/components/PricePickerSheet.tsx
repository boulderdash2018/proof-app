import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';

// ──────────────────────────────────────────────────────────────
// Ranges — alignés sur PRICE_RANGES dans CreateScreen pour que
// l'index choisi ici match l'index attendu côté state du wizard.
// 0 = Gratuit, 1..5 = ranges payants. Pas d'index 6+ — au-delà,
// l'utilisateur saisit le montant exact via le champ optionnel.
// ──────────────────────────────────────────────────────────────

interface PriceRange {
  label: string;
  /** Affichage avec le symbole monnaie de la ville. */
  short: string;
  index: number;
}

const PRICE_PRESETS: PriceRange[] = [
  { label: 'Gratuit',    short: 'Gratuit',  index: 0 },
  { label: 'Moins de 15', short: '< 15',     index: 1 },
  { label: 'De 15 à 30',  short: '15–30',    index: 2 },
  { label: 'De 30 à 60',  short: '30–60',    index: 3 },
  { label: 'De 60 à 100', short: '60–100',   index: 4 },
  { label: 'Plus de 100', short: '100+',     index: 5 },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Index actuel dans PRICE_RANGES (-1 = vide). */
  currentRangeIndex?: number | null;
  /** Symbole monnaie (€, $…) pour l'affichage. */
  currency?: string;
  /** Persist le nouveau range. -1 pour clear. */
  onConfirm: (rangeIndex: number) => Promise<void>;
  /** Place name pour le sous-titre. */
  placeName?: string;
}

/**
 * PricePickerSheet — sélecteur rapide pour la fourchette de prix d'un
 * lieu. UX symétrique au DurationPickerSheet :
 *   • Tap sur un range = confirme + close, pas de bouton "Confirmer"
 *   • État "Gratuit" est un range comme un autre — l'utilisateur le
 *     choisit explicitement plutôt qu'il soit pré-sélectionné par défaut
 *   • Lien "Retirer la fourchette" si une valeur est déjà posée
 *
 * Utilisé en mode customize de CreateScreen pour remplacer le picker
 * inline (pills dans la zone expanded de la place card) par un sheet
 * plus dimensionné.
 */
export const PricePickerSheet: React.FC<Props> = ({
  visible, onClose, currentRangeIndex, currency = '€', onConfirm, placeName,
}) => {
  const [submittingIdx, setSubmittingIdx] = useState<number | null>(null);

  useEffect(() => {
    if (visible) setSubmittingIdx(null);
  }, [visible]);

  const apply = async (idx: number) => {
    if (submittingIdx !== null) return;
    setSubmittingIdx(idx);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await onConfirm(idx);
      onClose();
    } catch (err) {
      console.warn('[PricePickerSheet] persist failed:', err);
    } finally {
      setSubmittingIdx(null);
    }
  };

  const formatRange = (r: PriceRange): string => {
    if (r.index === 0) return 'Gratuit';
    if (r.index === 5) return `100${currency}+`;
    return `${r.short}${currency}`;
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
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="wallet-outline" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>COMBIEN ÇA COÛTE ?</Text>
              <Text style={styles.title} numberOfLines={1}>
                {placeName ? `Fourchette — ${placeName}` : 'Fourchette de prix'}
              </Text>
            </View>
          </View>

          <Text style={styles.helperText}>
            Indique combien tu as dépensé par personne pour ce lieu.
          </Text>

          {/* Range chips */}
          <View style={styles.chipGrid}>
            {PRICE_PRESETS.map((p) => {
              const isCurrent = currentRangeIndex === p.index;
              const isLoading = submittingIdx === p.index;
              return (
                <TouchableOpacity
                  key={p.index}
                  style={[styles.chip, isCurrent && styles.chipActive]}
                  onPress={() => apply(p.index)}
                  disabled={submittingIdx !== null}
                  activeOpacity={0.75}
                >
                  {isLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={isCurrent ? Colors.textOnAccent : Colors.primary}
                    />
                  ) : (
                    <Text style={[styles.chipText, isCurrent && styles.chipTextActive]}>
                      {formatRange(p)}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Clear override (only if a value is set) */}
          {typeof currentRangeIndex === 'number' && currentRangeIndex >= 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => apply(-1)}
              disabled={submittingIdx !== null}
              activeOpacity={0.7}
            >
              {submittingIdx === -1 ? (
                <ActivityIndicator size="small" color={Colors.textSecondary} />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.clearText}>Retirer la fourchette</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles — alignés sur DurationPickerSheet pour cohérence visuelle.
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 18,
    padding: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },
  helperText: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 16,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexGrow: 1,
    minWidth: 95,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  chipTextActive: {
    color: Colors.textOnAccent,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginTop: 10,
  },
  clearText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
});
