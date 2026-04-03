import { fr, en } from '../i18n';
import { useLanguageStore } from '../store/languageStore';
import type { TranslationKeys } from '../i18n';

const translations = { fr, en };

export const useTranslation = () => {
  const language = useLanguageStore((s) => s.language);
  const t = translations[language];
  return { t, language };
};
