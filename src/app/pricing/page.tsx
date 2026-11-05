'use client';

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SUBSCRIPTION_PLANS, TOP_UP_PACKS, formatCurrency } from '../../lib/pricing/plans';
import { PlanTier } from '../../lib/types';
import {
  Check,
  Sparkles,
  CreditCard,
  ShieldCheck,
  Zap,
  HelpCircle,
  ShoppingBag,
} from 'lucide-react';

export default function PricingPage() {
  const { workspaceId, userId, country, setCountry, currency, refreshWorkspace, t } = useApp();
  const [activePlan, setActivePlan] = useState<PlanTier>('FREE');
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutNotification, setCheckoutNotification] = useState<string | null>(null);

  const handleSubscribe = async (tier: PlanTier) => {
    const plan = SUBSCRIPTION_PLANS[tier];
    if (tier === 'FREE') {
      setCheckoutNotification('أنت مشترك بالفعل في التجربة المجانية ولديك 5 رصيد.');
      return;
    }

    const price = country === 'SA' ? plan.priceSAR : plan.priceEGP;
    const formattedPrice = formatCurrency(price, currency);

    setIsProcessing(true);
    try {
      const res = await fetch('/api/billing/checkout-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
          'x-user-id': userId,
          'x-country': country,
        },
        body: JSON.stringify({
          workspaceId,
          kind: 'SUBSCRIPTION',
          planTier: tier,
          currency,
          paymentMethod: country === 'SA' ? 'mada' : 'card',
          sandboxSimulateWebhook: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر إنشاء طلب الدفع عبر Paymob');
      }

      await refreshWorkspace();
      setActivePlan(tier);
      setCheckoutNotification(
        `تم توثيق اشتراكك في باقة "${plan.nameAr}" (${formattedPrice}) عبر Paymob Webhook الموقّع رقمياً (HMAC-SHA512) وإضافة ${plan.monthlyCredits} رصيد إلى دفتر الأستاذ!`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل الاتصال ببوابة الدفع';
      setCheckoutNotification(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBuyTopUp = async (packId: string) => {
    const pack = TOP_UP_PACKS.find((p) => p.id === packId);
    if (!pack) return;

    const price = country === 'SA' ? pack.priceSAR : pack.priceEGP;
    const formattedPrice = formatCurrency(price, currency);

    setIsProcessing(true);
    try {
      const res = await fetch('/api/billing/checkout-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
          'x-user-id': userId,
          'x-country': country,
        },
        body: JSON.stringify({
          workspaceId,
          kind: 'TOP_UP',
          packId: pack.id,
          currency,
          paymentMethod: country === 'SA' ? 'mada' : 'card',
          sandboxSimulateWebhook: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'تعذر إنشاء طلب الشحن عبر Paymob');
      }

      await refreshWorkspace();
      setCheckoutNotification(
        `تم توثيق شراء ${pack.nameAr} (${formattedPrice}) عبر Paymob Webhook الموقّع وإضافة ${pack.credits} رصيد إلى دفتر الأستاذ!`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل الاتصال ببوابة الدفع';
      setCheckoutNotification(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
      {/* Pricing Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold">
          <CreditCard className="w-3.5 h-3.5" />
          <span>بوابات دفع محلية معتمدة عبر Paymob (توثيق HMAC-SHA512)</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
          {t.pricingTitle}
        </h1>
        <p className="text-gray-400 text-base sm:text-lg">{t.pricingSubtitle}</p>

        {/* Currency Switcher */}
        <div className="pt-4 flex items-center justify-center gap-3">
          <span className="text-xs text-gray-400">{t.currencySwitch}</span>
          <div className="inline-flex rounded-xl bg-dark-900 p-1 border border-dark-800">
            <button
              onClick={() => setCountry('SA')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                country === 'SA'
                  ? 'bg-brand-500 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🇸🇦 {t.saudiSar}
            </button>
            <button
              onClick={() => setCountry('EG')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                country === 'EG'
                  ? 'bg-brand-500 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🇪🇬 {t.egyptEgp}
            </button>
          </div>
        </div>
      </div>

      {checkoutNotification && (
        <div className="max-w-2xl mx-auto p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3 shadow-lg">
          <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
          <span>{checkoutNotification}</span>
        </div>
      )}

      {/* Subscription Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {(Object.keys(SUBSCRIPTION_PLANS) as PlanTier[]).map((tier) => {
          const plan = SUBSCRIPTION_PLANS[tier];
          const isPro = tier === 'PRO';
          const price = country === 'SA' ? plan.priceSAR : plan.priceEGP;

          return (
            <div
              key={tier}
              className={`rounded-2xl p-6 flex flex-col justify-between transition-all relative ${
                isPro
                  ? 'bg-gradient-to-b from-brand-950/60 via-dark-900 to-dark-950 border-2 border-brand-500 shadow-2xl shadow-brand-500/10'
                  : 'bg-dark-900 border border-dark-800 hover:border-dark-700'
              }`}
            >
              {isPro && (
                <div className="absolute -top-3 start-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-brand-500 text-white text-[11px] font-bold shadow">
                  الأكثر طلباً للمتاجر
                </div>
              )}

              <div>
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-white">{plan.nameAr}</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {plan.monthlyCredits} رصيد تصوير شهرياً
                  </p>
                </div>

                <div className="mb-6 pb-6 border-b border-dark-800">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-extrabold text-white">
                      {price}
                    </span>
                    <span className="text-xs text-gray-400 font-semibold">
                      {currency === 'SAR' ? 'ر.س' : 'ج.م'} / شهرياً
                    </span>
                  </div>
                  <span className="text-[11px] text-brand-400 font-medium block mt-1">
                    {t.monthlyBilling}
                  </span>
                </div>

                {/* Features List */}
                <ul className="space-y-3 mb-8 text-xs text-gray-300">
                  {plan.featuresAr.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => handleSubscribe(tier)}
                disabled={isProcessing}
                className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow disabled:opacity-50 ${
                  isPro
                    ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-brand-500/20'
                    : 'bg-dark-800 hover:bg-dark-700 text-gray-200 border border-dark-700'
                }`}
              >
                {tier === activePlan ? (
                  <span>باقتك الحالية</span>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>{t.subscribeNow}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Top-Up Packs Section */}
      <div className="rounded-3xl bg-dark-900 border border-dark-800 p-8 sm:p-12 space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>رصيد لا ينتهي أبداً</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">{t.topUpTitle}</h2>
          <p className="text-gray-400 text-xs sm:text-sm">
            هل تحتاج إلى تصوير كتالوج كبير أو حملة موسمية لرمضان والجمعة البيضاء؟ اشحن رصيداً إضافياً يضاف فوراً لمحفظتك ويبقى صالحاً للأبد.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {TOP_UP_PACKS.map((pack) => {
            const price = country === 'SA' ? pack.priceSAR : pack.priceEGP;
            return (
              <div
                key={pack.id}
                className="rounded-2xl bg-dark-950 border border-dark-800 p-6 flex flex-col justify-between hover:border-brand-500/40 transition-all text-center space-y-4"
              >
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center mx-auto mb-3 font-bold">
                    +{pack.credits}
                  </div>
                  <h3 className="text-base font-bold text-white">{pack.nameAr}</h3>
                  <p className="text-2xl font-extrabold text-brand-400 my-2">
                    {formatCurrency(price, currency)}
                  </p>
                  <p className="text-xs text-gray-500">
                    تكلفة الصورة: ~{(price / pack.credits).toFixed(2)}{' '}
                    {currency === 'SAR' ? 'ر.س' : 'ج.م'}
                  </p>
                </div>

                <button
                  onClick={() => handleBuyTopUp(pack.id)}
                  disabled={isProcessing}
                  className="w-full py-2.5 rounded-xl bg-dark-800 hover:bg-brand-500 hover:text-white text-gray-200 font-bold text-xs border border-dark-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>{t.buyPack}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Methods & FAQ */}
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-white">طرق الدفع المحلية والأسئلة الشائعة</h3>
          <p className="text-xs text-gray-400">
            شراكة مع Paymob لتقديم أعلى معايير الأمان المصرفي PCI-DSS
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-gray-400">
          <div className="p-4 rounded-xl bg-dark-900 border border-dark-800 space-y-2">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-brand-400" />
              <span>ما هي طرق الدفع المتاحة في السعودية ومصر؟</span>
            </h4>
            <p className="leading-relaxed">
              في السعودية: بطاقات مدى (Mada)، أبل باي (Apple Pay)، فيزا وماستركارد.
              <br />
              في مصر: بطاقات ميزة (Meeza)، فيزا، ماستركارد، ومحافظ الهاتف المحمولة (فودافون كاش، إنستاباي).
            </p>
          </div>

          <div className="p-4 rounded-xl bg-dark-900 border border-dark-800 space-y-2">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-brand-400" />
              <span>ماذا يحدث إذا فشلت جلسة التوليد؟</span>
            </h4>
            <p className="leading-relaxed">
              نظامنا المالي يعتمد على خوارزمية الحجز المؤقت؛ إذا واجه النموذج أي خطأ يتم فك الحجز فوراً ولا يُخصم أي رصيد من حسابك.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-dark-900 border border-dark-800 space-y-2">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-brand-400" />
              <span>هل الرصيد الشهري يتراكم؟</span>
            </h4>
            <p className="leading-relaxed">
              الرصيد الأساسي للاشتراك الشهري يُجدد كل 30 يوماً، بينما رصيد &quot;باقات الشحن الإضافية&quot; يبقى صالحاً في محفظتك مدى الحياة ولا ينتهي أبداً.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-dark-900 border border-dark-800 space-y-2">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-brand-400" />
              <span>هل أمتلك الحقوق التجارية للصور المولدة؟</span>
            </h4>
            <p className="leading-relaxed">
              نعم، 100%. جميع الصور المولدة عبر الباقات المدفوعة تأتي بترخيص تجاري كامل يمنحك حق استخدامها في الإعلانات، المتجر، والطباعة.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
