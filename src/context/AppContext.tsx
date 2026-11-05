'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Country, Currency, Locale, GenerationResult } from '../lib/types';
import { TRANSLATIONS } from '../lib/i18n/translations';

interface AppContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  country: Country;
  setCountry: (c: Country) => void;
  currency: Currency;
  credits: number;
  deductCredit: (amount?: number) => boolean;
  addCredits: (amount: number) => void;
  history: GenerationResult[];
  addToHistory: (item: GenerationResult) => void;
  t: (typeof TRANSLATIONS)['ar'];
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('ar');
  const [country, setCountry] = useState<Country>('SA');
  const [credits, setCredits] = useState<number>(5); // 5 Free Starter Credits
  const [history, setHistory] = useState<GenerationResult[]>([]);

  const currency: Currency = country === 'SA' ? 'SAR' : 'EGP';

  // Apply direction and language attributes to the <html> tag
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const deductCredit = (amount = 1): boolean => {
    if (credits < amount) {
      return false;
    }
    setCredits((prev) => prev - amount);
    return true;
  };

  const addCredits = (amount: number) => {
    setCredits((prev) => prev + amount);
  };

  const addToHistory = (item: GenerationResult) => {
    setHistory((prev) => [item, ...prev]);
  };

  const t = TRANSLATIONS[locale];

  return (
    <AppContext.Provider
      value={{
        locale,
        setLocale,
        country,
        setCountry,
        currency,
        credits,
        deductCredit,
        addCredits,
        history,
        addToHistory,
        t,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
