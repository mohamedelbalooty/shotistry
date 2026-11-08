'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import { Country } from '../../lib/types';
import { Sparkles, AlertCircle, UserPlus } from 'lucide-react';

export default function RegisterPage() {
  const { register, country, locale, t } = useApp();
  const router = useRouter();

  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(country);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        workspaceName: workspaceName.trim() || undefined,
        country: selectedCountry,
        locale,
      });
      if (!result.success) {
        setErrorMessage(result.error || 'Registration failed');
        return;
      }
      router.push('/studio');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-8 shadow-2xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">{t.registerTitle}</h1>
          <p className="text-xs text-gray-400">{t.registerSubtitle}</p>
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
              {t.nameLabel}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="طارق العتيبي"
              className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-300 font-medium mb-1">
              {t.workspaceNameLabel}
            </label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="متجر العود الملكي"
              className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-300 font-medium mb-1">
              {t.emailLabel}
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@oudstore.sa"
              className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-300 font-medium mb-1">
              {t.passwordLabel}
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white focus:outline-none focus:border-brand-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">{t.passwordHint}</p>
          </div>

          <div>
            <label className="block text-xs text-gray-300 font-medium mb-1">
              {t.countryLabel}
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedCountry('SA')}
                className={`p-2.5 rounded-lg border font-bold ${
                  selectedCountry === 'SA'
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-dark-700 bg-dark-950 text-gray-400'
                }`}
              >
                🇸🇦 {t.saudiSar}
              </button>
              <button
                type="button"
                onClick={() => setSelectedCountry('EG')}
                className={`p-2.5 rounded-lg border font-bold ${
                  selectedCountry === 'EG'
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-dark-700 bg-dark-950 text-gray-400'
                }`}
              >
                🇪🇬 {t.egyptEgp}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-brand-500/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t.navRegister}</span>
          </button>
        </form>

        <div className="pt-4 border-t border-dark-800 text-center">
          <Link
            href="/login"
            className="text-xs text-brand-400 hover:text-brand-300 font-medium"
          >
            {t.alreadyHaveAccount}
          </Link>
        </div>
      </div>
    </div>
  );
}
