import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Typography, Layout } from '../constants';
import { PrimaryButton, SecondaryButton, TextInput } from '../components';
import { useAuthStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';

export const SignupScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const signup = useAuthStore((s) => s.signup);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const C = useColors();
  const { t } = useTranslation();

  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) {
      newErrors.firstName = t.signup_error_firstname;
    }
    if (!email.includes('@')) {
      newErrors.email = t.signup_error_email;
    }
    if (password.length < 8) {
      newErrors.password = t.signup_error_password;
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = t.signup_error_confirm;
    }
    if (!accepted) {
      newErrors.accepted = t.signup_error_terms;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await signup({ firstName, email, password });
      navigation.navigate('SetupProfile');
    } catch (err: any) {
      setErrors({ email: err.message || t.signup_error_generic });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.white }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.logo, { color: C.black }]}>
            proof<Text style={{ color: C.primary }}>.</Text>
          </Text>

          <Text style={[styles.title, { color: C.black }]}>{t.signup_title}</Text>

          <TextInput
            label={t.signup_firstname_label}
            value={firstName}
            onChangeText={setFirstName}
            error={errors.firstName}
            placeholder={t.signup_firstname_placeholder}
          />

          <TextInput
            label={t.login_email_label}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
            placeholder={t.login_email_placeholder}
          />

          <TextInput
            label={t.login_password_label}
            value={password}
            onChangeText={setPassword}
            isPassword
            error={errors.password}
            placeholder={t.login_password_placeholder}
          />
          <Text style={styles.passwordHint}>{t.signup_password_hint}</Text>

          <TextInput
            label={t.signup_confirm_label}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            isPassword
            error={errors.confirmPassword}
            placeholder={t.signup_confirm_placeholder}
          />

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAccepted(!accepted)}
            activeOpacity={0.7}
          >
            <Text style={styles.checkbox}>{accepted ? '☑' : '☐'}</Text>
            <Text style={styles.checkboxLabel}>
              {t.signup_accept_terms}
            </Text>
          </TouchableOpacity>
          {errors.accepted && (
            <Text style={styles.checkboxError}>{errors.accepted}</Text>
          )}

          <View style={styles.spacer} />

          <PrimaryButton
            label={t.signup_submit}
            onPress={handleSignup}
            loading={loading}
          />

          <View style={styles.separator}>
            <View style={styles.line} />
            <Text style={styles.separatorText}>{t.or}</Text>
            <View style={styles.line} />
          </View>

          <SecondaryButton
            label={t.login_google}
            icon="🔵"
            onPress={async () => {
              setGoogleLoading(true);
              try {
                await loginWithGoogle();
              } catch (err: any) {
                setErrors({ email: err.message || t.login_error_google });
              } finally {
                setGoogleLoading(false);
              }
            }}
            loading={googleLoading}
          />

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>{t.signup_has_account}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.bottomLink}>{t.login_submit}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 30,
    paddingBottom: 40,
  },
  logo: {
    ...Typography.logo,
    fontSize: 30,
    color: Colors.black,
    marginBottom: 32,
  },
  dot: {
    color: Colors.primary,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 24,
  },
  passwordHint: {
    fontSize: 11,
    color: Colors.gray700,
    marginTop: -10,
    marginBottom: 14,
    marginLeft: 2,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 10,
  },
  checkbox: {
    fontSize: 20,
    lineHeight: 24,
    color: Colors.black,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.gray800,
    lineHeight: 20,
  },
  checkboxError: {
    fontSize: 11,
    color: Colors.error,
    marginBottom: 8,
    marginLeft: 30,
  },
  spacer: {
    height: 16,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  separatorText: {
    color: Colors.gray700,
    fontSize: 13,
    marginHorizontal: 14,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
  },
  bottomText: {
    fontSize: 14,
    color: Colors.gray700,
  },
  bottomLink: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
});
