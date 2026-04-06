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
import { useTranslation } from '../hooks/useTranslation';
import { isUsernameTaken } from '../services/friendsService';

// Instagram-style username rules:
// - Only lowercase letters (a-z), numbers (0-9), periods (.), underscores (_)
// - No accents, spaces, or special characters
// - 1–30 characters
// - Can't start/end with a period
// - No consecutive periods
const USERNAME_REGEX = /^[a-z0-9._]+$/;

const validateUsername = (value: string): string | null => {
  if (value.length === 0) return null;
  if (value.length < 3) return 'setup_username_too_short';
  if (value.length > 30) return 'setup_username_too_long';
  if (value !== value.toLowerCase()) return 'setup_username_no_uppercase';
  // Check for accents / special chars
  if (!USERNAME_REGEX.test(value)) return 'setup_username_invalid_chars';
  if (value.startsWith('.') || value.endsWith('.')) return 'setup_username_no_period_edges';
  if (value.includes('..')) return 'setup_username_no_consecutive_periods';
  return null; // valid
};

export const SetupProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const setUser = useAuthStore((s) => s.setUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();

  const [step, setStep] = useState(1);

  // Step 1 state
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Step 3 state
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Auto-sanitize: force lowercase, strip disallowed chars as user types
  const handleUsernameChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    setUsername(sanitized);
  };

  // Username validation + availability check
  useEffect(() => {
    if (!username.trim()) {
      setUsernameAvailable(null);
      setUsernameError(null);
      return;
    }

    // Local format validation first
    const formatError = validateUsername(username);
    if (formatError) {
      setUsernameError(formatError);
      setUsernameAvailable(null);
      return;
    }

    setUsernameError(null);
    setCheckingUsername(true);

    const timer = setTimeout(async () => {
      try {
        const taken = await isUsernameTaken(username, user?.id);
        setUsernameAvailable(!taken);
      } catch (err) {
        console.error('Username check error:', err);
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  const toggleCategory = (name: string) => {
    setSelectedCategories((prev) =>
      prev.includes(name)
        ? prev.filter((c) => c !== name)
        : [...prev, name],
    );
  };

  const handleFinish = async () => {
    if (user) {
      // Save username + mark setup complete in Firestore
      await updateProfile({ username, setupComplete: true });
      // Update local state — RootNavigator will auto-switch to Main
      setUser({ ...user, username, setupComplete: true });
    }
  };

  const getErrorMessage = (key: string | null): string => {
    if (!key) return '';
    return (t as any)[key] || key;
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

  const isStep1Valid = username.trim().length >= 3 && !usernameError && usernameAvailable === true;

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t.setup_choose_username}</Text>

      <View style={styles.usernameRow}>
        <Text style={styles.atPrefix}>@</Text>
        <TextInput
          value={username}
          onChangeText={handleUsernameChange}
          placeholder={t.setup_username_placeholder}
          autoCapitalize="none"
          style={styles.usernameInput}
        />
      </View>

      {usernameError && (
        <Text style={[styles.availabilityText, styles.unavailable]}>
          {getErrorMessage(usernameError)}
        </Text>
      )}

      {!usernameError && username.trim().length >= 3 && !checkingUsername && usernameAvailable !== null && (
        <Text
          style={[
            styles.availabilityText,
            usernameAvailable ? styles.available : styles.unavailable,
          ]}
        >
          {usernameAvailable
            ? t.setup_username_available
            : t.setup_username_taken}
        </Text>
      )}
      {checkingUsername && (
        <Text style={styles.checkingText}>{t.setup_checking}</Text>
      )}

      <Text style={styles.usernameHint}>{t.setup_username_hint}</Text>

      <View style={styles.stepBottom}>
        <PrimaryButton
          label={t.next}
          onPress={() => setStep(2)}
          disabled={!isStep1Valid}
        />
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t.setup_add_photo}</Text>

      <View style={styles.avatarCenter}>
        <Avatar
          initials="LT"
          bg={Colors.purpleBg}
          color={Colors.purple}
          size="L"
        />
      </View>

      <PrimaryButton
        label={t.setup_choose_photo}
        onPress={() => Alert.alert(t.setup_image_picker)}
      />

      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => setStep(3)}
      >
        <Text style={styles.skipText}>{t.setup_skip}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t.setup_interests}</Text>
      <Text style={styles.selectionCount}>
        {selectedCategories.length}/12 {t.setup_selected}
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
          label={t.setup_finish}
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
  usernameHint: {
    fontSize: 11,
    color: Colors.gray700,
    marginTop: 2,
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
