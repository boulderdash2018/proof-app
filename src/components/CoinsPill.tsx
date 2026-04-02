import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants';

interface CoinsPillProps {
  coins: number;
}

export const CoinsPill: React.FC<CoinsPillProps> = ({ coins }) => (
  <View style={styles.pill}>
    <Text style={styles.icon}>+</Text>
    <Text style={styles.text}>{coins} coins</Text>
  </View>
);

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successBg,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 3,
  },
  icon: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.success,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.success,
  },
});
