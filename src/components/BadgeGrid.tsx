import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Fonts } from '../constants';
import { ACHIEVEMENTS, TOTAL_ACHIEVEMENTS, ACHIEVEMENTS_BY_CATEGORY, AchievementDef, AchievementCategory } from '../constants/achievements';
import { useColors } from '../hooks/useColors';
import { BadgeDetailSheet } from './BadgeDetailSheet';

interface Props {
  unlockedIds: string[];
  lang: 'fr' | 'en';
}

const CATEGORY_ORDER: AchievementCategory[] = ['plans', 'social', 'places', 'special'];
const CATEGORY_LABELS: Record<AchievementCategory, { fr: string; en: string }> = {
  plans: { fr: 'PLANS', en: 'PLANS' },
  social: { fr: 'SOCIAL', en: 'SOCIAL' },
  places: { fr: 'LIEUX', en: 'PLACES' },
  special: { fr: 'SPÉCIAL', en: 'SPECIAL' },
};

export const BadgeGrid: React.FC<Props> = ({ unlockedIds, lang }) => {
  const C = useColors();
  const [selectedBadge, setSelectedBadge] = useState<AchievementDef | null>(null);
  const unlockedSet = new Set(unlockedIds);
  const unlockedCount = unlockedIds.length;

  return (
    <View>
      <View style={styles.counterRow}>
        <Text style={[styles.counter, { color: C.gray600 }]}>
          {unlockedCount} / {TOTAL_ACHIEVEMENTS}{' '}
          {lang === 'fr' ? 'débloqués' : 'unlocked'}
        </Text>
      </View>

      {CATEGORY_ORDER.map((cat) => {
        const badges = ACHIEVEMENTS_BY_CATEGORY[cat];
        return (
          <View key={cat} style={styles.categorySection}>
            <Text style={[styles.categoryLabel, { color: C.gray600 }]}>
              {CATEGORY_LABELS[cat][lang]}
            </Text>
            <View style={styles.grid}>
              {badges.map((badge) => {
                const isUnlocked = unlockedSet.has(badge.id);
                return (
                  <TouchableOpacity
                    key={badge.id}
                    style={styles.gridItem}
                    activeOpacity={0.7}
                    onPress={() => setSelectedBadge(badge)}
                  >
                    <View
                      style={[
                        styles.badgeIcon,
                        { backgroundColor: isUnlocked ? C.gray300 : C.gray200 },
                        !isUnlocked && styles.badgeIconLocked,
                      ]}
                    >
                      <Text style={[styles.badgeEmoji, !isUnlocked && styles.lockedEmoji]}>
                        {isUnlocked ? badge.emoji : '🔒'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.badgeName,
                        { color: isUnlocked ? C.gray800 : C.gray500 },
                      ]}
                      numberOfLines={1}
                    >
                      {lang === 'fr' ? badge.name : badge.nameEn}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      <BadgeDetailSheet
        badge={selectedBadge}
        isUnlocked={selectedBadge ? unlockedSet.has(selectedBadge.id) : false}
        visible={!!selectedBadge}
        onClose={() => setSelectedBadge(null)}
        lang={lang}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  counterRow: {
    alignItems: 'center',
    marginBottom: 14,
  },
  counter: {
    fontSize: 12,
    fontFamily: Fonts.serifSemiBold,
    letterSpacing: 0.3,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIconLocked: {
    opacity: 0.4,
  },
  badgeEmoji: {
    fontSize: 20,
  },
  lockedEmoji: {
    fontSize: 16,
  },
  badgeName: {
    fontSize: 9,
    fontFamily: Fonts.serifSemiBold,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
});
