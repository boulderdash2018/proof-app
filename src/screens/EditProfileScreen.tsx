import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Colors, Layout } from '../constants';
import { Avatar, PrimaryButton, TextInput } from '../components';
import { useAuthStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';

export const EditProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const C = useColors();
  const { t } = useTranslation();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isPrivate, setIsPrivate] = useState(user?.isPrivate || false);
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(user?.avatarUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Convert a blob/file URI to a data URL for persistence
  const uriToDataUrl = (uri: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(xhr.response);
      };
      xhr.onerror = reject;
      xhr.open('GET', uri);
      xhr.responseType = 'blob';
      xhr.send();
    });
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: Platform.OS !== 'web',
        aspect: [1, 1],
        quality: 0.4,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setIsUploading(true);

      try {
        // Convert to data URL (works on web + native)
        const dataUrl = await uriToDataUrl(asset.uri);
        setAvatarUrl(dataUrl);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error('Convert to data URL failed:', err);
        // Last resort: use raw URI
        setAvatarUrl(asset.uri);
      } finally {
        setIsUploading(false);
      }
    } catch (err) {
      console.error('Image picker error:', err);
      setIsUploading(false);
    }
  };

  const handlePhotoPress = () => {
    if (Platform.OS === 'web') {
      // On web, directly open picker
      pickImage();
    } else {
      // On native, show action sheet
      Alert.alert(
        t.edit_profile_photo_title,
        '',
        [
          { text: t.edit_profile_photo_gallery, onPress: pickImage },
          ...(avatarUrl ? [{ text: t.edit_profile_photo_remove, style: 'destructive' as const, onPress: () => setAvatarUrl(null) }] : []),
          { text: t.cancel, style: 'cancel' as const },
        ]
      );
    }
  };

  const handleSave = async () => {
    if (Platform.OS === 'web') {
      if (!window.confirm(t.edit_profile_confirm_message)) return;
    } else {
      return new Promise<void>((resolve) => {
        Alert.alert(
          t.edit_profile_confirm_title,
          t.edit_profile_confirm_message,
          [
            { text: t.cancel, style: 'cancel', onPress: () => resolve() },
            {
              text: t.edit_profile_confirm_yes,
              onPress: async () => {
                await doSave();
                resolve();
              },
            },
          ]
        );
      });
    }
    // Web path continues here
    await doSave();
  };

  const doSave = async () => {
    setIsSaving(true);
    await updateProfile({
      displayName,
      username,
      bio,
      isPrivate,
      avatarUrl: avatarUrl || null,
    });
    setIsSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <Text style={[styles.back, { color: C.primary }]} onPress={() => navigation.goBack()}>{t.back}</Text>
          <Text style={[styles.headerTitle, { color: C.black }]}>{t.edit_profile_title}</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Avatar section */}
          <TouchableOpacity style={styles.avatarSection} onPress={handlePhotoPress} activeOpacity={0.7}>
            {isUploading ? (
              <View style={[styles.avatarPlaceholder, { backgroundColor: C.gray200 }]}>
                <ActivityIndicator size="large" color={C.primary} />
              </View>
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Avatar
                initials={user?.initials || 'LT'}
                bg={user?.avatarBg || '#F0EEFF'}
                color={user?.avatarColor || '#534AB7'}
                size="L"
                borderColor={C.primary}
              />
            )}
            <View style={[styles.cameraIcon, { backgroundColor: C.primary }]}>
              <Text style={styles.cameraEmoji}>📷</Text>
            </View>
            <Text style={[styles.changePhotoLink, { color: C.primary }]}>{t.edit_profile_change_photo}</Text>
          </TouchableOpacity>

          {/* Form fields */}
          <TextInput label={t.edit_profile_display_name} value={displayName} onChangeText={setDisplayName} />
          <TextInput label={t.edit_profile_username} value={username} onChangeText={setUsername} autoCapitalize="none" />
          <TextInput label={t.edit_profile_bio} value={bio} onChangeText={setBio} multiline numberOfLines={3} maxLength={150} placeholder={t.edit_profile_bio_placeholder} />
          <Text style={[styles.charCount, { color: C.gray600 }]}>{bio.length}/150</Text>

          <View style={[styles.switchRow, { borderTopColor: C.border }]}>
            <Text style={[styles.switchLabel, { color: C.black }]}>{t.edit_profile_private}</Text>
            <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: C.primary }} />
          </View>

          <PrimaryButton label={isSaving ? t.edit_profile_uploading : t.save} onPress={handleSave} loading={isSaving} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1,
  },
  back: { fontSize: 16, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scroll: { padding: Layout.screenPadding, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 24, position: 'relative' },
  avatarImage: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: Colors.primary },
  avatarPlaceholder: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  cameraIcon: {
    position: 'absolute', bottom: 24, right: '50%', marginRight: -52,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  cameraEmoji: { fontSize: 14 },
  changePhotoLink: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: -10, marginBottom: 14 },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderTopWidth: 1, marginBottom: 20,
  },
  switchLabel: { fontSize: 14, fontWeight: '600' },
});
