import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Colors, Fonts } from '../constants';
import { AchievementDef } from '../constants/achievements';
import { useColors } from '../hooks/useColors';

interface Props {
  badge: AchievementDef | null;
  isUnlocked: boolean;
  visible: boolean;
  onClose: () => void;
  lang: 'fr' | 'en';
}

const CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  plans: { fr: 'Plans', en: 'Plans' },
  social: { fr: 'Social', en: 'Social' },
  places: { fr: 'Lieux', en: 'Places' },
  special: { fr: 'Spécial', en: 'Special' },
};

export const BadgeDetailSheet: React.FC<Props> = ({ badge, isUnlocked, visible, onClose, lang }) => {
  const C = useColors();
  if (!badge) return null;

  const name = lang === 'fr' ? badge.name : badge.nameEn;
  const desc = lang === 'fr' ? badge.description : badge.descriptionEn;
  const catLabel = CATEGORY_LABELS[badge.category]?.[lang] ?? badge.category;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: C.gray200 }]}>
              <View style={[styles.handle, { backgroundColor: C.gray500 }]} />
              <View style={[styles.emojiWrap, { backgroundColor: isUnlocked ? C.gray300 : C.gray300 }]}>
                <Text style={styles.emoji}>{isUnlocked ? badge.emoji : '🔒'}</Text>
              </View>
              <Text style={[styles.name, { color: C.black }]}>{name}</Text>
              <View style={[styles.categoryPill, { backgroundColor: C.gray300, borderColor: C.border }]}>
                <Text style={[styles.categoryText, { color: C.gray700 }]}>{catLabel}</Text>
              </View>
              <Text style={[styles.description, { color: C.gray700 }]}>{desc}</Text>
              {isUnlocked ? (
                <View style={[styles.statusPill, { backgroundColor: Colors.successBg, borderColor: Colors.successBorder }]}>
                  <Text style={[styles.statusText, { color: Colors.success }]}>Débloqué ✓</Text>
                </View>
              ) : (
                <View style={[styles.statusPill, { backgroundColor: C.gray300, borderColor: C.border }]}>
                  <Text style={[styles.statusText, { color: C.gray600 }]}>Verrouillé</Text>
                </View>
              )}
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: C.gray300 }]} onPress={onClose}>
                <Text style={[styles.closeBtnText, { color: C.gray800 }]}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    alignItems: 'center',
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 20,
  },
  emojiWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emoji: { fontSize: 32 },
  name: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    marginBottom: 8,
  },
  categoryPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  description: {
    fontSize: 13,
    fontFamily: Fonts.body,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  statusPill: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
  },
  closeBtn: {
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 12,
  },
  closeBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
  },
});
