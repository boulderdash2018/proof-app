import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Colors, Layout } from '../constants';

interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
}

export const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
}) => (
  <TouchableOpacity
    style={[styles.button, (disabled || loading) && styles.buttonDisabled]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.7}
  >
    {loading ? (
      <ActivityIndicator color={Colors.black} size="small" />
    ) : (
      <>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={styles.label}>{label}</Text>
      </>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'transparent',
    borderRadius: Layout.buttonRadius,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 18,
  },
  label: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '600',
  },
});
