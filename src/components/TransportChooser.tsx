import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';
import { DoItNowTransport, TransportMode } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (transport: DoItNowTransport) => void;
  recommendedTransport?: TransportMode;
  authorName?: string;
  loading?: boolean;
}

const TRANSPORT_OPTIONS: { key: DoItNowTransport; label: string; emoji: string; icon: string }[] = [
  { key: 'walking', label: 'À pied', emoji: '🚶', icon: 'walk-outline' },
  { key: 'transit', label: 'Métro', emoji: '🚇', icon: 'subway-outline' },
  { key: 'bicycling', label: 'Vélo', emoji: '🚴', icon: 'bicycle-outline' },
  { key: 'driving', label: 'Voiture', emoji: '🚗', icon: 'car-outline' },
];

const TRANSPORT_MAP: Record<TransportMode, DoItNowTransport> = {
  'À pied': 'walking',
  'Métro': 'transit',
  'Vélo': 'bicycling',
  'Voiture': 'driving',
  'Trottinette': 'walking',
};

const TRANSPORT_EMOJI: Record<TransportMode, string> = {
  'À pied': '🚶',
  'Métro': '🚇',
  'Vélo': '🚴',
  'Voiture': '🚗',
  'Trottinette': '🛴',
};

export const TransportChooser: React.FC<Props> = ({
  visible,
  onClose,
  onSelect,
  recommendedTransport,
  authorName,
  loading,
}) => {
  const C = useColors();
  const [selected, setSelected] = useState<DoItNowTransport | null>(null);

  const recommendedKey = recommendedTransport ? TRANSPORT_MAP[recommendedTransport] : undefined;
  const showAdvice = selected && recommendedKey && selected !== recommendedKey;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: C.white }]}>
              <View style={styles.handle} />
              <Text style={[styles.title, { color: C.black }]}>Comment tu te déplaces ?</Text>
              <Text style={[styles.subtitle, { color: C.gray600 }]}>
                Choisis ton mode de transport pour cette journée
              </Text>

              {showAdvice && authorName && recommendedTransport && (
                <View style={[styles.adviceBanner, { backgroundColor: C.primary + '15' }]}>
                  <Text style={[styles.adviceText, { color: C.primary }]}>
                    {authorName} recommande {TRANSPORT_EMOJI[recommendedTransport]}
                  </Text>
                </View>
              )}

              <View style={styles.options}>
                {TRANSPORT_OPTIONS.map((opt) => {
                  const isSelected = selected === opt.key;
                  const isRecommended = opt.key === recommendedKey;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.option,
                        {
                          backgroundColor: isSelected ? C.primary + '15' : C.gray200,
                          borderColor: isSelected ? C.primary : C.borderLight,
                        },
                      ]}
                      onPress={() => setSelected(opt.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.optionLabel, { color: isSelected ? C.primary : C.black }]}>
                        {opt.label}
                      </Text>
                      {isRecommended && (
                        <View style={[styles.recommendedBadge, { backgroundColor: C.primary }]}>
                          <Text style={styles.recommendedText}>Rec.</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.goBtn, { backgroundColor: selected && !loading ? C.primary : C.gray400 }]}
                onPress={() => selected && !loading && onSelect(selected)}
                disabled={!selected || loading}
                activeOpacity={0.8}
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
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(44,36,32,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray400, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontFamily: Fonts.displaySemiBold, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, fontFamily: Fonts.body, textAlign: 'center', marginBottom: 20 },
  adviceBanner: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, marginBottom: 16, alignSelf: 'center' },
  adviceText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  option: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    position: 'relative',
  },
  optionEmoji: { fontSize: 28, marginBottom: 6 },
  optionLabel: { fontSize: 13, fontFamily: Fonts.bodySemiBold },
  recommendedBadge: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  recommendedText: { color: Colors.textOnAccent, fontSize: 9, fontWeight: '700' },
  goBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14 },
  goBtnText: { color: Colors.textOnAccent, fontSize: 16, fontFamily: Fonts.bodySemiBold },
});
