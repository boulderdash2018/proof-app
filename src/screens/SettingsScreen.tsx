import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator, Modal, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Layout, Fonts, CITIES } from '../constants';
import { useAuthStore, useLanguageStore, useSettingsStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Ionicons } from '@expo/vector-icons';
import type { Language } from '../store';

const { width: SCREEN_W } = Dimensions.get('window');

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { logout, deleteAccount } = useAuthStore();
  const { language, setLanguage } = useLanguageStore();
  const { city, setCity } = useSettingsStore();
  const C = useColors();
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [pendingCity, setPendingCity] = useState(city);

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
    setPendingCity(city);
    setShowCityModal(true);
  };

  const confirmCity = () => {
    setCity(pendingCity);
    setShowCityModal(false);
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

      {/* ───── City Picker Modal ───── */}
      <Modal visible={showCityModal} transparent animationType="slide" onRequestClose={() => setShowCityModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: C.white }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.black }]}>Choisis ta ville</Text>
              <TouchableOpacity onPress={() => setShowCityModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={C.gray700} />
              </TouchableOpacity>
            </View>

            <View style={styles.cityGrid}>
              {CITIES.map((c) => {
                const isSelected = pendingCity === c.name;
                return (
                  <TouchableOpacity
                    key={c.name}
                    style={[
                      styles.cityCard,
                      {
                        backgroundColor: isSelected ? C.primary + '12' : C.gray200,
                        borderColor: isSelected ? C.primary : C.border,
                      },
                    ]}
                    onPress={() => setPendingCity(c.name)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cityEmoji}>{c.emoji}</Text>
                    <Text style={[styles.cityName, { color: C.black }]}>{c.name}</Text>
                    {isSelected && (
                      <View style={[styles.cityCheck, { backgroundColor: C.primary }]}>
                        <Ionicons name="checkmark" size={14} color="#FFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: C.primary }]}
              onPress={confirmCity}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmBtnText}>Confirmer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // City picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Layout.screenPadding, paddingTop: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontFamily: Fonts.serifBold },
  cityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 24 },
  cityCard: { width: (SCREEN_W - Layout.screenPadding * 2 - 24) / 3, paddingVertical: 20, borderRadius: 16, alignItems: 'center', borderWidth: 1.5, position: 'relative' as const },
  cityEmoji: { fontSize: 32, marginBottom: 8 },
  cityName: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  cityCheck: { position: 'absolute' as const, top: 8, right: 8, width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const },
  confirmBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' as const },
  confirmBtnText: { color: '#FFFFFF', fontSize: 16, fontFamily: Fonts.serifBold },
});
