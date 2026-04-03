import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { PrimaryButton, TextInput } from '../components';
import mockApi from '../services/mockApi';
import { useTranslation } from '../hooks/useTranslation';

export const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!email.includes('@')) {
      setError(t.forgot_error_email);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await mockApi.sendPasswordReset(email);
      setSent(true);
    } catch {
      setError(t.forgot_error_send);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backIcon}>{'←'}</Text>
      </TouchableOpacity>

      {sent ? (
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>{'✉️'}</Text>
          <Text style={styles.successTitle}>{t.forgot_success_title}</Text>
          <Text style={styles.successSubtitle}>
            {t.forgot_success_subtitle}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>{t.forgot_back_login}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.title}>{t.forgot_title}</Text>
          <Text style={styles.description}>
            {t.forgot_description}
          </Text>

          <TextInput
            label={t.login_email_label}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            error={error}
            placeholder={t.login_email_placeholder}
          />

          <View style={styles.spacer} />

          <PrimaryButton
            label={t.forgot_submit}
            onPress={handleSend}
            loading={loading}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  backButton: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 8,
    paddingBottom: 12,
    alignSelf: 'flex-start',
  },
  backIcon: {
    fontSize: 24,
    color: Colors.black,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 8,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: Colors.gray700,
    marginBottom: 28,
    lineHeight: 20,
  },
  spacer: {
    height: 8,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding + 20,
  },
  successEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 10,
  },
  successSubtitle: {
    fontSize: 14,
    color: Colors.gray700,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  link: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
