'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { Camera, Sparkles, CreditCard, Shield, Globe } from 'lucide-react';

export function Navbar() {
  const { locale, setLocale, country, setCountry, credits, t } = useApp();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-dark-900/80 border-b border-dark-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              {t.brandName}
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 font-medium">
                AI Studio
              </span>
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link
            href="/studio"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              pathname === '/studio'
                ? 'text-brand-400 bg-brand-500/10 border border-brand-500/20'
                : 'text-gray-300 hover:text-white hover:bg-dark-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {t.navStudio}
          </Link>
          <Link
            href="/pricing"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              pathname === '/pricing'
                ? 'text-brand-400 bg-brand-500/10 border border-brand-500/20'
                : 'text-gray-300 hover:text-white hover:bg-dark-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            {t.navPricing}
          </Link>
          <Link
            href="/admin"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
              pathname === '/admin'
                ? 'text-brand-400 bg-brand-500/10 border border-brand-500/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-dark-800'
            }`}
          >
            <Shield className="w-4 h-4" />
            {t.navAdmin}
          </Link>
        </nav>

        {/* Action Controls: Credits, Currency, Locale */}
        <div className="flex items-center gap-3">
          {/* Credits Counter Pill */}
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-semibold hover:bg-brand-500/25 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
            <span>
              {credits} {t.credits}
            </span>
          </Link>

          {/* Country / Currency Selector */}
          <div className="flex items-center rounded-lg bg-dark-800 p-0.5 border border-dark-700 text-xs">
            <button
              onClick={() => setCountry('SA')}
              className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                country === 'SA'
                  ? 'bg-dark-900 text-brand-400 font-bold shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="المملكة العربية السعودية (ريال سعودي)"
            >
              🇸🇦 SAR
            </button>
            <button
              onClick={() => setCountry('EG')}
              className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                country === 'EG'
                  ? 'bg-dark-900 text-brand-400 font-bold shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="جمهورية مصر العربية (جنيه مصري)"
            >
              🇪🇬 EGP
            </button>
          </div>

          {/* Language Toggle */}
          <button
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            className="flex items-center gap-1 text-xs text-gray-300 hover:text-white px-2 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 border border-dark-700 transition-colors"
            title="تبديل اللغة / Switch Language"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{locale === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
