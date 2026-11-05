'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Country, Currency, Locale, GenerationResult } from '../lib/types';
import { TRANSLATIONS } from '../lib/i18n/translations';

interface AppContextType {
  workspaceId: string;
  userId: string;
  locale: Locale;
  setLocale: (l: Locale) => void;
  country: Country;
  setCountry: (c: Country) => void;
  currency: Currency;
  credits: number;
  syncCredits: (newBalance: number) => void;
  refreshWorkspace: () => Promise<void>;
  deductCredit: (amount?: number) => boolean;
  addCredits: (amount: number) => void;
  history: GenerationResult[];
  addToHistory: (item: GenerationResult) => void;
  t: (typeof TRANSLATIONS)['ar'];
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId] = useState<string>('ws-default-studio');
  const [userId] = useState<string>('user-default-merchant');
  const [locale, setLocale] = useState<Locale>('ar');
  const [country, setCountry] = useState<Country>('SA');
  const [credits, setCredits] = useState<number>(5);
  const [history, setHistory] = useState<GenerationResult[]>([]);

  const currency: Currency = country === 'SA' ? 'SAR' : 'EGP';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const refreshWorkspace = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/session', {
        headers: {
          'x-workspace-id': workspaceId,
          'x-user-id': userId,
          'x-country': country,
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && data.workspace) {
        setCredits(data.workspace.availableCredits);
      }
      if (Array.isArray(data?.recentJobs)) {
        const completed = data.recentJobs
          .filter((j: Record<string, unknown>) => j.status === 'COMPLETED' && j.imageUrl)
          .map((j: Record<string, unknown>) => ({
            jobId: String(j.jobId),
            imageUrl: String(j.imageUrl),
            thumbnailUrl: String(j.imageUrl),
            aspectRatio: (j.aspectRatio as GenerationResult['aspectRatio']) || '1:1',
            resolution: String(j.resolution || '1024x1024'),
            modelUsed: String(j.modelUsed || 'gemini-nano-banana-2.1'),
            executionMode:
              (j.executionMode as GenerationResult['executionMode']) ||
              'LOCAL_COMPOSITE_SANDBOX',
            synthesizedPrompt: String(j.synthesizedPrompt || ''),
            synthIdDetected: Boolean(j.synthIdDetected),
            fidelityScore: Number(j.fidelityScore ?? 1),
            fidelityVerified: Number(j.fidelityScore ?? 1) >= 0.9,
            completedAt: String(j.completedAt || j.createdAt || new Date().toISOString()),
          }));
        if (completed.length > 0) {
          setHistory(completed);
        }
      }
    } catch {
      // Offline / initial render fallback
    }
  }, [workspaceId, userId, country]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const syncCredits = (newBalance: number) => {
    setCredits(newBalance);
  };

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
        workspaceId,
        userId,
        locale,
        setLocale,
        country,
        setCountry,
        currency,
        credits,
        syncCredits,
        refreshWorkspace,
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
