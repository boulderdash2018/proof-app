import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { useAuthStore } from '../store';

const SettingsRow: React.FC<{ label: string; onPress: () => void; danger?: boolean }> = ({ label, onPress, danger }) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
    <Text style={[styles.rowText, danger && { color: Colors.error }]}>{label}</Text>
    <Text style={styles.rowChevron}>›</Text>
  </TouchableOpacity>
);

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Tu es sûr de vouloir te déconnecter ?')) {
        logout();
      }
    } else {
      const { Alert } = require('react-native');
      Alert.alert('Se déconnecter', 'Tu es sûr ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: () => logout() },
      ]);
    }
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Cette action est irréversible. Tu es sûr ?')) {
        logout();
      }
    } else {
      const { Alert } = require('react-native');
      Alert.alert('Supprimer mon compte', 'Cette action est irréversible.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => logout() },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Retour</Text>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>MON COMPTE</Text>
        <SettingsRow label="Modifier le profil" onPress={() => navigation.navigate('EditProfile')} />
        <SettingsRow label="Changer le mot de passe" onPress={() => Alert.alert('Bientôt disponible')} />
        <SettingsRow label="Adresse email" onPress={() => Alert.alert('Bientôt disponible')} />

        <Text style={styles.sectionTitle}>CONFIDENTIALITÉ</Text>
        <SettingsRow label="Paramètres de confidentialité" onPress={() => navigation.navigate('PrivacySettings')} />

        <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
        <SettingsRow label="Préférences de notifications" onPress={() => navigation.navigate('NotificationsSettings')} />

        <Text style={styles.sectionTitle}>APPLICATION</Text>
        <SettingsRow label="Langue" onPress={() => Alert.alert('Français (par défaut)')} />
        <SettingsRow label="Thème" onPress={() => Alert.alert('Clair (par défaut)')} />
        <SettingsRow label="Vider le cache" onPress={() => Alert.alert('Cache vidé !')} />

        <Text style={styles.sectionTitle}>LÉGAL</Text>
        <SettingsRow label="Conditions d'utilisation" onPress={() => Alert.alert('CGU')} />
        <SettingsRow label="Politique de confidentialité" onPress={() => Alert.alert('Privacy Policy')} />
        <SettingsRow label="Mentions légales" onPress={() => Alert.alert('Mentions légales')} />

        <Text style={styles.sectionTitle}>DANGER ZONE</Text>
        <SettingsRow label="Se déconnecter" onPress={handleLogout} danger />
        <SettingsRow label="Supprimer mon compte" onPress={handleDeleteAccount} danger />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { fontSize: 16, color: Colors.primary, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { paddingBottom: 40 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: Colors.gray700, paddingHorizontal: Layout.screenPadding, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Layout.screenPadding, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowText: { fontSize: 14, color: Colors.black },
  rowChevron: { fontSize: 18, color: Colors.gray600 },
});
