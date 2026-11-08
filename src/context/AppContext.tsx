'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Country,
  Currency,
  Locale,
  GenerationResult,
  PlatformRole,
  WorkspaceRole,
} from '../lib/types';
import { TRANSLATIONS } from '../lib/i18n/translations';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: PlatformRole;
  country: string;
  locale: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface WorkspaceSummary {
  workspaceId: string;
  workspaceName?: string;
  userId: string;
  email: string;
  country: string;
  currency: string;
  planTier: string;
  subscriptionStatus: string;
  settledBalance: number;
  reservedCredits: number;
  availableCredits: number;
}

export interface WorkspaceMembershipItem {
  workspaceId: string;
  workspaceName: string;
  slug: string;
  role: WorkspaceRole;
  country: Country;
  currency: string;
  planTier: string;
  subscriptionStatus: string;
  availableCredits: number;
}

interface RegisterPayload {
  email: string;
  password: string;
  name?: string;
  workspaceName?: string;
  country: Country;
  locale: Locale;
}

interface AppContextType {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  user: AuthUser | null;
  userId: string | null;
  activeWorkspace: WorkspaceSummary | null;
  workspaceId: string | null;
  workspaceRole: WorkspaceRole | null;
  workspaces: WorkspaceMembershipItem[];
  csrfToken: string | null;
  locale: Locale;
  setLocale: (l: Locale) => void;
  country: Country;
  setCountry: (c: Country) => void;
  currency: Currency;
  credits: number;
  syncCredits: (newBalance: number) => void;
  refreshSession: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; role?: PlatformRole }>;
  register: (input: RegisterPayload) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchWorkspace: (targetWorkspaceId: string) => Promise<{ success: boolean; error?: string }>;
  deductCredit: (amount?: number) => boolean;
  addCredits: (amount: number) => void;
  history: GenerationResult[];
  addToHistory: (item: GenerationResult) => void;
  t: (typeof TRANSLATIONS)['ar'];
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSummary | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceMembershipItem[]>([]);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const [locale, setLocale] = useState<Locale>('ar');
  const [country, setCountry] = useState<Country>('SA');
  const [credits, setCredits] = useState<number>(0);
  const [history, setHistory] = useState<GenerationResult[]>([]);

  const currency: Currency = country === 'SA' ? 'SAR' : 'EGP';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const applySessionPayload = useCallback((data: Record<string, unknown>) => {
    const authUser = data.user as AuthUser | null;
    const ws = (data.activeWorkspace as WorkspaceSummary | null) ?? null;
    const wsRole = (data.workspaceRole as WorkspaceRole | null) ?? null;
    const wsList = Array.isArray(data.workspaces)
      ? (data.workspaces as WorkspaceMembershipItem[])
      : [];
    const token = typeof data.csrfToken === 'string' ? data.csrfToken : null;

    if (!authUser) {
      setIsAuthenticated(false);
      setUser(null);
      setActiveWorkspace(null);
      setWorkspaceRole(null);
      setWorkspaces([]);
      setCsrfToken(null);
      setCredits(0);
      setHistory([]);
      return;
    }

    setIsAuthenticated(true);
    setUser(authUser);
    setActiveWorkspace(ws);
    setWorkspaceRole(wsRole);
    setWorkspaces(wsList);
    setCsrfToken(token);
    setCredits(ws?.availableCredits ?? 0);

    if (ws?.country === 'EG' || ws?.country === 'SA') {
      setCountry(ws.country);
    } else if (authUser.country === 'EG' || authUser.country === 'SA') {
      setCountry(authUser.country);
    }
  }, []);

  const refreshWorkspace = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/session', {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setHistory([]);
        }
        return;
      }
      const data = await res.json();
      if (data?.success && data.workspace) {
        setActiveWorkspace(data.workspace);
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
            modelUsed: String(j.modelUsed || 'gemini-3.1-flash-image'),
            executionMode:
              (j.executionMode as GenerationResult['executionMode']) ||
              'LOCAL_COMPOSITE_SANDBOX',
            synthesizedPrompt: String(j.synthesizedPrompt || ''),
            synthIdDetected: Boolean(j.synthIdDetected),
            fidelityScore: Number(j.fidelityScore ?? 1),
            fidelityVerified: Number(j.fidelityScore ?? 1) >= 0.9,
            completedAt: String(j.completedAt || j.createdAt || new Date().toISOString()),
          }));
        setHistory(completed);
      }
    } catch {
      // Offline / network error
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        setIsAuthLoading(false);
        return;
      }
      const data = (await res.json()) as Record<string, unknown>;
      if (data.authenticated) {
        applySessionPayload(data);
        if (data.activeWorkspace) {
          await refreshWorkspace();
        }
      } else {
        applySessionPayload({ user: null });
      }
    } catch {
      // Ignore transient load error
    } finally {
      setIsAuthLoading(false);
    }
  }, [applySessionPayload, refreshWorkspace]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const authorizedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      const method = (init.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
        headers.set('x-csrf-token', csrfToken);
      }
      return fetch(input, {
        ...init,
        headers,
        credentials: 'include',
      });
    },
    [csrfToken]
  );

  const login = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; error?: string; role?: PlatformRole }> => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: typeof data.error === 'string' ? data.error : 'Invalid email or password',
        };
      }
      applySessionPayload(data);
      if (data.activeWorkspace) {
        await refreshWorkspace();
      }
      const loggedUser = data.user as AuthUser;
      return { success: true, role: loggedUser?.role };
    },
    [applySessionPayload, refreshWorkspace]
  );

  const register = useCallback(
    async (input: RegisterPayload): Promise<{ success: boolean; error?: string }> => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: typeof data.error === 'string' ? data.error : 'Registration failed',
        };
      }
      applySessionPayload(data);
      return { success: true };
    },
    [applySessionPayload]
  );

  const logout = useCallback(async () => {
    try {
      await authorizedFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      applySessionPayload({ user: null });
    }
  }, [authorizedFetch, applySessionPayload]);

  const switchWorkspace = useCallback(
    async (targetWorkspaceId: string): Promise<{ success: boolean; error?: string }> => {
      const res = await authorizedFetch('/api/workspace/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: targetWorkspaceId }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: typeof data.error === 'string' ? data.error : 'Workspace switch failed',
        };
      }
      await refreshSession();
      return { success: true };
    },
    [authorizedFetch, refreshSession]
  );

  const syncCredits = (newBalance: number) => {
    setCredits(newBalance);
    setActiveWorkspace((prev) =>
      prev ? { ...prev, availableCredits: newBalance } : prev
    );
  };

  const deductCredit = (amount = 1): boolean => {
    if (credits < amount) {
      return false;
    }
    syncCredits(credits - amount);
    return true;
  };

  const addCredits = (amount: number) => {
    syncCredits(credits + amount);
  };

  const addToHistory = (item: GenerationResult) => {
    setHistory((prev) => [item, ...prev]);
  };

  const t = TRANSLATIONS[locale];

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        isAuthLoading,
        user,
        userId: user?.id ?? null,
        activeWorkspace,
        workspaceId: activeWorkspace?.workspaceId ?? null,
        workspaceRole,
        workspaces,
        csrfToken,
        locale,
        setLocale,
        country,
        setCountry,
        currency,
        credits,
        syncCredits,
        refreshSession,
        refreshWorkspace,
        authorizedFetch,
        login,
        register,
        logout,
        switchWorkspace,
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
