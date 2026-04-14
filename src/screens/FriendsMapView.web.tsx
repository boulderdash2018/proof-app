import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '../constants';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const FriendsMapView: React.FC<Props> = ({ visible, onClose }) => (
  <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.text}>Carte disponible uniquement sur mobile</Text>
        <TouchableOpacity onPress={onClose} style={styles.btn}>
          <Ionicons name="close" size={18} color="#E8E0D6" />
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    backgroundColor: '#1C1917',
    padding: 28,
    borderRadius: 16,
    alignItems: 'center',
    gap: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  text: {
    color: '#A09585',
    fontSize: 14,
    fontFamily: Fonts.serif,
    textAlign: 'center',
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3D352E',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
