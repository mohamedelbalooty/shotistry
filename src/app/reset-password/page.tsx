'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import { Lock, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

export default function ResetPasswordPage() {
  const { locale, t } = useApp();
  const isAr = locale === 'ar';
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // 1. Read token from URL hash (#token=...) to prevent referrer leak
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const match = hash.match(/#token=([a-zA-Z0-9_-]+)/);
    if (match) {
      setToken(match[1]);
    } else {
      setErrorMessage(
        isAr
          ? 'رمز إعادة التعيين مفقود أو غير صالح. يرجى طلب رابط جديد.'
          : 'Password reset token is missing or invalid. Please request a new link.'
      );
    }

    // 2. Immediately strip hash from browser history
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname + window.location.search
      );
    }
  }, [isAr]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage(
        isAr ? 'رمز إعادة التعيين غير متوفر.' : 'Reset token is missing.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage(
        isAr
          ? 'كلمتا المرور غير متطابقتين.'
          : 'Passwords do not match.'
      );
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage(
        isAr
          ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.'
          : 'Password must be at least 8 characters long.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.success) {
        setErrorMessage(
          body.error ||
            (isAr
              ? 'فشل إعادة تعيين كلمة المرور. قد يكون الرابط منتهي الصلاحية.'
              : 'Failed to reset password. The link may have expired.')
        );
        return;
      }

      setIsSuccess(true);
    } catch {
      setErrorMessage(
        isAr ? 'حدث خطأ في الاتصال بالخادم.' : 'Network connection error.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-8 shadow-2xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {isAr ? 'تعيين كلمة مرور جديدة' : 'Set New Password'}
          </h1>
          <p className="text-xs text-gray-400">
            {isAr
              ? 'اختر كلمة مرور قوية لحماية حسابك (8 أحرف على الأقل تشمل أرقاماً ورموزاً).'
              : 'Choose a strong password (minimum 8 characters with numbers & symbols).'}
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isSuccess ? (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {isAr ? 'تم تغيير كلمة المرور بنجاح!' : 'Password Changed!'}
            </h2>
            <p className="text-xs text-gray-300 leading-relaxed">
              {isAr
                ? 'تم تحديث كلمة المرور وتسجيل الخروج من كافة الأجهزة الأخرى كإجراء أمني. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.'
                : 'Your password was updated and all other sessions have been revoked. You can now log in with your new password.'}
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-sm transition-colors shadow-lg shadow-brand-500/20"
              >
                <span>{isAr ? 'تسجيل الدخول الآن' : 'Log In Now'}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-300 font-medium mb-1">
                {isAr ? 'كلمة المرور الجديدة' : 'New Password'}
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-300 font-medium mb-1">
                {isAr ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !token}
              className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-brand-500/20"
            >
              <span>
                {isSubmitting
                  ? (isAr ? 'جاري الحفظ...' : 'Saving...')
                  : (isAr ? 'حفظ كلمة المرور الجديدة' : 'Save New Password')}
              </span>
            </button>
          </form>
        )}

        <div className="pt-4 border-t border-dark-800 text-center">
          <Link
            href="/login"
            className="text-xs text-brand-400 hover:text-brand-300 font-medium"
          >
            {isAr ? 'العودة لتسجيل الدخول' : 'Back to Login'}
          </Link>
        </div>
      </div>
    </div>
  );
}
