import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { PrimaryButton, TextInput } from '../components';
import mockApi from '../services/mockApi';

export const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!email.includes('@')) {
      setError('Email invalide');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await mockApi.sendPasswordReset(email);
      setSent(true);
    } catch {
      setError("Erreur lors de l'envoi");
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
          <Text style={styles.successTitle}>Email envoyé !</Text>
          <Text style={styles.successSubtitle}>
            Vérifie ta boîte mail et clique sur le lien pour
            réinitialiser ton mot de passe.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>Retour à la connexion</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.title}>Mot de passe oublié</Text>
          <Text style={styles.description}>
            Entre ton email, on t'envoie un lien de réinitialisation.
          </Text>

          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            error={error}
            placeholder="ton@email.com"
          />

          <View style={styles.spacer} />

          <PrimaryButton
            label="Envoyer le lien"
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
