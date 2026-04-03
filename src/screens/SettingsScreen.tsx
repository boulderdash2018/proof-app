import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Layout } from '../constants';
import { useAuthStore, useThemeStore, useLanguageStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import type { Language } from '../store';

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const logout = useAuthStore((s) => s.logout);
  const { isDark, toggleTheme } = useThemeStore();
  const { language, setLanguage } = useLanguageStore();
  const C = useColors();
  const { t } = useTranslation();

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

  const handleDeleteAccount = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t.settings_delete_confirm)) {
        logout();
      }
    } else {
      const { Alert } = require('react-native');
      Alert.alert(t.settings_delete_confirm_title, t.settings_delete_confirm_body, [
        { text: t.cancel, style: 'cancel' },
        { text: t.delete, style: 'destructive', onPress: () => logout() },
      ]);
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

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>{t.settings_privacy_section}</Text>
        <SettingsRow label={t.settings_privacy} onPress={() => navigation.navigate('PrivacySettings')} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>{t.settings_notif_section}</Text>
        <SettingsRow label={t.settings_notif} onPress={() => navigation.navigate('NotificationsSettings')} />

        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>{t.settings_app}</Text>
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
        <SettingsRow
          label={t.settings_theme}
          onPress={toggleTheme}
          right={
            <View style={[styles.themeBadge, { backgroundColor: isDark ? C.primary : C.gray300 }]}>
              <Text style={[styles.themeBadgeText, { color: isDark ? '#FFFFFF' : C.gray800 }]}>
                {isDark ? t.settings_theme_dark : t.settings_theme_light}
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
