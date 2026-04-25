import { useEffect, useRef, useState } from 'react';

export interface SouvenirPrompt {
  id: string;
  copy: string;
  /** When the prompt was emitted, used by the toast for auto-dismiss. */
  createdAt: number;
}

/**
 * Rotating copy bank — one of these is picked at random for each
 * prompt. Tone : warm, complice, jamais publicitaire. Mix of poetic +
 * playful so the same prompt doesn't get stale.
 */
const COPY_BANK: string[] = [
  'Souvenir à plusieurs ?',
  'Le crew est posé. Photo ?',
  'Capturez ce moment 📸',
  'Une photo pour la postérité ?',
  'Vous êtes là tous ensemble. Snap ?',
  'Immortalisez ce moment',
  'Photo de groupe ?',
  'Tous présents. Un cliché ?',
  'Garde la trace de ce moment',
  'Une image vaut mieux qu\'un long check-in',
  'Petit selfie collectif ?',
  'Une photo pour la suite ?',
];

const pickCopy = (): string => COPY_BANK[Math.floor(Math.random() * COPY_BANK.length)];

interface Trigger {
  /** Unique key used to dedupe re-fires for the same trigger. */
  key: string;
  /** Optional delay before the prompt actually appears (ms). */
  delay?: number;
}

/**
 * Emits a SouvenirPrompt at trigger points during the session :
 *   • on arrival at a place
 *   • when the user has stayed at a place ~3 min (mid-checkpoint)
 *   • when about to leave a place
 *
 * Caller pushes triggers via the returned `fire(key)` ; the hook
 * picks a random copy and exposes the latest prompt for ~12s.
 *
 * Designed so multiple components can share a single feed via prop
 * lifting — this hook lives ONCE near the top of DoItNowScreen.
 */
export const useSouvenirPrompts = () => {
  const [current, setCurrent] = useState<SouvenirPrompt | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setCurrent(null);
  };

  const fire = (trigger: Trigger) => {
    if (seenRef.current.has(trigger.key)) return;
    seenRef.current.add(trigger.key);
    const launch = () => {
      const prompt: SouvenirPrompt = {
        id: `${trigger.key}-${Date.now()}`,
        copy: pickCopy(),
        createdAt: Date.now(),
      };
      setCurrent(prompt);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setCurrent(null), 9_000);
    };
    if (trigger.delay && trigger.delay > 0) {
      setTimeout(launch, trigger.delay);
    } else {
      launch();
    }
  };

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  return { current, fire, dismiss };
};
