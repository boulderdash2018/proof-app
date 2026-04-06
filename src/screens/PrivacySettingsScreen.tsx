import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { useAuthStore } from '../store';

export const PrivacySettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const { t } = useTranslation();

  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const handleTogglePrivate = (value: boolean) => {
    updateProfile({ isPrivate: value });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.back, { color: C.primary }]} onPress={() => navigation.goBack()}>{t.back}</Text>
        <Text style={[styles.headerTitle, { color: C.black }]}>{t.privacy_title}</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <View style={[styles.row, { borderBottomColor: C.borderLight }]}>
          <Text style={[styles.label, { color: C.black }]}>{t.privacy_private}</Text>
          <Switch value={user?.isPrivate || false} onValueChange={handleTogglePrivate} trackColor={{ true: C.primary }} />
        </View>
        <Text style={[styles.hint, { color: C.gray600 }]}>{t.privacy_private_hint}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  back: { fontSize: 16, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  content: { padding: Layout.screenPadding },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  label: { fontSize: 14 },
  hint: { fontSize: 12, marginTop: 8, lineHeight: 17 },
});
