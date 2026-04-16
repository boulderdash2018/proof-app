import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';

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
          <Ionicons name="close" size={18} color={Colors.textOnAccent} />
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
    backgroundColor: 'rgba(44, 36, 32, 0.4)',
  },
  card: {
    backgroundColor: Colors.bgSecondary,
    padding: 28,
    borderRadius: 16,
    alignItems: 'center',
    gap: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  text: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
