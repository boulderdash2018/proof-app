import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';

interface PtsPillProps {
  points: number;
  label?: string;
}

export const PtsPill: React.FC<PtsPillProps> = ({ points, label }) => (
  <View style={styles.pill}>
    <Ionicons name="star" size={12} color={Colors.gold} />
    <Text style={styles.text}>{label || `${points} XP pts`}</Text>
  </View>
);

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.goldBg,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 4,
  },
  text: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.gold,
  },
});
