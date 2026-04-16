import React from 'react';
import { View, Text, StyleSheet, Alert, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout, Fonts } from '../constants';
import { PrimaryButton } from '../components';
import { useTranslation } from '../hooks/useTranslation';

export const AccountSettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>{t.back}</Text>
        <Text style={styles.headerTitle}>{t.account_title}</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>leo@proof.app</Text>
        <View style={{ marginTop: 20 }}>
          <PrimaryButton label={t.account_change_password} onPress={() => Alert.alert(t.account_coming_soon)} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderMedium },
  back: { fontSize: 16, color: Colors.primary, fontFamily: Fonts.bodySemiBold, width: 60 },
  headerTitle: { fontSize: 17, fontFamily: Fonts.displaySemiBold, color: Colors.textPrimary },
  content: { padding: Layout.screenPadding },
  label: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: Colors.textSecondary, marginBottom: 4 },
  value: { fontSize: 15, fontFamily: Fonts.body, color: Colors.textPrimary },
});
