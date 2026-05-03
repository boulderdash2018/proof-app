import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput as RNTextInput,
  TouchableOpacity,
} from 'react-native';
import { Colors, Fonts } from '../../constants';

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Validation min — affichage du hint "Au moins X caractères". */
  minChars?: number;
  /** Validation max — coupe l'input + affiche le compteur. */
  maxChars?: number;
  /** Override du placeholder (par défaut : suggestion classique). */
  placeholder?: string;
  /** Override de l'overline ("LA SIGNATURE DU CRÉATEUR"). */
  overline?: string;
  /** Override du titre ("Partage ton conseil"). */
  title?: string;
  /** Override du sous-titre. */
  subtitle?: string;
  /** Override des inspirations cliquables (3 par défaut). */
  suggestions?: string[];
  /** autoFocus l'input à l'apparition (default true). */
  autoFocus?: boolean;
}

const DEFAULT_SUGGESTIONS = [
  'Le meilleur moment, c\'est vers 18h quand la lumière est dingue',
  'Demande le menu caché au bar, ils ont des plats non listés',
  'Réserve la table du fond, c\'est la plus intime',
];

/**
 * CreatorTipInput — bloc "signature du créateur" avec suggestions
 * cliquables. Extrait de CreateScreen step 5 pour être partagé entre :
 *   • CreateScreen (création de plan classique)
 *   • CoPlanPublishScreen (publication post-exécution co-plan)
 *
 * Le rendu est exactement le même qu'avant — seuls les props ouvrent la
 * possibilité de surcharger le titre/subtitle/suggestions selon le
 * contexte d'utilisation. Les valeurs par défaut sont celles du flow
 * "Création de plan" historique.
 */
export const CreatorTipInput: React.FC<Props> = ({
  value,
  onChange,
  minChars = 10,
  maxChars = 180,
  placeholder = "Le secret, c'est d'y aller en semaine au coucher du soleil...",
  overline = 'LA SIGNATURE DU CRÉATEUR',
  title = 'Partage ton conseil',
  subtitle = "Une phrase que toi seul(e) peux dire. Ce qui rend ce plan spécial, le détail qu'on ne trouve pas sur Google.",
  suggestions = DEFAULT_SUGGESTIONS,
  autoFocus = true,
}) => {
  const trimmedLen = value.trim().length;
  const tooShort = trimmedLen < minChars;
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.overline}>{overline}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.inputWrap}>
        <Text style={styles.quoteMark}>&ldquo;</Text>
        <RNTextInput
          style={styles.input}
          value={value}
          onChangeText={(v) => onChange(v.slice(0, maxChars))}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          multiline
          autoFocus={autoFocus}
          maxLength={maxChars}
          textAlignVertical="top"
        />
        <View style={styles.footerRow}>
          <Text style={[styles.hint, !tooShort && { color: Colors.primary }]}>
            {tooShort ? `Au moins ${minChars} caractères` : 'Parfait ✓'}
          </Text>
          <Text style={styles.count}>{value.length} / {maxChars}</Text>
        </View>
      </View>

      <View style={styles.suggestions}>
        <Text style={styles.suggestionsLabel}>Inspirations</Text>
        {suggestions.map((sug) => (
          <TouchableOpacity
            key={sug}
            style={styles.suggestionChip}
            onPress={() => onChange(sug)}
            activeOpacity={0.7}
          >
            <Text style={styles.suggestionText} numberOfLines={1}>{sug}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles — copiés à l'identique de CreateScreen.tsx (tipHeader,
// tipOverline, tipTitle, etc.) pour conserver le rendu pixel-perfect.
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  header: {
    marginBottom: 18,
  },
  overline: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  inputWrap: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1.5,
    borderColor: Colors.terracotta200,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: 'rgba(44, 36, 32, 1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  quoteMark: {
    fontSize: 38,
    lineHeight: 38,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.terracotta400,
    marginBottom: -8,
  },
  input: {
    fontSize: 17,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textPrimary,
    lineHeight: 24,
    minHeight: 90,
    paddingTop: 4,
    paddingHorizontal: 0,
    paddingBottom: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  hint: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
  count: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
  suggestions: {
    gap: 6,
  },
  suggestionsLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
  },
  suggestionText: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textSecondary,
  },
});
