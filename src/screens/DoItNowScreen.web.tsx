import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '../constants';
import { useColors } from '../hooks/useColors';

export const DoItNowScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, backgroundColor: C.white }]}>
      <Ionicons name="map-outline" size={48} color={C.gray400} />
      <Text style={[styles.title, { color: C.black }]}>Do it now</Text>
      <Text style={[styles.subtitle, { color: C.gray600 }]}>
        Cette fonctionnalité nécessite l'app mobile pour la navigation GPS en temps réel.
      </Text>
      <TouchableOpacity style={[styles.btn, { borderColor: C.borderLight }]} onPress={() => navigation.goBack()}>
        <Text style={[styles.btnText, { color: C.gray700 }]}>Retour</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 },
  title: { fontSize: 22, fontFamily: Fonts.serifBold },
  subtitle: { fontSize: 14, fontFamily: Fonts.serif, textAlign: 'center', lineHeight: 20 },
  btn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, marginTop: 10 },
  btnText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
});
