import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BadgeType } from '../types';
import { Colors } from '../constants';

interface UserBadgeProps {
  type: BadgeType;
  small?: boolean;
}

const BADGE_CONFIG: Record<BadgeType, { label: string; bg: string; color: string; borderColor: string }> = {
  top_creator: {
    label: 'Top Creator',
    bg: Colors.purpleBg,
    color: Colors.purple,
    borderColor: Colors.purpleBg,
  },
  creator: {
    label: 'Creator',
    bg: Colors.terracotta50,
    color: Colors.primary,
    borderColor: Colors.terracotta100,
  },
  novice: {
    label: 'Novice',
    bg: Colors.successBg,
    color: Colors.success,
    borderColor: Colors.successBorder,
  },
};

export const UserBadge: React.FC<UserBadgeProps> = ({ type, small }) => {
  const config = BADGE_CONFIG[type];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg, borderColor: config.borderColor },
        small && styles.badgeSmall,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: config.color },
          small && styles.labelSmall,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
  },
  badgeSmall: {
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
  },
  labelSmall: {
    fontSize: 9,
  },
});
