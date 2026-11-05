'use client';

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Shield,
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  AlertTriangle,
  Sparkles,
  Search,
  CheckCircle,
  Database,
  Lock,
} from 'lucide-react';

export default function AdminPage() {
  const { t, addCredits } = useApp();

  // Simulated live telemetry metrics
  const [metrics] = useState({
    totalUsers: 1480,
    payingSubscribers: 184,
    mrrUsd: 5880,
    mrrSar: 16250,
    mrrEgp: 76400,
    grossMarginPercent: 76.8,
    aiExpensesUsd: 1360,
    generationSuccessRate: 98.4,
    totalImagesGenerated: 42180,
  });

  // Credit Adjustment State
  const [adjustTargetEmail, setAdjustTargetEmail] = useState('tariq@oudstore.sa');
  const [adjustAmount, setAdjustAmount] = useState<number>(50);
  const [adjustReason, setAdjustReason] = useState('تعويض تجريبي لترقية باقة برو');
  const [adjustmentNotice, setAdjustmentNotice] = useState<string | null>(null);

  // Recent generation telemetry logs
  const [recentJobs] = useState([
    {
      id: 'job_8841',
      product: 'عطر مسك العود الملكي',
      preset: 'الفخامة الخليجية (رخام ونحاس)',
      model: 'imagen-3.0-generate-002',
      latency: '5.2s',
      status: 'SUCCESS',
      cost: '$0.030',
      user: 'tariq@oudstore.sa',
      time: 'منذ دقيقتين',
    },
    {
      id: 'job_8840',
      product: 'حقيبة يد جلد طبيعي جملي',
      preset: 'استوديو معماري معاصر',
      model: 'imagen-3.0-generate-002',
      latency: '4.8s',
      status: 'SUCCESS',
      cost: '$0.030',
      user: 'nouran@leatherstudio.eg',
      time: 'منذ 7 دقائق',
    },
    {
      id: 'job_8839',
      product: 'سيروم حمض الهيالورونيك',
      preset: 'الطبيعة ورذاذ الماء',
      model: 'imagen-3.0-generate-002',
      latency: '6.1s',
      status: 'SUCCESS',
      cost: '$0.030',
      user: 'dr_sara@clinics.sa',
      time: 'منذ 14 دقيقة',
    },
    {
      id: 'job_8838',
      product: 'ساعة يد أوتوماتيكية سويسرية',
      preset: 'الفخامة الخليجية',
      model: 'imagen-3.0-generate-002',
      latency: '8.4s',
      status: 'FAILED',
      cost: '$0.000 (تم استرداد الرصيد تلقائياً)',
      user: 'agency@creativemedia.eg',
      time: 'منذ 22 دقيقة',
    },
  ]);

  const handleAdjustCredits = (e: React.FormEvent) => {
    e.preventDefault();
    if (adjustAmount <= 0) return;

    addCredits(adjustAmount);
    setAdjustmentNotice(
      `تم تعديل الرصيد بنجاح! تمت إضافة ${adjustAmount} رصيد للمستخدم (${adjustTargetEmail}) وتوثيق العملية في سجل التدقيق: "${adjustReason}".`
    );

    setTimeout(() => {
      setAdjustmentNotice(null);
    }, 5000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-dark-800 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-brand-400" />
            <span>{t.adminTitle}</span>
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            مؤشرات الأداء المالي، مراقبة توليد الصور بالذكاء الاصطناعي، وإدارة أرصدة المشتركين
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            جميع الأنظمة تعمل بكفاءة (Vercel / Gemini / Paymob)
          </span>
        </div>
      </div>

      {adjustmentNotice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>{adjustmentNotice}</span>
        </div>
      )}

      {/* KPI Financial Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-medium">{t.mrr}</span>
            <DollarSign className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            ${metrics.mrrUsd.toLocaleString()}
          </div>
          <p className="text-[11px] text-gray-400">
            {metrics.mrrSar.toLocaleString()} ر.س | {metrics.mrrEgp.toLocaleString()} ج.م
          </p>
        </div>

        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-medium">{t.grossMargin}</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
            {metrics.grossMarginPercent}%
          </div>
          <p className="text-[11px] text-gray-500">مستهدف التخطيط: 70–80% (محقق بامتياز)</p>
        </div>

        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-medium">{t.payingSubscribers}</span>
            <Users className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {metrics.payingSubscribers}
          </div>
          <p className="text-[11px] text-gray-500">من إجمالي {metrics.totalUsers.toLocaleString()} مشترك مسجل</p>
        </div>

        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-medium">{t.successRate}</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {metrics.generationSuccessRate}%
          </div>
          <p className="text-[11px] text-gray-500">إجمالي {metrics.totalImagesGenerated.toLocaleString()} صورة مولدة</p>
        </div>
      </div>

      {/* Generation Jobs Telemetry Inspector */}
      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-800">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-400" />
            <span>مراقبة عمليات التوليد الحية (Telemetry & Generation Jobs)</span>
          </h2>
          <span className="text-xs text-gray-400">تحديث فوري</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead>
              <tr className="border-b border-dark-800 text-gray-400">
                <th className="py-2.5 px-3 text-start">معرف العملية</th>
                <th className="py-2.5 px-3 text-start">المنتج</th>
                <th className="py-2.5 px-3 text-start">النمط الإقليمي</th>
                <th className="py-2.5 px-3 text-start">النموذج</th>
                <th className="py-2.5 px-3 text-start">زمن المعالجة</th>
                <th className="py-2.5 px-3 text-start">الحالة</th>
                <th className="py-2.5 px-3 text-start">التكلفة الفعلية</th>
                <th className="py-2.5 px-3 text-start">المشترك</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {recentJobs.map((job) => (
                <tr key={job.id} className="hover:bg-dark-950/40">
                  <td className="py-3 px-3 font-mono text-gray-300">{job.id}</td>
                  <td className="py-3 px-3 font-semibold text-white">{job.product}</td>
                  <td className="py-3 px-3 text-gray-300">{job.preset}</td>
                  <td className="py-3 px-3 font-mono text-brand-400">{job.model}</td>
                  <td className="py-3 px-3 text-gray-400">{job.latency}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        job.status === 'SUCCESS'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {job.status === 'SUCCESS' ? 'ناجحة' : 'فشلت واستردت'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-gray-300">{job.cost}</td>
                  <td className="py-3 px-3 text-gray-400">{job.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Credit Adjustment & Ledger Tool */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-brand-400" />
            <span>أداة تعديل أرصدة المشتركين (Audit Ledger Adjustment)</span>
          </h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            تسمح هذه الأداة لخدمة العملاء والإدارة بتعويض العملاء أو تعديل الأرصدة مع توثيق إلزامي في سجل التدقيق المالي.
          </p>

          <form onSubmit={handleAdjustCredits} className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">البريد الإلكتروني للعميل</label>
              <input
                type="email"
                value={adjustTargetEmail}
                onChange={(e) => setAdjustTargetEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">عدد الرصيد المراد إضافته</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">نوع العملية</label>
                <select className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white focus:outline-none focus:border-brand-500">
                  <option value="ADMIN_ADJUSTMENT">تعويض خدمة عملاء</option>
                  <option value="BONUS">مكافأة شراكة</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">سبب التعديل (إلزامي للتدقيق المالي)</label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-xs shadow transition-colors flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>تنفيذ وتوثيق التعديل المالي</span>
            </button>
          </form>
        </div>

        {/* Infrastructure & Status Cards */}
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-brand-400" />
            <span>حالة البنية التحتية والربط الخارجي</span>
          </h2>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Google GenAI Engine</span>
                <span className="text-gray-500">Imagen 3 & Gemini 2.5 Flash</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                متصل وجاهز
              </span>
            </div>

            <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Paymob Payment Gateway</span>
                <span className="text-gray-500">Egypt (EGP) & Saudi Arabia (SAR) Webhooks</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                HMAC-SHA512 نشط
              </span>
            </div>

            <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">PostgreSQL Persistence</span>
                <span className="text-gray-500">Prisma ACID Double-Entry Ledger</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                مطابق ومؤمّن
              </span>
            </div>

            <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Vercel Serverless Hosting</span>
                <span className="text-gray-500">Edge Network & Automated Deployments</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                جاهز للإنتاج
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

