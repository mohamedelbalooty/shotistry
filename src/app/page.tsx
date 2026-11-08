'use client';

import React from 'react';
import Link from 'next/link';
import { useApp } from '../context/AppContext';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  Clock,
  DollarSign,
  Camera,
  Layers,
  ShoppingBag,
} from 'lucide-react';

export default function HomePage() {
  const { t, country, currency } = useApp();

  return (
    <div className="space-y-24 py-8">
      {/* Hero Section */}
      <section className="relative px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pt-10 pb-16 text-center">
        {/* Glow backdrop */}
        <div className="absolute inset-0 max-w-4xl mx-auto h-96 bg-brand-500/10 blur-[120px] -z-10 rounded-full" />

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold mb-8 animate-fade-in">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t.tryFreeCredits}</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight sm:leading-tight mb-6">
          {t.heroTitle}
        </h1>

        <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed mb-10">
          {t.heroSubtitle}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/studio"
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white font-bold text-base shadow-lg shadow-brand-500/25 hover:from-brand-500 hover:to-brand-400 transition-all flex items-center justify-center gap-2"
          >
            <Camera className="w-5 h-5" />
            <span>{t.ctaCreateShoot}</span>
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </Link>
          <Link
            href="/pricing"
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-dark-800 hover:bg-dark-700 text-gray-200 font-semibold text-base border border-dark-700 transition-all flex items-center justify-center gap-2"
          >
            <span>{t.ctaViewPricing}</span>
          </Link>
        </div>

        {/* Live Transformation Visual Preview */}
        <div className="mt-16 max-w-5xl mx-auto rounded-2xl bg-dark-900 border border-dark-800 p-4 sm:p-6 shadow-2xl relative overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            {/* Raw Upload Preview */}
            <div className="relative rounded-xl overflow-hidden bg-dark-950 border border-dark-800 aspect-square group">
              <img
                src="https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&q=80"
                alt="Original Product"
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute top-3 start-3 px-3 py-1 rounded-md bg-dark-950/80 backdrop-blur text-xs font-semibold text-gray-300 border border-dark-700">
                📸 {t.original} (تصوير هاتف عادي)
              </div>
            </div>

            {/* AI Generated Studio Result */}
            <div className="relative rounded-xl overflow-hidden bg-dark-950 border border-brand-500/40 aspect-square shadow-2xl shadow-brand-500/10 group">
              <img
                src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1024&q=90"
                alt="AI Generated Commercial Shoot"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute top-3 start-3 px-3 py-1 rounded-md bg-brand-500 text-white text-xs font-bold shadow flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {t.generated} (استوديو رخام خليجي)
              </div>
              <div className="absolute bottom-3 end-3 px-2.5 py-1 rounded bg-dark-950/90 text-emerald-400 text-xs font-medium border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                حماية الشعار والعبوة مع فحص التطابق الفعلي
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison: Traditional Studio vs. Shotistry */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">
            لماذا يختار أصحاب المتاجر شوتيستري بدلاً من الاستوديوهات التقليدية؟
          </h2>
          <p className="text-gray-400">
            مقارنة حقيقية مبنية على تكاليف وأوقات التصوير التجاري في الرياض وجدة والقاهرة.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Traditional Studio Box */}
          <div className="rounded-2xl bg-dark-900 border border-dark-800 p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold">
                ✕
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">جلسات التصوير التقليدية</h3>
                <p className="text-xs text-gray-500">مكلفة، بطيئة، وعالية المخاطر</p>
              </div>
            </div>
            <ul className="space-y-4 text-sm text-gray-400">
              <li className="flex items-start gap-3">
                <span className="text-rose-400 font-bold">✕</span>
                <span>تكلفة باهظة تبدأ من 1,500 – 4,000 ريال (أو 5,000 – 15,000 جنيه) لكل جلسة.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-rose-400 font-bold">✕</span>
                <span>انتظار من أسبوعين إلى 3 أسابيع لاستلام وتعديل الصور.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-rose-400 font-bold">✕</span>
                <span>مخاطر تلف العينات وشحن المنتجات لمقر الاستوديو ذهاباً وإياباً.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-rose-400 font-bold">✕</span>
                <span>صعوبة تغيير الخلفيات أو مواكبة المواسم السريعة كرمضان وعروض الجمعة البيضاء.</span>
              </li>
            </ul>
          </div>

          {/* Shotistry AI Box */}
          <div className="rounded-2xl bg-gradient-to-b from-brand-950/40 to-dark-900 border border-brand-500/40 p-8 space-y-6 shadow-xl shadow-brand-500/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold">
                ✓
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">استوديو شوتيستري (Shotistry)</h3>
                <p className="text-xs text-brand-300">فوري، اقتصادي، وجودة تجارية فائقة</p>
              </div>
            </div>
            <ul className="space-y-4 text-sm text-gray-300">
              <li className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  <strong>توفير يتجاوز 90%</strong>: باقات تبدأ من {country === 'SA' ? '79 ر.س' : '349 ج.م'} لعشرات الصور التجارية.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  <strong>سرعة فائقة</strong>: توليد الصورة التجارية بدقة 4K في أقل من 30 ثانية.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  <strong>حماية تامة للمنتج</strong>: خوارزمية عزل الأقنعة تحافظ على الشعار والعلبة الأصلية بدون أي تشويه.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  <strong>أنماط إقليمية جاهزة</strong>: فخامة خليجية، كثبان الصحراء، رمضانيات، واستوديوهات معمارية بنقرة واحدة.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Feature Pillar Highlights */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 rounded-2xl bg-dark-900 border border-dark-800 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">{t.feature1Title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{t.feature1Desc}</p>
          </div>

          <div className="p-8 rounded-2xl bg-dark-900 border border-dark-800 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">{t.feature2Title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{t.feature2Desc}</p>
          </div>

          <div className="p-8 rounded-2xl bg-dark-900 border border-dark-800 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">{t.feature3Title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{t.feature3Desc}</p>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-12">
        <div className="rounded-3xl bg-gradient-to-r from-brand-900/50 via-dark-900 to-dark-950 border border-brand-500/30 p-12 space-y-6 relative overflow-hidden">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            جاهز لرفع مبيعات متجرك بصور إعلانية احترافية؟
          </h2>
          <p className="text-gray-300 max-w-xl mx-auto text-base">
            انضم الآن لمئات العلامات التجارية في مصر والسعودية التي وفرت آلاف الريالات وحصلت على صور مذهلة لمنتجاتها.
          </p>
          <div>
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-base shadow-lg shadow-brand-500/30 transition-all"
            >
              <Sparkles className="w-5 h-5" />
              <span>{t.getStarted}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

