import React, { useState } from 'react';
import {
  View,
  TextInput as RNTextInput,
  Text,
  StyleSheet,
  TextInputProps as RNTextInputProps,
  TouchableOpacity,
} from 'react-native';
import { Colors, Layout } from '../constants';

interface TextInputProps extends RNTextInputProps {
  label?: string;
  error?: string;
  isPassword?: boolean;
  half?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  error,
  isPassword = false,
  half = false,
  style,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={[styles.container, half && styles.half]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrap}>
        <RNTextInput
          style={[
            styles.input,
            isFocused && styles.inputFocused,
            error ? styles.inputError : null,
            style,
          ]}
          placeholderTextColor={Colors.gray600}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isPassword && !showPassword}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  half: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gray800,
    marginBottom: 6,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    backgroundColor: Colors.gray200,
    borderRadius: Layout.inputRadius,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: Colors.black,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputFocused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.gray100,
  },
  inputError: {
    borderColor: Colors.error,
  },
  error: {
    fontSize: 11,
    color: Colors.error,
    marginTop: 4,
    marginLeft: 2,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 18,
  },
});
