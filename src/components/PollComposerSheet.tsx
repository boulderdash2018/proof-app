import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Modal,
  TouchableWithoutFeedback, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts } from '../constants';

interface PollComposerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (question: string, options: string[]) => Promise<void> | void;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

/**
 * Lightweight bottom-sheet composer for creating a poll.
 *
 * Question + 2..5 options. Submit calls onSubmit then closes.
 */
export const PollComposerSheet: React.FC<PollComposerSheetProps> = ({
  visible, onClose, onSubmit,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuestion('');
      setOptions(['', '']);
      setSubmitting(false);
    }
  }, [visible]);

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const trimmedOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
  const canSubmit = question.trim().length > 0 && trimmedOptions.length >= MIN_OPTIONS;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(question.trim(), trimmedOptions);
      onClose();
    } catch (err) {
      console.warn('[PollComposerSheet] submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ width: 28 }} />
            <View style={styles.titleWrap}>
              <Text style={styles.eyebrow}>NOUVEAU SONDAGE</Text>
              <Text style={styles.title}>Qu{'\u2019'}est-ce qu{'\u2019'}on décide ?</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Question */}
            <Text style={styles.sectionLabel}>LA QUESTION</Text>
            <View style={styles.questionBox}>
              <TextInput
                style={styles.questionInput}
                placeholder="On se retrouve où ?"
                placeholderTextColor={Colors.textTertiary}
                value={question}
                onChangeText={setQuestion}
                maxLength={120}
                multiline
                autoFocus
              />
            </View>

            {/* Options */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              OPTIONS · {options.length}/{MAX_OPTIONS}
            </Text>
            {options.map((opt, i) => (
              <View key={i} style={styles.optionRow}>
                <View style={styles.optionIndex}>
                  <Text style={styles.optionIndexText}>{i + 1}</Text>
                </View>
                <TextInput
                  style={styles.optionInput}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor={Colors.textTertiary}
                  value={opt}
                  onChangeText={(v) => updateOption(i, v)}
                  maxLength={60}
                />
                {options.length > MIN_OPTIONS && (
                  <TouchableOpacity
                    onPress={() => removeOption(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.removeBtn}
                  >
                    <Ionicons name="close" size={15} color={Colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {options.length < MAX_OPTIONS && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={addOption}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={16} color={Colors.primary} />
                <Text style={styles.addBtnText}>Ajouter une option</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, { opacity: canSubmit ? 1 : 0.5 }]}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.textOnAccent} />
              ) : (
                <>
                  <Ionicons name="bar-chart" size={16} color={Colors.textOnAccent} />
                  <Text style={styles.submitBtnText}>Publier le sondage</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(44,36,32,0.4)' },
  sheetWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: '18%',
  },
  sheet: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray400,
    opacity: 0.3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
  },
  titleWrap: { flex: 1, alignItems: 'center' },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  questionBox: {
    marginHorizontal: 16,
    backgroundColor: Colors.bgTertiary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  questionInput: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    minHeight: 24,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.bgTertiary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  optionIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIndexText: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    color: Colors.primaryDeep,
  },
  optionInput: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    padding: 0,
  },
  removeBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 4,
    paddingVertical: 10,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: Colors.terracotta200,
    backgroundColor: 'transparent',
  },
  addBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 18,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  submitBtnText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
});
