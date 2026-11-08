'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import { Lock, Mail, AlertCircle, LogIn } from 'lucide-react';

export default function LoginPage() {
  const { login, locale, t } = useApp();
  const isAr = locale === 'ar';
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await login(email.trim(), password);
      if (!result.success) {
        setErrorMessage(result.error || 'Invalid email or password');
        return;
      }

      const nextParam =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('next')
          : null;
      const safeNext =
        nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
          ? nextParam
          : null;

      if (safeNext) {
        router.push(safeNext);
      } else if (result.role === 'ADMIN' || result.role === 'SUPPORT') {
        router.push('/admin');
      } else {
        router.push('/studio');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-8 shadow-2xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">{t.loginTitle}</h1>
          <p className="text-xs text-gray-400">{t.loginSubtitle}</p>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-300 font-medium mb-1">
              {t.emailLabel}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-500 absolute top-2.5 start-3" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="merchant@store.sa"
                className="w-full ps-9 pe-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-gray-300 font-medium">
                {t.passwordLabel}
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                {isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
              </Link>
            </div>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-brand-500/20"
          >
            <LogIn className="w-4 h-4" />
            <span>{t.navLogin}</span>
          </button>
        </form>

        <div className="pt-4 border-t border-dark-800 text-center">
          <Link
            href="/register"
            className="text-xs text-brand-400 hover:text-brand-300 font-medium"
          >
            {t.noAccountYet}
          </Link>
        </div>
      </div>
    </div>
  );
}
