import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts } from '../constants';
import { CATEGORIES } from '../constants/categories';
import { useGuestStore } from '../store/guestStore';
import { useColors } from '../hooks/useColors';

const { width } = Dimensions.get('window');

const CITIES = [
  { name: 'Paris', emoji: '🗼', available: true },
  { name: 'Lyon', emoji: '🦁', available: false },
  { name: 'Marseille', emoji: '🌊', available: false },
  { name: 'Bordeaux', emoji: '🍷', available: false },
];

export const GuestSurveyScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const C = useColors();
  const completeSurvey = useGuestStore((s) => s.completeSurvey);

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCity, setSelectedCity] = useState('Paris');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const toggleInterest = (name: string) => {
    setSelectedInterests((prev) =>
      prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name]
    );
  };

  const handleFinish = () => {
    completeSurvey(selectedCity, selectedInterests);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, backgroundColor: C.white }]}>
      {/* Step indicator */}
      <View style={styles.stepRow}>
        <View style={[styles.stepDot, { backgroundColor: C.primary }]} />
        <View style={[styles.stepDot, { backgroundColor: step === 2 ? C.primary : C.border }]} />
      </View>

      {step === 1 ? (
        /* ───── STEP 1: CITY ───── */
        <View style={styles.content}>
          <Text style={[styles.title, { color: C.black }]}>Où es-tu ?</Text>
          <Text style={[styles.subtitle, { color: C.gray700 }]}>
            On te montre les meilleurs plans de ta ville
          </Text>

          <View style={styles.cityGrid}>
            {CITIES.map((city) => {
              const isSelected = selectedCity === city.name;
              return (
                <TouchableOpacity
                  key={city.name}
                  style={[
                    styles.cityCard,
                    {
                      backgroundColor: isSelected ? C.primary + '12' : C.gray200,
                      borderColor: isSelected ? C.primary : C.border,
                    },
                  ]}
                  onPress={() => city.available && setSelectedCity(city.name)}
                  activeOpacity={city.available ? 0.7 : 1}
                >
                  <Text style={styles.cityEmoji}>{city.emoji}</Text>
                  <Text style={[styles.cityName, { color: city.available ? C.black : C.gray600 }]}>
                    {city.name}
                  </Text>
                  {!city.available && (
                    <Text style={[styles.cityBadge, { color: C.gray600 }]}>bientôt</Text>
                  )}
                  {isSelected && (
                    <View style={[styles.cityCheck, { backgroundColor: C.primary }]}>
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: C.primary }]}
            onPress={() => setStep(2)}
          >
            <Text style={styles.btnText}>Continuer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => useGuestStore.getState().setWantsAuth(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.loginBtnText, { color: C.gray600 }]}>Déjà un compte ? <Text style={{ color: C.primary, fontWeight: '700' }}>Se connecter</Text></Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ───── STEP 2: INTERESTS ───── */
        <View style={styles.content}>
          <Text style={[styles.title, { color: C.black }]}>Tes centres d'intérêt</Text>
          <Text style={[styles.subtitle, { color: C.gray700 }]}>
            Choisis minimum 3 pour personnaliser ton feed
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.interestsGrid}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedInterests.includes(cat.name);
              return (
                <TouchableOpacity
                  key={cat.name}
                  style={[
                    styles.interestChip,
                    {
                      backgroundColor: isSelected ? C.primary + '15' : C.gray200,
                      borderColor: isSelected ? C.primary : C.border,
                    },
                  ]}
                  onPress={() => toggleInterest(cat.name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.interestEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[
                      styles.interestLabel,
                      { color: isSelected ? C.primary : C.black },
                    ]}
                  >
                    {cat.name}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={16} color={C.primary} style={{ marginLeft: 4 }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.bottomRow}>
            <TouchableOpacity onPress={() => setStep(1)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={C.gray700} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnFlex,
                {
                  backgroundColor: selectedInterests.length >= 3 ? C.primary : C.gray400,
                },
              ]}
              onPress={handleFinish}
              disabled={selectedInterests.length < 3}
            >
              <Text style={styles.btnText}>
                Commencer {selectedInterests.length >= 3 ? '' : `(${selectedInterests.length}/3)`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Layout.screenPadding },
  stepRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 30 },
  stepDot: { width: 28, height: 4, borderRadius: 2 },
  content: { flex: 1 },
  title: { fontSize: 26, fontFamily: Fonts.serifBold, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: Fonts.serif, textAlign: 'center', marginBottom: 30, lineHeight: 20 },

  // City cards
  cityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 30 },
  cityCard: {
    width: (width - Layout.screenPadding * 2 - 12) / 2,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    position: 'relative',
  },
  cityEmoji: { fontSize: 32, marginBottom: 8 },
  cityName: { fontSize: 16, fontFamily: Fonts.serifSemiBold },
  cityBadge: { fontSize: 10, fontFamily: Fonts.serif, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  cityCheck: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  // Interest chips
  interestsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 20 },
  interestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  interestEmoji: { fontSize: 18, marginRight: 8 },
  interestLabel: { fontSize: 13, fontFamily: Fonts.serifSemiBold, textTransform: 'capitalize' },

  // Buttons
  btn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 'auto', marginBottom: 12 },
  loginBtn: { alignItems: 'center', marginBottom: 30 },
  loginBtnText: { fontSize: 14, fontFamily: Fonts.serif },
  btnFlex: { flex: 1 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontFamily: Fonts.serifBold },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 'auto', marginBottom: 30 },
  backBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.gray200, alignItems: 'center', justifyContent: 'center' },
});
