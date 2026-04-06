import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors, Layout, Fonts } from '../constants';

interface ChipProps {
  label: string;
  variant?: 'outline' | 'filled-black' | 'filled-gray';
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  variant = 'filled-gray',
  selected = false,
  onPress,
  small = false,
}) => {
  const isBlack = variant === 'filled-black' || selected;
  const isOutline = variant === 'outline' && !selected;

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        small && styles.chipSmall,
        isBlack && styles.chipBlack,
        isOutline && styles.chipOutline,
        !isBlack && !isOutline && styles.chipGray,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.label,
          small && styles.labelSmall,
          isBlack && styles.labelWhite,
          isOutline && styles.labelLight,
          !isBlack && !isOutline && styles.labelDark,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Layout.chipRadius,
    marginRight: 6,
    marginBottom: 4,
  },
  chipSmall: {
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipBlack: {
    backgroundColor: Colors.primary,
  },
  chipGray: {
    backgroundColor: Colors.gray300,
  },
  chipOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.gray600,
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.serifSemiBold,
  },
  labelSmall: {
    fontSize: 10,
  },
  labelWhite: {
    color: '#FFFFFF',
  },
  labelLight: {
    color: Colors.black,
  },
  labelDark: {
    color: Colors.gray700,
  },
});
