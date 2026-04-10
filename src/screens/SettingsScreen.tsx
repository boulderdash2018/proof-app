import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Layout, Fonts, CITIES } from '../constants';
import { useAuthStore, useLanguageStore, useSettingsStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import type { Language } from '../store';

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { logout, deleteAccount } = useAuthStore();
  const { language, setLanguage } = useLanguageStore();
  const { city, setCity } = useSettingsStore();
  const C = useColors();
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t.settings_logout_confirm)) {
        logout();
      }
    } else {
      const { Alert } = require('react-native');
      Alert.alert(t.settings_logout, t.settings_logout_confirm_short, [
        { text: t.cancel, style: 'cancel' },
        { text: t.settings_logout, style: 'destructive', onPress: () => logout() },
      ]);
    }
  };

  const performDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
    } catch (error: any) {
      setIsDeleting(false);
      const msg = error?.code === 'auth/requires-recent-login'
        ? (t.settings_delete_reauth || 'Reconnecte-toi puis réessaie.')
        : (error?.message || t.error);
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        const { Alert } = require('react-native');
        Alert.alert(t.error, msg);
      }
    }
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t.settings_delete_confirm)) {
        performDelete();
      }
    } else {
      const { Alert } = require('react-native');
      Alert.alert(t.settings_delete_confirm_title, t.settings_delete_confirm_body, [
        { text: t.cancel, style: 'cancel' },
        { text: t.delete, style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  const handleCity = () => {
    const available = CITIES.filter((c) => c.available);
    if (Platform.OS === 'web') {
      const choice = window.prompt(
        `Choisis ta ville:\n${available.map((c, i) => `${i + 1}. ${c.emoji} ${c.name}`).join('\n')}`,
        city,
      );
      const match = available.find((c) => c.name.toLowerCase() === (choice || '').toLowerCase());
      if (match) setCity(match.name);
    } else {
      const { Alert } = require('react-native');
      Alert.alert(
        'Ville',
        'Choisis ta ville',
        [
          ...available.map((c) => ({ text: `${c.emoji} ${c.name}`, onPress: () => setCity(c.name) })),
          { text: t.cancel, style: 'cancel' as const },
        ],
      );
    }
  };

  const handleLanguage = () => {
    if (Platform.OS === 'web') {
      const next: Language = language === 'fr' ? 'en' : 'fr';
      setLanguage(next);
    } else {
      const { Alert } = require('react-native');
      Alert.alert(t.settings_language, '', [
        { text: '🇫🇷 Français', onPress: () => setLanguage('fr') },
        { text: '🇬🇧 English', onPress: () => setLanguage('en') },
        { text: t.cancel, style: 'cancel' },
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
        <Text style={[styles.back, { color: C.primary }]} onPress={() => navigation.goBack()}>{t.back}</Text>
        <Text style={[styles.headerTitle, { color: C.black }]}>{t.settings_title}</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>{t.settings_account}</Text>
        <SettingsRow label={t.settings_edit_profile} onPress={() => navigation.navigate('EditProfile')} />
        <SettingsRow label={t.settings_change_password} onPress={() => {}} />
        <SettingsRow label={t.settings_email} onPress={() => {}} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>MES PLANS</Text>
        <SettingsRow label="Archives" onPress={() => navigation.navigate('Archives')} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>{t.settings_privacy_section}</Text>
        <SettingsRow label={t.settings_privacy} onPress={() => navigation.navigate('PrivacySettings')} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>{t.settings_notif_section}</Text>
        <SettingsRow label={t.settings_notif} onPress={() => navigation.navigate('NotificationsSettings')} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>{t.settings_app}</Text>
        <SettingsRow
          label="Ville"
          onPress={handleCity}
          right={
            <View style={[styles.themeBadge, { backgroundColor: C.gray300 }]}>
              <Text style={[styles.themeBadgeText, { color: C.gray800 }]}>
                {CITIES.find((c) => c.name === city)?.emoji || '🗼'} {city}
              </Text>
            </View>
          }
        />
        <SettingsRow
          label={t.settings_language}
          onPress={handleLanguage}
          right={
            <View style={[styles.themeBadge, { backgroundColor: C.gray300 }]}>
              <Text style={[styles.themeBadgeText, { color: C.gray800 }]}>
                {language === 'fr' ? t.settings_lang_french : t.settings_lang_english}
              </Text>
            </View>
          }
        />
        <SettingsRow label={t.settings_clear_cache} onPress={() => {}} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>{t.settings_legal}</Text>
        <SettingsRow label={t.settings_terms} onPress={() => {}} />
        <SettingsRow label={t.settings_privacy_policy} onPress={() => {}} />
        <SettingsRow label={t.settings_legal_mentions} onPress={() => {}} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>{t.settings_danger}</Text>
        <SettingsRow label={t.settings_logout} onPress={handleLogout} danger />
        <SettingsRow label={t.settings_delete_account} onPress={handleDeleteAccount} danger />
      </ScrollView>
      {isDeleting && (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={[styles.deletingText, { color: C.white }]}>{t.settings_delete_loading || 'Suppression en cours...'}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  back: { fontSize: 16, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 17, fontFamily: Fonts.serifBold },
  scroll: { paddingBottom: 40 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: Layout.screenPadding, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Layout.screenPadding, paddingVertical: 14, borderBottomWidth: 1 },
  rowText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  rowChevron: { fontSize: 18 },
  themeBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  themeBadgeText: { fontSize: 12, fontWeight: '600' },
  deletingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  deletingText: { marginTop: 16, fontSize: 15, fontFamily: Fonts.serifSemiBold },
});
