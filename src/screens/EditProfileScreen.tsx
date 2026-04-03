import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { Avatar, PrimaryButton, TextInput } from '../components';
import { useAuthStore } from '../store';
import { useTranslation } from '../hooks/useTranslation';

export const EditProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isPrivate, setIsPrivate] = useState(user?.isPrivate || false);
  const [isSaving, setIsSaving] = useState(false);
  const { t } = useTranslation();

  const handleSave = async () => {
    setIsSaving(true);
    await updateProfile({ displayName, username, bio, isPrivate });
    setIsSaving(false);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.back} onPress={() => navigation.goBack()}>{t.back}</Text>
          <Text style={styles.headerTitle}>{t.edit_profile_title}</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarSection}>
            <Avatar initials={user?.initials || 'LT'} bg={user?.avatarBg || '#F0EEFF'} color={user?.avatarColor || '#534AB7'} size="L" borderColor={Colors.primary} />
            <Text style={styles.changePhotoLink}>{t.edit_profile_change_photo}</Text>
          </View>
          <TextInput label={t.edit_profile_display_name} value={displayName} onChangeText={setDisplayName} />
          <TextInput label={t.edit_profile_username} value={username} onChangeText={setUsername} autoCapitalize="none" />
          <TextInput label={t.edit_profile_bio} value={bio} onChangeText={setBio} multiline numberOfLines={3} maxLength={150} placeholder={t.edit_profile_bio_placeholder} />
          <Text style={styles.charCount}>{bio.length}/150</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t.edit_profile_private}</Text>
            <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: Colors.primary }} />
          </View>
          <PrimaryButton label={t.save} onPress={handleSave} loading={isSaving} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { fontSize: 16, color: Colors.primary, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { padding: Layout.screenPadding, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  changePhotoLink: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: 10 },
  charCount: { fontSize: 11, color: Colors.gray600, textAlign: 'right', marginTop: -10, marginBottom: 14 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border, marginBottom: 20 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: Colors.black },
});
