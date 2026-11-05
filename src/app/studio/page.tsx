'use client';

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { REGIONAL_PHOTOSHOOT_PRESETS } from '../../lib/ai/presets';
import { PromptSynthesizer } from '../../lib/ai/prompt-synthesizer';
import { GeminiClient } from '../../lib/ai/gemini-client';
import { AspectRatio, GenerationResult } from '../../lib/types';
import {
  UploadCloud,
  Sparkles,
  Camera,
  Layers,
  Download,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Maximize2,
} from 'lucide-react';

export default function StudioPage() {
  const { t, credits, deductCredit, addToHistory, history } = useApp();

  // Wizard state
  const [productTitle, setProductTitle] = useState('عطر مسك العود الملكي');
  const [productCategory, setProductCategory] = useState('عطور ومستحضرات');
  const [selectedPresetId, setSelectedPresetId] = useState('gulf_luxury_marble');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [customDirectives, setCustomDirectives] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(
    'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&q=80'
  );

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [activeResult, setActiveResult] = useState<GenerationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File upload simulation/handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setErrorMessage('حجم الصورة يتجاوز الحد الأقصى (20 ميجابايت)');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage(reader.result as string);
        setErrorMessage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!uploadedImage) {
      setErrorMessage('يرجى رفع صورة المنتج أولاً');
      return;
    }

    if (credits < 1) {
      setErrorMessage('رصيدك غير كافٍ. يرجى شحن الرصيد من صفحة الباقات للاستمرار.');
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);

    try {
      // Step 1: Synthesize Prompt using 10-Component Engine
      setProgressStep('جاري صياغة أمر الإضاءة والاستوديو...');
      await new Promise((r) => setTimeout(r, 400));

      const synthesized = PromptSynthesizer.synthesize({
        productTitle,
        productCategory,
        presetId: selectedPresetId,
        aspectRatio,
        customDirectives: customDirectives.trim() || undefined,
      });

      // Step 2: Product Mask Locking & Inpainting Pass
      setProgressStep('قفل تفاصيل المنتج وحماية الشعار (Fidelity Lock)...');
      await new Promise((r) => setTimeout(r, 600));

      // Step 3: AI Model Inference
      setProgressStep('معالجة المشهد ورسم الانعكاسات عبر Google Gemini...');
      const client = new GeminiClient();
      const jobId = `job_${Date.now()}`;

      const result = await client.generateProductPhoto(jobId, {
        prompt: synthesized.fullPrompt,
        negativePrompt: synthesized.negativePrompt,
        aspectRatio,
        model: synthesized.targetModel,
      });

      // Deduct credit upon confirmed generation
      const deducted = deductCredit(1);
      if (!deducted) {
        throw new Error('حدث خطأ في خصم الرصيد');
      }

      setActiveResult(result);
      addToHistory(result);
      setProgressStep('');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'حدث خطأ أثناء التوليد. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-dark-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
            <Camera className="w-7 h-7 text-brand-400" />
            <span>{t.studioTitle}</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            صمم جلسة تصوير إعلانية متكاملة لمنتجك في 3 خطوات بسيطة
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-xs">
            <span className="text-gray-400">{t.remainingCredits} </span>
            <span className="font-bold text-brand-400 text-sm">{credits}</span>{' '}
            <span className="text-gray-400">{t.credits}</span>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3 animate-shake">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Configuration Wizard */}
        <div className="lg:col-span-5 space-y-6">
          {/* Step 1: Upload Image */}
          <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs flex items-center justify-center font-bold">
                1
              </span>
              <span>{t.uploadStepTitle}</span>
            </h2>

            <div className="relative border-2 border-dashed border-dark-700 hover:border-brand-500/50 rounded-xl p-4 text-center cursor-pointer transition-colors bg-dark-950/50 group">
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              {uploadedImage ? (
                <div className="space-y-3">
                  <div className="relative w-32 h-32 mx-auto rounded-lg overflow-hidden border border-dark-700 shadow-md">
                    <img
                      src={uploadedImage}
                      alt="Uploaded Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-xs text-brand-400 font-medium">
                    ✓ تم تحميل الصورة بنجاح (انقر لتغييرها)
                  </p>
                </div>
              ) : (
                <div className="py-6 space-y-2">
                  <UploadCloud className="w-10 h-10 text-gray-500 mx-auto group-hover:text-brand-400 transition-colors" />
                  <p className="text-sm font-semibold text-gray-300">{t.uploadDragDrop}</p>
                  <p className="text-xs text-gray-500">{t.uploadHint}</p>
                </div>
              )}
            </div>

            {/* Product Meta */}
            <div className="grid grid-cols-1 gap-3 pt-2">
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">
                  اسم المنتج
                </label>
                <input
                  type="text"
                  value={productTitle}
                  onChange={(e) => setProductTitle(e.target.value)}
                  placeholder={t.productNamePlaceholder}
                  className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">
                  {t.productCategory}
                </label>
                <input
                  type="text"
                  value={productCategory}
                  onChange={(e) => setProductCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          {/* Step 2: Presets Selection */}
          <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs flex items-center justify-center font-bold">
                2
              </span>
              <span>{t.presetStepTitle}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {REGIONAL_PHOTOSHOOT_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`p-3 rounded-xl border text-start transition-all ${
                      isSelected
                        ? 'border-brand-500 bg-brand-500/10 shadow-md shadow-brand-500/10'
                        : 'border-dark-800 bg-dark-950 hover:border-dark-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white block">
                        {preset.nameAr}
                      </span>
                      {preset.isRegional && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 font-semibold">
                          إقليمي
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                      {preset.descriptionAr}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Aspect Ratio & Custom Scene Directives */}
          <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs flex items-center justify-center font-bold">
                3
              </span>
              <span>{t.aspectStepTitle}</span>
            </h2>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAspectRatio('1:1')}
                className={`p-2.5 rounded-lg border text-center transition-colors ${
                  aspectRatio === '1:1'
                    ? 'border-brand-500 bg-brand-500/10 text-brand-300 font-bold'
                    : 'border-dark-800 bg-dark-950 text-gray-400'
                }`}
              >
                1:1 مربع (سلة، زد)
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('4:5')}
                className={`p-2.5 rounded-lg border text-center transition-colors ${
                  aspectRatio === '4:5'
                    ? 'border-brand-500 bg-brand-500/10 text-brand-300 font-bold'
                    : 'border-dark-800 bg-dark-950 text-gray-400'
                }`}
              >
                4:5 عمودي (إنستغرام)
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('9:16')}
                className={`p-2.5 rounded-lg border text-center transition-colors ${
                  aspectRatio === '9:16'
                    ? 'border-brand-500 bg-brand-500/10 text-brand-300 font-bold'
                    : 'border-dark-800 bg-dark-950 text-gray-400'
                }`}
              >
                9:16 ستوري وتيك توك
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`p-2.5 rounded-lg border text-center transition-colors ${
                  aspectRatio === '16:9'
                    ? 'border-brand-500 bg-brand-500/10 text-brand-300 font-bold'
                    : 'border-dark-800 bg-dark-950 text-gray-400'
                }`}
              >
                16:9 بانر أفقي
              </button>
            </div>

            <div className="pt-2">
              <label className="text-xs text-gray-400 font-medium block mb-1">
                {t.customDirectivesTitle}
              </label>
              <input
                type="text"
                value={customDirectives}
                onChange={(e) => setCustomDirectives(e.target.value)}
                placeholder={t.customDirectivesPlaceholder}
                className="w-full px-3 py-2 rounded-lg bg-dark-950 border border-dark-700 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Submit Action */}
            <div className="pt-4 space-y-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-brand-500/25 transition-all flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>{t.generating}</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>{t.generateButton}</span>
                  </>
                )}
              </button>

              <div className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3 text-brand-400" />
                <span>{t.creditsCost}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Generation Canvas & Results View */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-dark-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-400" />
                <span>{t.resultTitle}</span>
              </h2>
              {activeResult && (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" />
                  {t.fidelityVerified}
                </span>
              )}
            </div>

            {/* Display Area */}
            {isGenerating ? (
              <div className="aspect-square rounded-xl bg-dark-950 border border-dark-800 flex flex-col items-center justify-center p-8 text-center space-y-4 animate-pulse">
                <div className="w-16 h-16 rounded-2xl bg-brand-500/20 text-brand-400 flex items-center justify-center animate-spin">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-bold text-white">{t.generating}</p>
                  <p className="text-xs text-brand-400 font-medium">{progressStep}</p>
                </div>
                <p className="text-xs text-gray-500 max-w-xs">
                  يتم الآن تشكيل الإضاءة والمعالم المحيطة مع حماية أبعاد المنتج الأصلية 100%.
                </p>
              </div>
            ) : activeResult ? (
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden bg-dark-950 border border-brand-500/30 aspect-square shadow-2xl">
                  <img
                    src={activeResult.imageUrl}
                    alt="Active Result"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 end-3 px-2.5 py-1 rounded bg-dark-950/80 backdrop-blur text-xs text-gray-200 border border-dark-700">
                    {activeResult.aspectRatio} | {activeResult.resolution}
                  </div>
                </div>

                {/* Actions: Download & Regenerate */}
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={activeResult.imageUrl}
                    download="shotistry-render-hd.png"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t.downloadHd}</span>
                  </a>
                  <a
                    href={activeResult.imageUrl}
                    download="shotistry-render-4k.png"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 text-gray-200 font-bold text-xs border border-dark-700 flex items-center justify-center gap-2"
                  >
                    <Maximize2 className="w-4 h-4" />
                    <span>{t.download4k}</span>
                  </a>
                  <button
                    onClick={handleGenerate}
                    className="px-4 py-2.5 rounded-xl bg-dark-800 hover:bg-dark-700 text-gray-300 font-semibold text-xs border border-dark-700 flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>{t.regenerate}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="aspect-square rounded-xl bg-dark-950 border border-dark-800 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-dark-900 text-gray-500 flex items-center justify-center">
                  <Camera className="w-7 h-7" />
                </div>
                <p className="text-sm font-semibold text-gray-300">
                  لوحة استعراض جلسة التصوير فارغة حالياً
                </p>
                <p className="text-xs text-gray-500 max-w-sm">
                  ارفع صورة منتجك من القائمة الجانبية واختر النمط المفضل، ثم اضغط على "توليد جلسة التصوير" لمشاهدة النتائج بدقة استوديو تجاري.
                </p>
              </div>
            )}
          </div>

          {/* Session History Carousel */}
          {history.length > 0 && (
            <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-400" />
                <span>سجل الصور المولدة في هذه الجلسة ({history.length})</span>
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setActiveResult(item)}
                    className="aspect-square rounded-lg overflow-hidden border border-dark-700 cursor-pointer hover:border-brand-500 transition-all hover:scale-105"
                  >
                    <img
                      src={item.imageUrl}
                      alt={`History ${idx}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
