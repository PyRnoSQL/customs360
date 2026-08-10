import React, { createContext, useContext, useState, useCallback } from 'react';
import { TRANSLATIONS } from './translations';

export type Language = 'FR' | 'EN';

interface LanguageCtx {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const Ctx = createContext<LanguageCtx>({
  language: 'FR',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key: string) => key,
});

export const useLanguage = () => useContext(Ctx);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('FR');

  const toggleLanguage = useCallback(() => {
    setLanguage(l => (l === 'FR' ? 'EN' : 'FR'));
  }, []);

  // Simple dot-path lookup into TRANSLATIONS[language]; falls back to FR,
  // then to the raw key itself so a missing translation never breaks render.
  const t = useCallback((key: string): string => {
    const dict = TRANSLATIONS[language] ?? TRANSLATIONS.FR;
    const value = key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, dict);
    if (typeof value === 'string') return value;

    // Fallback to French if the key is missing in the active language
    const fallback = key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, TRANSLATIONS.FR);
    if (typeof fallback === 'string') return fallback;

    return key;
  }, [language]);

  return (
    <Ctx.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </Ctx.Provider>
  );
}
