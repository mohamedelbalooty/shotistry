'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Shield,
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  Sparkles,
  CheckCircle,
  Database,
  Lock,
  RefreshCw,
} from 'lucide-react';

interface AdminJobRow {
  id: string;
  product: string;
  preset: string;
  model: string;
  status: string;
  cost: string;
  user: string;
  createdAt: string;
}

interface AdminMetricsData {
  totalUsers: number;
  payingSubscribers: number;
  mrrUsd: number;
  mrrSar: number;
  mrrEgp: number;
  grossMarginPercent: number;
  aiExpensesUsd: number;
  generationSuccessRate: number;
  totalImagesGenerated: number;
  recentJobs: AdminJobRow[];
  systemStatus: {
    geminiEngine: string;
    paymobGateways: string;
    database: string;
    storage: string;
  };
}

export default function AdminPage() {
  const { t, workspaceId, refreshWorkspace } = useApp();

  const [metrics, setMetrics] = useState<AdminMetricsData>({
    totalUsers: 0,
    payingSubscribers: 0,
    mrrUsd: 0,
    mrrSar: 0,
    mrrEgp: 0,
    grossMarginPercent: 0,
    aiExpensesUsd: 0,
    generationSuccessRate: 0,
    totalImagesGenerated: 0,
    recentJobs: [],
    systemStatus: {
      geminiEngine: 'SANDBOX_COMPOSITE',
      paymobGateways: 'UNCONFIGURED_FAIL_CLOSED',
      database: 'OPERATIONAL_ACID_SQL',
      storage: 'OPERATIONAL_SIGNED_URLS',
    },
  });
  const [isLoading, setIsLoading] = useState(true);

  // Credit Adjustment State
  const [adjustTargetEmail, setAdjustTargetEmail] = useState(
    'user-default-merchant@merchant.shotistry.app'
  );
  const [adjustAmount, setAdjustAmount] = useState<number>(50);
  const [adjustReason, setAdjustReason] = useState('تعويض خدمة عملاء موثق في سجل التدقيق');
  const [adjustmentNotice, setAdjustmentNotice] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/metrics', {
        headers: {
          'x-user-role': 'ADMIN',
        },
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  const handleAdjustCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustAmount || adjustAmount === 0) return;

    const res = await fetch('/api/admin/credits/adjust', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'ADMIN',
      },
      body: JSON.stringify({
        targetEmail: adjustTargetEmail,
        workspaceId,
        amount: adjustAmount,
        reason: adjustReason,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      await refreshWorkspace();
      await fetchMetrics();
      setAdjustmentNotice(
        `تم تعديل الرصيد الفعلي في قاعدة البيانات! الرصيد الجديد: ${data.newBalance} رصيد (معرّف التدقيق: ${data.auditLogId}).`
      );
    } else {
      setAdjustmentNotice(data.error || 'فشل تعديل الرصيد');
    }
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
            مؤشرات الأداء الفعلية المستخرجة مباشرة من قاعدة البيانات وسجل التدقيق المالي
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchMetrics()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-900 hover:bg-dark-800 text-gray-200 text-xs font-semibold border border-dark-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث البيانات الحية</span>
          </button>
        </div>
      </div>

      {adjustmentNotice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>{adjustmentNotice}</span>
        </div>
      )}

      {/* KPI Financial Cards (100% Real Database Aggregates) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-medium">{t.mrr}</span>
            <DollarSign className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white" data-testid="admin-mrr-usd">
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
          <p className="text-[11px] text-gray-500">
            تكلفة Gemini الفعلية: ${metrics.aiExpensesUsd} ($0.0336 / 1K)
          </p>
        </div>

        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-medium">{t.payingSubscribers}</span>
            <Users className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {metrics.payingSubscribers}
          </div>
          <p className="text-[11px] text-gray-500">
            من إجمالي {metrics.totalUsers.toLocaleString()} مستخدم في قاعدة البيانات
          </p>
        </div>

        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-medium">{t.successRate}</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {metrics.generationSuccessRate}%
          </div>
          <p className="text-[11px] text-gray-500">
            إجمالي {metrics.totalImagesGenerated.toLocaleString()} صورة مولدة فعلياً
          </p>
        </div>
      </div>

      {/* Generation Jobs Telemetry Inspector */}
      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-800">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-400" />
            <span>سجل عمليات التوليد الفعلية (Database GenerationJobs)</span>
          </h2>
          <span className="text-xs text-gray-400">{metrics.recentJobs.length} عملية مسجلة</span>
        </div>

        {metrics.recentJobs.length === 0 ? (
          <p className="text-xs text-gray-500 py-6 text-center">
            لا توجد عمليات توليد مسجلة في قاعدة البيانات حتى الآن. قم بتوليد صورة من الاستوديو لظهورها هنا فوراً.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead>
                <tr className="border-b border-dark-800 text-gray-400">
                  <th className="py-2.5 px-3 text-start">معرف العملية</th>
                  <th className="py-2.5 px-3 text-start">المنتج</th>
                  <th className="py-2.5 px-3 text-start">النمط الإقليمي</th>
                  <th className="py-2.5 px-3 text-start">النموذج</th>
                  <th className="py-2.5 px-3 text-start">الحالة</th>
                  <th className="py-2.5 px-3 text-start">التكلفة الفعلية</th>
                  <th className="py-2.5 px-3 text-start">المشترك</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {metrics.recentJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-dark-950/40">
                    <td className="py-3 px-3 font-mono text-gray-300">{job.id}</td>
                    <td className="py-3 px-3 font-semibold text-white">{job.product}</td>
                    <td className="py-3 px-3 text-gray-300">{job.preset}</td>
                    <td className="py-3 px-3 font-mono text-brand-400">{job.model}</td>
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
        )}
      </div>

      {/* Manual Credit Adjustment & Ledger Tool */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-brand-400" />
            <span>أداة تعديل أرصدة المشتركين (Audit Ledger Adjustment)</span>
          </h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            تنفذ هذه الأداة قيداً محاسبياً في جدول CreditLedger وتكتب سجلاً دائماً في جدول AdminAuditLog.
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
              <label className="text-xs text-gray-400 block mb-1">
                سبب التعديل (إلزامي للتدقيق المالي)
              </label>
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
              <span>تنفيذ وتوثيق التعديل المالي في قاعدة البيانات</span>
            </button>
          </form>
        </div>

        {/* Truthful Infrastructure & Status Cards */}
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-brand-400" />
            <span>حالة البنية التحتية والربط الخارجي</span>
          </h2>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Google GenAI Engine</span>
                <span className="text-gray-500">
                  gemini-3.1-flash-image, gemini-3.1-flash-lite-image &amp; gemini-3-pro-image
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded font-bold ${
                  metrics.systemStatus.geminiEngine === 'LIVE_API_CONFIGURED'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                {metrics.systemStatus.geminiEngine}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Paymob Payment Gateway</span>
                <span className="text-gray-500">Fail-Closed HMAC-SHA512 Webhooks</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded font-bold ${
                  metrics.systemStatus.paymobGateways === 'HMAC_CONFIGURED'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                {metrics.systemStatus.paymobGateways}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">SQL ACID Persistence</span>
                <span className="text-gray-500">Serializable Double-Entry Ledger</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                {metrics.systemStatus.database}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-dark-950 border border-dark-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Asset Storage &amp; Delivery</span>
                <span className="text-gray-500">HMAC-SHA256 Signed Asset URLs</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                {metrics.systemStatus.storage}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
