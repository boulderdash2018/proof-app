import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { PrimaryButton } from '../components';

export const AccountSettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Retour</Text>
        <Text style={styles.headerTitle}>Compte</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>leo@proof.app</Text>
        <View style={{ marginTop: 20 }}>
          <PrimaryButton label="Changer le mot de passe" onPress={() => Alert.alert('Bientôt disponible')} />
        </View>
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
  label: { fontSize: 12, fontWeight: '600', color: Colors.gray700, marginBottom: 4 },
  value: { fontSize: 15, color: Colors.black },
});
