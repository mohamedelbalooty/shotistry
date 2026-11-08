'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

export default function VerifyEmailPage() {
  const { locale, refreshSession, t } = useApp();
  const isAr = locale === 'ar';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    async function verify() {
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
            ? 'رابط التحقق غير صالح أو غير مكتمل (رمز التأكيد مفقود).'
            : 'Verification link is invalid or incomplete (missing token).'
        );
        return;
      }

      try {
        const res = await fetch('/api/auth/verify-email/confirm', {
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
                ? 'فشل التحقق من البريد الإلكتروني. قد يكون الرابط منتهي الصلاحية أو تم استخدامه مسبقاً.'
                : 'Failed to verify email. The link may have expired or already been used.')
          );
          return;
        }

        setStatus('success');
        await refreshSession().catch(() => {});
      } catch {
        setStatus('error');
        setErrorMessage(
          isAr
            ? 'حدث خطأ في الاتصال بالخادم أثناء التحقق.'
            : 'Network error occurred during verification.'
        );
      }
    }

    void verify();
  }, [isAr, refreshSession]);

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-8 shadow-2xl space-y-6">
        {status === 'loading' && (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 text-brand-400 animate-spin mx-auto" />
            <h1 className="text-xl font-bold text-white">
              {isAr ? 'جاري تأكيد بريدك الإلكتروني...' : 'Verifying your email...'}
            </h1>
            <p className="text-xs text-gray-400">
              {isAr
                ? 'لحظات ونقوم بتأكيد هويتك وتفعيل حسابك بالكامل.'
                : 'Please wait while we verify your account.'}
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              {isAr ? 'تم تأكيد البريد الإلكتروني بنجاح!' : 'Email Verified Successfully!'}
            </h1>
            <p className="text-sm text-gray-300">
              {isAr
                ? 'أصبح حسابك الآن موثقاً بالكامل، ويمكنك الاستفادة من جميع الميزات وشراء الباقات.'
                : 'Your account is now fully verified. You can access all features and subscriptions.'}
            </p>
            <div className="pt-4">
              <Link
                href="/studio"
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-sm transition-colors shadow-lg shadow-brand-500/20"
              >
                <span>{isAr ? 'الانتقال إلى الاستوديو' : 'Go to Studio'}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              {isAr ? 'تعذر تأكيد البريد الإلكتروني' : 'Verification Failed'}
            </h1>
            <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">
              {errorMessage}
            </p>
            <div className="pt-4 space-y-2">
              <Link
                href="/account"
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 text-white font-medium text-sm transition-colors"
              >
                <span>
                  {isAr ? 'الذهاب إلى الحساب لطلب رابط جديد' : 'Go to Account to Resend'}
                </span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
