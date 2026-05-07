import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts } from '../constants';
import { useTasteProfileStore } from '../store/tasteProfileStore';
import { OnboardingPrefs } from '../services/tasteProfileService';

/**
 * Taste onboarding — 4 micro-questions qui pèsent fort au cold start
 * (jusqu'à ~50 events captés via interactions normales) puis se
 * diluent. Le but : sortir l'algo du néant le 1ᵉʳ jour quand l'user
 * n'a encore ni saved, ni liké, ni rien fait.
 *
 * Toutes les questions sont skippables — l'user peut toutes les
 * laisser à null s'il préfère. L'algo retombera sur le scoring
 * standard (qui marche aussi sans onboarding, juste moins bon les
 * 5 premiers jours).
 *
 * Persisté via `useTasteProfileStore.setOnboardingPrefs` qui écrit
 * direct sur Firestore (pas debounced — c'est un event one-shot
 * important, on veut qu'il atteigne le serveur tout de suite).
 */
export const TasteOnboardingScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const setPrefs = useTasteProfileStore((s) => s.setOnboardingPrefs);
  const existing = useTasteProfileStore((s) => s.profile?.onboardingPrefs);

  const [purposes, setPurposes] = useState<string[]>(existing?.purposes || []);
  const [company, setCompany] = useState<OnboardingPrefs['company']>(existing?.company ?? null);
  const [style, setStyle] = useState<OnboardingPrefs['style']>(existing?.style ?? null);
  const [budget, setBudget] = useState<OnboardingPrefs['budget']>(existing?.budget ?? null);
  const [submitting, setSubmitting] = useState(false);

  const togglePurpose = (key: string) => {
    Haptics.selectionAsync().catch(() => {});
    setPurposes((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await setPrefs({ purposes, company, style, budget });
      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleSkip}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.skipText}>Plus tard</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>POUR MIEUX TE PROPOSER</Text>
        <Text style={styles.title}>
          4 questions{'\n'}<Text style={styles.titleAccent}>pour t'apprendre.</Text>
        </Text>
        <Text style={styles.subtitle}>
          Tes réponses guident l'algo le temps qu'on apprenne tes goûts.
          Tu peux les modifier dans tes paramètres après.
        </Text>

        {/* Q1 — Purposes (multi-select) */}
        <View style={styles.section}>
          <Text style={styles.questionLabel}>Pourquoi tu sors le plus souvent ?</Text>
          <Text style={styles.questionHint}>Plusieurs choix possibles</Text>
          <View style={styles.chipsWrap}>
            {[
              { key: 'eat', label: 'Manger', emoji: '🍽' },
              { key: 'drink', label: 'Boire un verre', emoji: '🍷' },
              { key: 'culture', label: 'Culture', emoji: '🎭' },
              { key: 'nature', label: 'Nature / extérieur', emoji: '🌿' },
              { key: 'shopping', label: 'Shopping', emoji: '🛍' },
              { key: 'sport', label: 'Sport / actif', emoji: '🏃' },
            ].map((opt) => {
              const active = purposes.includes(opt.key);
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => togglePurpose(opt.key)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.chipEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Q2 — Company (single-select) */}
        <View style={styles.section}>
          <Text style={styles.questionLabel}>Avec qui tu sors le plus ?</Text>
          <View style={styles.chipsWrap}>
            {[
              { key: 'solo', label: 'Solo' },
              { key: 'couple', label: 'En couple' },
              { key: 'friends', label: 'Avec des amis' },
              { key: 'family', label: 'En famille' },
            ].map((opt) => {
              const active = company === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setCompany(opt.key as any);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Q3 — Style (single-select) */}
        <View style={styles.section}>
          <Text style={styles.questionLabel}>Tu aimes...</Text>
          <View style={styles.chipsWrap}>
            {[
              { key: 'hidden', label: 'Spots cachés' },
              { key: 'iconic', label: 'Lieux iconiques' },
              { key: 'new', label: 'Nouveautés' },
              { key: 'safe', label: 'Valeurs sûres' },
            ].map((opt) => {
              const active = style === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setStyle(opt.key as any);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Q4 — Budget (single-select) */}
        <View style={styles.section}>
          <Text style={styles.questionLabel}>Ton budget habituel ?</Text>
          <View style={styles.chipsWrap}>
            {[
              { key: 'free', label: 'Gratos' },
              { key: 'low', label: 'Petit' },
              { key: 'medium', label: 'Moyen' },
              { key: 'high', label: 'Je gâte' },
            ].map((opt) => {
              const active = budget === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setBudget(opt.key as any);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable
          style={[styles.cta, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.ctaText}>
            {existing ? 'Mettre à jour' : 'Valider'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgSecondary,
  },
  skipText: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.textSecondary, paddingHorizontal: 8 },
  scroll: { paddingHorizontal: 22, paddingTop: 12 },
  eyebrow: {
    fontSize: 10.5, fontFamily: Fonts.bodySemiBold,
    color: Colors.primary, letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    fontSize: 32, fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary, letterSpacing: -0.5, lineHeight: 36,
  },
  titleAccent: { fontFamily: Fonts.displaySemiBoldItalic, color: Colors.primary },
  subtitle: {
    fontSize: 13.5, fontFamily: Fonts.body,
    color: Colors.textSecondary, lineHeight: 19,
    marginTop: 12, marginBottom: 24,
  },
  section: { marginBottom: 26 },
  questionLabel: {
    fontSize: 16, fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary, letterSpacing: -0.2,
  },
  questionHint: {
    fontSize: 11.5, fontFamily: Fonts.body,
    color: Colors.textTertiary, marginTop: 2, marginBottom: 12,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 99,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderMedium,
  },
  chipActive: {
    backgroundColor: Colors.terracotta100,
    borderColor: Colors.primary,
  },
  chipEmoji: { fontSize: 14 },
  chipText: {
    fontSize: 13, fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary, letterSpacing: -0.05,
  },
  chipTextActive: { color: Colors.terracotta700 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 22, paddingTop: 12,
    backgroundColor: Colors.bgPrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  cta: {
    height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  ctaText: {
    fontSize: 15, fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent, letterSpacing: 0.1,
  },
});
