import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Fonts } from '../constants';
import { getRankProgress, RankDef } from '../constants/ranks';
import { useColors } from '../hooks/useColors';

interface Props {
  totalProofs: number;
}

export const RankProgressBar: React.FC<Props> = ({ totalProofs }) => {
  const C = useColors();
  const { current, next, progress, proofsInRank, proofsNeeded } = getRankProgress(totalProofs);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.currentRank, { color: current.color }]}>
          {current.emoji} {current.name}
        </Text>
        {next ? (
          <Text style={[styles.nextRank, { color: C.gray600 }]}>
            {next.emoji} {next.name}
          </Text>
        ) : (
          <Text style={[styles.nextRank, { color: current.color }]}>MAX</Text>
        )}
      </View>
      <View style={[styles.trackBg, { backgroundColor: C.gray300 }]}>
        <View
          style={[
            styles.trackFill,
            {
              backgroundColor: current.color,
              width: `${Math.max(2, progress * 100)}%`,
            },
          ]}
        />
      </View>
      {next ? (
        <Text style={[styles.progressText, { color: C.gray600 }]}>
          {totalProofs} / {next.minProofs} proof validations
        </Text>
      ) : (
        <Text style={[styles.progressText, { color: current.color }]}>
          {totalProofs} proof validations
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  currentRank: { fontSize: 12, fontFamily: Fonts.serifBold },
  nextRank: { fontSize: 11, fontFamily: Fonts.serifSemiBold },
  trackBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 10,
    fontFamily: Fonts.serif,
    marginTop: 4,
    textAlign: 'center',
  },
});
