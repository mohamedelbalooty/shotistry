'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../../context/AppContext';
import { Users, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

export default function AcceptInvitePage() {
  const { isAuthenticated, isAuthLoading, user, locale, refreshSession, authorizedFetch } = useApp();
  const isAr = locale === 'ar';
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    // 1. Read token from URL hash (#token=...) to protect against referrer leakage
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const match = hash.match(/#token=([a-zA-Z0-9_-]+)/);
    if (match) {
      setToken(match[1]);
    } else {
      setErrorMessage(
        isAr
          ? 'رمز الدعوة مفقود أو غير صالح في الرابط.'
          : 'Invitation token is missing or invalid in the link.'
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

  const handleAccept = async () => {
    if (!token) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setErrorCode(null);

    try {
      const res = await authorizedFetch('/api/workspaces/invites/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.success) {
        setErrorCode(body.code || null);
        setErrorMessage(
          body.error ||
            (isAr
              ? 'تعذر قبول الدعوة. قد تكون منتهية الصلاحية أو تم إلغاؤها.'
              : 'Failed to accept invitation.')
        );
        return;
      }

      setSuccess(true);
      await refreshSession();
      setTimeout(() => {
        router.push('/studio');
      }, 1500);
    } catch {
      setErrorMessage(
        isAr ? 'حدث خطأ في الاتصال بالخادم.' : 'Network connection error.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-8 shadow-2xl space-y-6">
        <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-400 flex items-center justify-center mx-auto">
          <Users className="w-6 h-6" />
        </div>

        <h1 className="text-2xl font-extrabold text-white">
          {isAr ? 'دعوة للانضمام إلى مساحة عمل' : 'Workspace Invitation'}
        </h1>

        {isAuthLoading ? (
          <div className="py-6">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto" />
          </div>
        ) : !isAuthenticated ? (
          <div className="space-y-4">
            <p className="text-xs text-gray-300">
              {isAr
                ? 'يجب تسجيل الدخول أو إنشاء حساب جديد بالبريد الإلكتروني المدعو لقبول هذه الدعوة.'
                : 'Please log in or register with the invited email address to accept this invitation.'}
            </p>
            <div className="pt-2 space-y-2">
              <Link
                href={`/login${token ? `?next=/invites/accept#token=${token}` : ''}`}
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-sm transition-colors shadow-lg shadow-brand-500/20"
              >
                <span>{isAr ? 'تسجيل الدخول للمتابعة' : 'Log In to Continue'}</span>
              </Link>
              <Link
                href={`/register${token ? `?next=/invites/accept#token=${token}` : ''}`}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 text-gray-300 text-xs font-semibold transition-colors"
              >
                <span>{isAr ? 'إنشاء حساب جديد' : 'Create New Account'}</span>
              </Link>
            </div>
          </div>
        ) : success ? (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {isAr ? 'تم الانضمام بنجاح!' : 'Joined Successfully!'}
            </h2>
            <p className="text-xs text-gray-400">
              {isAr ? 'جاري تحويلك إلى الاستوديو...' : 'Redirecting to studio...'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-300">
              {isAr
                ? `أنت مسجل الدخول حالياً بحساب: ${user?.email}`
                : `Currently logged in as: ${user?.email}`}
            </p>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-start flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span>{errorMessage}</span>
                  {errorCode === 'EMAIL_VERIFICATION_REQUIRED' && (
                    <div className="pt-1">
                      <Link
                        href="/account"
                        className="text-brand-400 hover:underline font-semibold"
                      >
                        {isAr ? 'انتقل إلى حسابك لتأكيد البريد' : 'Go to account to verify email'}
                      </Link>
                    </div>
                  )}
                  {errorCode === 'INVITE_IDENTITY_MISMATCH' && (
                    <div className="pt-1">
                      <span className="text-gray-400">
                        {isAr
                          ? 'يجب تسجيل الخروج والدخول بالحساب المدعو.'
                          : 'Please log out and sign in with the invited email address.'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleAccept}
              disabled={isSubmitting || !token}
              className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-brand-500/20"
            >
              <span>
                {isSubmitting
                  ? (isAr ? 'جاري قبول الدعوة...' : 'Accepting...')
                  : (isAr ? 'قبول الدعوة والانضمام' : 'Accept Invitation & Join')}
              </span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
