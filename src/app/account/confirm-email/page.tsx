'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../context/AppContext';
import { CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

export default function ConfirmEmailChangePage() {
  const { isAuthenticated, isAuthLoading, locale, refreshSession, authorizedFetch } = useApp();
  const isAr = locale === 'ar';
  const router = useRouter();

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'unauth'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    async function confirmChange() {
      if (isAuthLoading) return;
      if (!isAuthenticated) {
        setStatus('unauth');
        return;
      }

      // 1. Read token from URL hash (#token=...) to avoid referrer leakage
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const match = hash.match(/#token=([a-zA-Z0-9_-]+)/);
      const rawToken = match ? match[1] : null;

      // 2. Immediately strip hash from browser history
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(
          null,
          document.title,
          window.location.pathname + window.location.search
        );
      }

      if (!rawToken) {
        setStatus('error');
        setErrorMessage(
          isAr
            ? 'رمز تأكيد تغيير البريد الإلكتروني غير متوفر في الرابط.'
            : 'Email change confirmation token is missing.'
        );
        return;
      }

      try {
        const res = await authorizedFetch('/api/auth/email/change-confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: rawToken }),
        });

        const body = await res.json().catch(() => ({}));

        if (!res.ok || !body.success) {
          setStatus('error');
          setErrorMessage(
            body.error ||
              (isAr
                ? 'فشل تأكيد تغيير البريد الإلكتروني. قد يكون الرابط منتهي الصلاحية.'
                : 'Failed to confirm email change.')
          );
          return;
        }

        setStatus('success');
        await refreshSession().catch(() => {});
        setTimeout(() => {
          router.push('/account');
        }, 2000);
      } catch {
        setStatus('error');
        setErrorMessage(
          isAr
            ? 'حدث خطأ في الاتصال بالخادم.'
            : 'Network error occurred during confirmation.'
        );
      }
    }

    void confirmChange();
  }, [isAuthenticated, isAuthLoading, isAr, refreshSession, authorizedFetch, router]);

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-8 shadow-2xl space-y-6">
        {status === 'loading' && (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto" />
            <h1 className="text-xl font-bold text-white">
              {isAr ? 'جاري تأكيد البريد الإلكتروني الجديد...' : 'Confirming new email...'}
            </h1>
          </div>
        )}

        {status === 'unauth' && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-white">
              {isAr ? 'تسجيل الدخول مطلوب' : 'Authentication Required'}
            </h1>
            <p className="text-xs text-gray-300">
              {isAr
                ? 'يرجى تسجيل الدخول إلى حسابك أولاً لتأكيد تغيير البريد الإلكتروني.'
                : 'Please log in to your account first to confirm your new email.'}
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-sm transition-colors shadow-lg shadow-brand-500/20"
              >
                <span>{isAr ? 'تسجيل الدخول' : 'Log In'}</span>
              </Link>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              {isAr ? 'تم تحديث البريد الإلكتروني بنجاح!' : 'Email Updated Successfully!'}
            </h1>
            <p className="text-xs text-gray-300">
              {isAr
                ? 'تم تغيير البريد الإلكتروني لحسابك وتسجيل الخروج من الجلسات الأخرى. جاري توجيهك إلى صفحة الحساب...'
                : 'Your email address has been updated and other sessions were revoked. Redirecting to account...'}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-white">
              {isAr ? 'تعذر تأكيد تغيير البريد' : 'Confirmation Failed'}
            </h1>
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">
              {errorMessage}
            </p>
            <div className="pt-2">
              <Link
                href="/account"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 text-white text-xs font-semibold transition-colors"
              >
                <span>{isAr ? 'العودة إلى الحساب' : 'Back to Account'}</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
