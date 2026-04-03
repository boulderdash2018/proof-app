import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Layout } from '../constants';
import { useAuthStore, useThemeStore } from '../store';
import { useColors } from '../hooks/useColors';

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const logout = useAuthStore((s) => s.logout);
  const { isDark, toggleTheme } = useThemeStore();
  const C = useColors();

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

  const SettingsRow = ({ label, onPress, danger, right }: { label: string; onPress: () => void; danger?: boolean; right?: React.ReactNode }) => (
    <TouchableOpacity style={[styles.row, { borderBottomColor: C.borderLight }]} onPress={onPress} activeOpacity={0.6}>
      <Text style={[styles.rowText, { color: danger ? C.error : C.black }]}>{label}</Text>
      {right || <Text style={[styles.rowChevron, { color: C.gray600 }]}>›</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.back, { color: C.primary }]} onPress={() => navigation.goBack()}>‹ Retour</Text>
        <Text style={[styles.headerTitle, { color: C.black }]}>Paramètres</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>MON COMPTE</Text>
        <SettingsRow label="Modifier le profil" onPress={() => navigation.navigate('EditProfile')} />
        <SettingsRow label="Changer le mot de passe" onPress={() => {}} />
        <SettingsRow label="Adresse email" onPress={() => {}} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>CONFIDENTIALITÉ</Text>
        <SettingsRow label="Paramètres de confidentialité" onPress={() => navigation.navigate('PrivacySettings')} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>NOTIFICATIONS</Text>
        <SettingsRow label="Préférences de notifications" onPress={() => navigation.navigate('NotificationsSettings')} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>APPLICATION</Text>
        <SettingsRow label="Langue" onPress={() => {}} />
        <SettingsRow
          label="Thème"
          onPress={toggleTheme}
          right={
            <View style={[styles.themeBadge, { backgroundColor: isDark ? C.primary : C.gray300 }]}>
              <Text style={[styles.themeBadgeText, { color: isDark ? '#FFFFFF' : C.gray800 }]}>
                {isDark ? '🌙 Sombre' : '☀️ Clair'}
              </Text>
            </View>
          }
        />
        <SettingsRow label="Vider le cache" onPress={() => {}} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>LÉGAL</Text>
        <SettingsRow label="Conditions d'utilisation" onPress={() => {}} />
        <SettingsRow label="Politique de confidentialité" onPress={() => {}} />
        <SettingsRow label="Mentions légales" onPress={() => {}} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>DANGER ZONE</Text>
        <SettingsRow label="Se déconnecter" onPress={handleLogout} danger />
        <SettingsRow label="Supprimer mon compte" onPress={handleDeleteAccount} danger />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  back: { fontSize: 16, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scroll: { paddingBottom: 40 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: Layout.screenPadding, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Layout.screenPadding, paddingVertical: 14, borderBottomWidth: 1 },
  rowText: { fontSize: 14 },
  rowChevron: { fontSize: 18 },
  themeBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  themeBadgeText: { fontSize: 12, fontWeight: '600' },
});
