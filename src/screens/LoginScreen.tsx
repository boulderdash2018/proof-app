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

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const login = useAuthStore((s) => s.login);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const C = useColors();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email.includes('@')) {
      newErrors.email = 'Email invalide';
    }
    if (!password) {
      newErrors.password = 'Mot de passe requis';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await login(email, password);
      // RootNavigator auto-redirects on isAuthenticated change
    } catch (err: any) {
      setErrors({ password: err.message || 'Identifiants incorrects' });
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

          <Text style={[styles.title, { color: C.black }]}>Bon retour 👋</Text>

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

          <TouchableOpacity
            style={styles.forgotRow}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
          </TouchableOpacity>

          <PrimaryButton
            label="Se connecter"
            onPress={handleLogin}
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
                setErrors({ password: err.message || 'Erreur Google' });
              } finally {
                setGoogleLoading(false);
              }
            }}
            loading={googleLoading}
          />

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>Pas encore de compte ? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.bottomLink}>S'inscrire</Text>
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
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: -4,
  },
  forgotText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
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
