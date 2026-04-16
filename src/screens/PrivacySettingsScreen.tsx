import React from 'react';
import { View, Text, StyleSheet, Switch, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout, Fonts } from '../constants';
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
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.bgPrimary }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { borderBottomColor: C.borderMedium }]}>
        <Text style={[styles.back, { color: C.primary }]} onPress={() => navigation.goBack()}>{t.back}</Text>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>{t.privacy_title}</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <View style={[styles.row, { borderBottomColor: C.borderSubtle }]}>
          <Text style={[styles.label, { color: C.textPrimary }]}>{t.privacy_private}</Text>
          <Switch value={user?.isPrivate || false} onValueChange={handleTogglePrivate} trackColor={{ true: C.primary }} />
        </View>
        <Text style={[styles.hint, { color: C.textTertiary }]}>{t.privacy_private_hint}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  back: { fontSize: 16, fontFamily: Fonts.bodySemiBold, width: 60 },
  headerTitle: { fontSize: 17, fontFamily: Fonts.displaySemiBold },
  content: { padding: Layout.screenPadding },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  label: { fontSize: 14, fontFamily: Fonts.body },
  hint: { fontSize: 12, fontFamily: Fonts.body, marginTop: 8, lineHeight: 17 },
});
