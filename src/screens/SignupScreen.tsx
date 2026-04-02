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

export const SignupScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const signup = useAuthStore((s) => s.signup);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

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
      newErrors.firstName = 'Prénom requis';
    }
    if (!email.includes('@')) {
      newErrors.email = 'Email invalide';
    }
    if (password.length < 8) {
      newErrors.password = '8 caractères minimum';
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    }
    if (!accepted) {
      newErrors.accepted = 'Tu dois accepter les conditions';
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
      setErrors({ email: err.message || "Erreur lors de l'inscription" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.logo}>
            proof<Text style={styles.dot}>.</Text>
          </Text>

          <Text style={styles.title}>Crée ton compte</Text>

          <TextInput
            label="Prénom"
            value={firstName}
            onChangeText={setFirstName}
            error={errors.firstName}
            placeholder="Ton prénom"
          />

          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
            placeholder="ton@email.com"
          />

          <TextInput
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            isPassword
            error={errors.password}
            placeholder="Ton mot de passe"
          />
          <Text style={styles.passwordHint}>8 caractères minimum</Text>

          <TextInput
            label="Confirmer mot de passe"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            isPassword
            error={errors.confirmPassword}
            placeholder="Confirme ton mot de passe"
          />

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAccepted(!accepted)}
            activeOpacity={0.7}
          >
            <Text style={styles.checkbox}>{accepted ? '☑' : '☐'}</Text>
            <Text style={styles.checkboxLabel}>
              J'accepte les conditions d'utilisation et la politique de
              confidentialité
            </Text>
          </TouchableOpacity>
          {errors.accepted && (
            <Text style={styles.checkboxError}>{errors.accepted}</Text>
          )}

          <View style={styles.spacer} />

          <PrimaryButton
            label="Créer mon compte"
            onPress={handleSignup}
            loading={loading}
          />

          <View style={styles.separator}>
            <View style={styles.line} />
            <Text style={styles.separatorText}>ou</Text>
            <View style={styles.line} />
          </View>

          <SecondaryButton
            label="Continuer avec Google"
            icon="🔵"
            onPress={async () => {
              setGoogleLoading(true);
              try {
                await loginWithGoogle();
              } catch (err: any) {
                setErrors({ email: err.message || 'Erreur Google' });
              } finally {
                setGoogleLoading(false);
              }
            }}
            loading={googleLoading}
          />

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>Déjà un compte ?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.bottomLink}>Se connecter</Text>
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
