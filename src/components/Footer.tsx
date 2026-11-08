'use client';

import React from 'react';
import Link from 'next/link';
import { useApp } from '../context/AppContext';
import { Camera, ShieldCheck, Heart } from 'lucide-react';

export function Footer() {
  const { t, isAuthenticated, user } = useApp();
  const isPlatformStaff =
    isAuthenticated && (user?.role === 'ADMIN' || user?.role === 'SUPPORT');

  return (
    <footer className="border-t border-dark-800 bg-dark-950 py-12 text-sm text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white">
                <Camera className="w-4 h-4" />
              </div>
              <span className="text-lg font-bold text-white">{t.brandName}</span>
            </div>
            <p className="text-gray-400 max-w-md text-sm leading-relaxed mb-4">
              {t.tagline}. {t.heroSubtitle}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>مدعوم بواسطة Google Gemini و Paymob للمدفوعات المعتمدة</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold mb-3">روابط سريعة</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/studio" className="hover:text-brand-400 transition-colors">
                  {t.navStudio}
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-brand-400 transition-colors">
                  {t.navPricing}
                </Link>
              </li>
              <li>
                <Link
                  href={isAuthenticated ? '/account' : '/login'}
                  className="hover:text-brand-400 transition-colors"
                >
                  {isAuthenticated ? t.navAccount : t.navLogin}
                </Link>
              </li>
              {isPlatformStaff && (
                <li>
                  <Link href="/admin" className="hover:text-brand-400 transition-colors">
                    {t.navAdmin}
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* Regional & Support */}
          <div>
            <h4 className="text-white font-semibold mb-3">الأسواق المدعومة</h4>
            <ul className="space-y-2 text-xs text-gray-400">
              <li>🇸🇦 المملكة العربية السعودية (متاجر سلة، زد)</li>
              <li>🇪🇬 جمهورية مصر العربية (إنستغرام، شوبيفاي)</li>
              <li className="pt-2 text-gray-500">
                طرق الدفع: مدى، أبل باي، ميزة، فيزا، وماستركارد عبر Paymob
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-dark-800 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4">
          <p>© {new Date().getFullYear()} {t.brandName} (Shotistry Inc). جميع الحقوق محفوظة.</p>
          <p className="flex items-center gap-1">
            صنع باحترافية للتجارة الإلكترونية في الشرق الأوسط{' '}
            <Heart className="w-3.5 h-3.5 text-rose-500 inline fill-rose-500" />
          </p>
        </div>
      </div>
    </footer>
  );
}
