import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';

export const NotificationsSettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [likes, setLikes] = useState(true);
  const [followers, setFollowers] = useState(true);
  const [comments, setComments] = useState(true);
  const [reminders, setReminders] = useState(false);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.back} onPress={() => navigation.goBack()}>‹ Retour</Text>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <View style={styles.row}><Text style={styles.label}>Likes sur mes plans</Text><Switch value={likes} onValueChange={setLikes} trackColor={{ true: Colors.primary }} /></View>
        <View style={styles.row}><Text style={styles.label}>Nouveaux followers</Text><Switch value={followers} onValueChange={setFollowers} trackColor={{ true: Colors.primary }} /></View>
        <View style={styles.row}><Text style={styles.label}>Commentaires</Text><Switch value={comments} onValueChange={setComments} trackColor={{ true: Colors.primary }} /></View>
        <View style={styles.row}><Text style={styles.label}>Rappels de plans sauvegardés</Text><Switch value={reminders} onValueChange={setReminders} trackColor={{ true: Colors.primary }} /></View>
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
