import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useGuestStore } from '../store/guestStore';
import { useColors } from '../hooks/useColors';

export const AccountPromptModal: React.FC = () => {
  const C = useColors();
  const showAccountPrompt = useGuestStore((s) => s.showAccountPrompt);
  const setShowAccountPrompt = useGuestStore((s) => s.setShowAccountPrompt);
  const setWantsAuth = useGuestStore((s) => s.setWantsAuth);

  const handleCreateAccount = () => {
    setShowAccountPrompt(false);
    setWantsAuth(true);
  };

  const handleDismiss = () => {
    setShowAccountPrompt(false);
  };

  return (
    <Modal visible={showAccountPrompt} transparent animationType="fade" onRequestClose={handleDismiss}>
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.card, { backgroundColor: C.white }]}>
              <View style={[styles.iconCircle, { backgroundColor: C.primary + '15' }]}>
                <Ionicons name="person-add-outline" size={28} color={C.primary} />
              </View>

              <Text style={[styles.title, { color: C.black }]}>Rejoins Proof</Text>
              <Text style={[styles.body, { color: C.gray700 }]}>
                Pour profiter de toutes les fonctionnalités — liker, commenter, sauvegarder, explorer — connecte-toi ou crée un compte.
              </Text>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: C.primary }]}
                onPress={handleCreateAccount}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Créer un compte ou se connecter</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={handleDismiss} activeOpacity={0.7}>
                <Text style={[styles.secondaryBtnText, { color: C.gray700 }]}>Non merci</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.serifBold,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    fontFamily: Fonts.serif,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: Fonts.serifBold,
  },
  secondaryBtn: {
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.serifSemiBold,
  },
});
