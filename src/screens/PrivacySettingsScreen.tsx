import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { useTranslation } from '../hooks/useTranslation';

export const PrivacySettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [isPrivate, setIsPrivate] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>{t.back}</Text>
        <Text style={styles.headerTitle}>{t.privacy_title}</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <View style={styles.row}><Text style={styles.label}>{t.privacy_private}</Text><Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ true: Colors.primary }} /></View>
        <View style={styles.row}><Text style={styles.label}>{t.privacy_approval}</Text><Switch value={approvalRequired} onValueChange={setApprovalRequired} trackColor={{ true: Colors.primary }} /></View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { fontSize: 16, color: Colors.primary, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  content: { padding: Layout.screenPadding },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  label: { fontSize: 14, color: Colors.black },
});
