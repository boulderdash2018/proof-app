import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Colors, Layout, Fonts } from '../constants';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  small = false,
}) => (
  <TouchableOpacity
    style={[
      styles.button,
      small && styles.buttonSmall,
      (disabled || loading) && styles.buttonDisabled,
    ]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.8}
  >
    {loading ? (
      <ActivityIndicator color="#FFFFFF" size="small" />
    ) : (
      <Text style={[styles.label, small && styles.labelSmall]}>{label}</Text>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Layout.buttonRadius,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: {
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: Fonts.serifBold,
  },
  labelSmall: {
    fontSize: 13,
  },
});
