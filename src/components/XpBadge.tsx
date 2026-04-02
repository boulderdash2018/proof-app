import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants';

interface XpBadgeProps {
  xp: number;
}

export const XpBadge: React.FC<XpBadgeProps> = ({ xp }) => (
  <View style={styles.badge}>
    <Text style={styles.text}>+{xp} XP</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    backgroundColor: Colors.successBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.success,
  },
});
