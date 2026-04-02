import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout, CATEGORIES } from '../constants';
import { PrimaryButton, TextInput, Avatar, Chip } from '../components';
import { useAuthStore } from '../store';

export const SetupProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState(1);

  // Step 1 state
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Step 3 state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Username availability check
  useEffect(() => {
    if (!username.trim()) {
      setUsernameAvailable(null);
      return;
    }
    setCheckingUsername(true);
    const timer = setTimeout(() => {
      // Simulate availability: "taken" is unavailable, everything else is available
      setUsernameAvailable(username.toLowerCase() !== 'taken');
      setCheckingUsername(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [username]);

  const toggleCategory = (name: string) => {
    setSelectedCategories((prev) =>
      prev.includes(name)
        ? prev.filter((c) => c !== name)
        : [...prev, name],
    );
  };

  const handleFinish = () => {
    if (user) {
      setUser({ ...user, isAuthenticated: true } as any);
    }
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const renderProgressBar = () => (
    <View style={styles.progressBar}>
      {[1, 2, 3].map((s) => (
        <View
          key={s}
          style={[
            styles.progressSegment,
            s <= step ? styles.progressFilled : styles.progressEmpty,
          ]}
        />
      ))}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Choisis ton pseudo</Text>

      <View style={styles.usernameRow}>
        <Text style={styles.atPrefix}>@</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="tonpseudo"
          autoCapitalize="none"
          style={styles.usernameInput}
        />
      </View>

      {username.trim().length > 0 && !checkingUsername && usernameAvailable !== null && (
        <Text
          style={[
            styles.availabilityText,
            usernameAvailable ? styles.available : styles.unavailable,
          ]}
        >
          {usernameAvailable
            ? '✅ Pseudo disponible'
            : '❌ Pseudo déjà pris'}
        </Text>
      )}
      {checkingUsername && (
        <Text style={styles.checkingText}>Vérification...</Text>
      )}

      <View style={styles.stepBottom}>
        <PrimaryButton
          label="Suivant"
          onPress={() => setStep(2)}
          disabled={!username.trim() || !usernameAvailable}
        />
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Ajoute une photo</Text>

      <View style={styles.avatarCenter}>
        <Avatar
          initials="LT"
          bg={Colors.purpleBg}
          color={Colors.purple}
          size="L"
        />
      </View>

      <PrimaryButton
        label="Choisir une photo"
        onPress={() => Alert.alert('Image Picker simulé')}
      />

      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => setStep(3)}
      >
        <Text style={styles.skipText}>Passer</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Qu'est-ce qui te correspond ?</Text>
      <Text style={styles.selectionCount}>
        {selectedCategories.length}/12 sélectionnées
      </Text>

      <View style={styles.chipGrid}>
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat.name}
            label={`${cat.emoji} ${cat.name}`}
            variant={selectedCategories.includes(cat.name) ? 'filled-black' : 'filled-gray'}
            selected={selectedCategories.includes(cat.name)}
            onPress={() => toggleCategory(cat.name)}
          />
        ))}
      </View>

      <View style={styles.stepBottom}>
        <PrimaryButton
          label="Terminer"
          onPress={handleFinish}
          disabled={selectedCategories.length < 3}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderProgressBar()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingHorizontal: Layout.screenPadding,
  },
  progressBar: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 12,
    marginBottom: 32,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  progressFilled: {
    backgroundColor: Colors.black,
  },
  progressEmpty: {
    backgroundColor: '#E8E8E8',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 20,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  atPrefix: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.black,
    marginBottom: 14,
  },
  usernameInput: {
    flex: 1,
  },
  availabilityText: {
    fontSize: 13,
    marginTop: -6,
    marginBottom: 8,
    marginLeft: 2,
  },
  available: {
    color: Colors.success,
  },
  unavailable: {
    color: Colors.error,
  },
  checkingText: {
    fontSize: 13,
    color: Colors.gray700,
    marginTop: -6,
    marginBottom: 8,
    marginLeft: 2,
  },
  stepBottom: {
    marginTop: 'auto' as any,
    paddingBottom: 20,
  },
  avatarCenter: {
    alignItems: 'center',
    marginVertical: 32,
  },
  skipButton: {
    alignItems: 'center',
    marginTop: 18,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.gray700,
  },
  selectionCount: {
    fontSize: 13,
    color: Colors.gray700,
    marginBottom: 16,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
