'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../context/AppContext';
import { KeyRound, Mail, ArrowLeft, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { locale, t } = useApp();
  const isAr = locale === 'ar';

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setErrorMessage(
          isAr
            ? 'تجاوزت الحد المسموح من المحاولات. يرجى الانتظار 15 دقيقة والمحاولة لاحقاً.'
            : 'Too many attempts. Please wait 15 minutes and try again.'
        );
        return;
      }

      if (!res.ok && res.status !== 202) {
        setErrorMessage(body.error || 'Failed to process request');
        return;
      }

      setSubmitted(true);
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
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {isAr ? 'استعادة كلمة المرور' : 'Reset your password'}
          </h1>
          <p className="text-xs text-gray-400">
            {isAr
              ? 'أدخل بريدك الإلكتروني المسجل وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.'
              : 'Enter your registered email address and we will send you a reset link.'}
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {submitted ? (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {isAr ? 'تم إرسال التعليمات' : 'Instructions Sent'}
            </h2>
            <p className="text-xs text-gray-300 leading-relaxed">
              {isAr
                ? 'إذا كان هناك حساب مسجل بهذا البريد، فقد أرسلنا رابط إعادة التعيين. يرجى مراجعة صندوق الوارد والبريد غير الهام (Spam).'
                : 'If an account exists with this email, reset instructions have been sent. Please check your inbox and spam folder.'}
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 text-white text-xs font-semibold transition-colors"
              >
                <span>{isAr ? 'العودة لتسجيل الدخول' : 'Back to Login'}</span>
              </Link>
            </div>
          </div>
        ) : (
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-brand-500/20"
            >
              <span>
                {isSubmitting
                  ? (isAr ? 'جاري الإرسال...' : 'Sending...')
                  : (isAr ? 'إرسال رابط إعادة التعيين' : 'Send Reset Link')}
              </span>
            </button>
          </form>
        )}

        <div className="pt-4 border-t border-dark-800 text-center">
          <Link
            href="/login"
            className="text-xs text-brand-400 hover:text-brand-300 font-medium inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
            <span>{isAr ? 'العودة لتسجيل الدخول' : 'Back to Login'}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
