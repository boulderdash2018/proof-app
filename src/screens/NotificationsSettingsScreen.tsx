import React from 'react';
import { View, Text, StyleSheet, Switch, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { useSettingsStore } from '../store';

export const NotificationsSettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const { t } = useTranslation();

  const {
    notifLikes, notifFollowers, notifComments, notifReminders,
    setNotifLikes, setNotifFollowers, setNotifComments, setNotifReminders,
  } = useSettingsStore();

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.bgPrimary }]}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { borderBottomColor: C.borderMedium }]}>
        <Text style={[styles.back, { color: C.primary }]} onPress={() => navigation.goBack()}>{t.back}</Text>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>{t.notif_settings_title}</Text>
        <View style={{ width: 60 }} />
      </View>
      <View style={styles.content}>
        <View style={[styles.row, { borderBottomColor: C.borderSubtle }]}>
          <Text style={[styles.label, { color: C.textPrimary }]}>{t.notif_settings_likes}</Text>
          <Switch value={notifLikes} onValueChange={setNotifLikes} trackColor={{ true: C.primary }} />
        </View>
        <View style={[styles.row, { borderBottomColor: C.borderSubtle }]}>
          <Text style={[styles.label, { color: C.textPrimary }]}>{t.notif_settings_followers}</Text>
          <Switch value={notifFollowers} onValueChange={setNotifFollowers} trackColor={{ true: C.primary }} />
        </View>
        <View style={[styles.row, { borderBottomColor: C.borderSubtle }]}>
          <Text style={[styles.label, { color: C.textPrimary }]}>{t.notif_settings_comments}</Text>
          <Switch value={notifComments} onValueChange={setNotifComments} trackColor={{ true: C.primary }} />
        </View>
        <View style={[styles.row, { borderBottomColor: C.borderSubtle }]}>
          <Text style={[styles.label, { color: C.textPrimary }]}>{t.notif_settings_reminders}</Text>
          <Switch value={notifReminders} onValueChange={setNotifReminders} trackColor={{ true: C.primary }} />
        </View>
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
});
