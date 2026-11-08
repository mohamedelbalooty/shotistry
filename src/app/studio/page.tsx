'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { REGIONAL_PHOTOSHOOT_PRESETS } from '../../lib/ai/presets';
import { AspectRatio, GenerationResult } from '../../lib/types';
import {
  UploadCloud,
  Sparkles,
  Camera,
  Layers,
  Download,
  RotateCcw,
  AlertCircle,
  ShieldCheck,
  Maximize2,
  Cpu,
} from 'lucide-react';

/**
 * Generates a clean, real base64 PNG product bottle image on an HTML5 canvas
 * so sample studio sessions execute the real pixel segmentation & compositing pipeline.
 */
function buildSampleProductCanvasDataUrl(): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Pure studio white background for clean foreground segmentation
  ctx.fillStyle = '#fcfcfc';
  ctx.fillRect(0, 0, 96, 96);

  // Bottle cap & neck (metallic gold)
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(39, 12, 18, 12);

  // Perfume bottle body (deep royal crimson/oud)
  ctx.fillStyle = '#7a1c2e';
  ctx.fillRect(26, 24, 44, 58);

  // Specular highlight bar
  ctx.fillStyle = '#9c2b41';
  ctx.fillRect(30, 26, 6, 54);

  // Center luxury gold label
  ctx.fillStyle = '#f2d06b';
  ctx.fillRect(32, 40, 32, 24);

  return canvas.toDataURL('image/png');
}

export default function StudioPage() {
  const {
    t,
    workspaceId,
    userId,
    credits,
    syncCredits,
    addToHistory,
    history,
  } = useApp();

  // Wizard state
  const [productTitle, setProductTitle] = useState('عطر مسك العود الملكي');
  const [productCategory, setProductCategory] = useState('عطور ومستحضرات');
  const [selectedPresetId, setSelectedPresetId] = useState('gulf_luxury_marble');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [customDirectives, setCustomDirectives] = useState('');
  const [lockProductForeground, setLockProductForeground] = useState<boolean>(true);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [activeResult, setActiveResult] = useState<GenerationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const sample = buildSampleProductCanvasDataUrl();
    if (sample) {
      setUploadedImage(sample);
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (file.type && !allowedTypes.includes(file.type.toLowerCase())) {
        setErrorMessage(
          'صيغة الملف غير مدعومة. يرجى رفع صورة منتج بصيغة PNG أو JPEG أو WebP فقط.'
        );
        return;
      }
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
      setProgressStep('عزل خلفية المنتج واستخراج قناع الدقة (Alpha Mask)...');

      const response = await fetch('/api/photoshoots/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
          'x-user-id': userId,
        },
        body: JSON.stringify({
          workspaceId,
          productTitle,
          productCategory,
          presetId: selectedPresetId,
          aspectRatio,
          customDirectives: customDirectives.trim() || undefined,
          rawImageBase64: uploadedImage,
          lockProductForeground,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error || 'حدث خطأ أثناء التوليد في الخادم. لم يتم خصم أي رصيد.'
        );
      }

      const result: GenerationResult = payload.data;
      if (typeof result.remainingCredits === 'number') {
        syncCredits(result.remainingCredits);
      }

      setActiveResult(result);
      addToHistory(result);
      setProgressStep('');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'حدث خطأ أثناء التوليد. يرجى المحاولة مرة أخرى.';
      setErrorMessage(msg);
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
            تحويل فعلي لصورة منتجك عبر عزل الخلفية ودمج الإضاءة وحفظ هوية المنتج
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-xs">
            <span className="text-gray-400">{t.remainingCredits} </span>
            <span className="font-bold text-brand-400 text-sm" data-testid="studio-credits">
              {credits}
            </span>{' '}
            <span className="text-gray-400">{t.credits}</span>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
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
                      alt="Uploaded Product Preview"
                      className="w-full h-full object-contain bg-white"
                    />
                  </div>
                  <p className="text-xs text-brand-400 font-medium">
                    ✓ صورة المنتج جاهزة للعزل والدمج (انقر لرفع صورة أخرى)
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

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-dark-950 border border-dark-800 cursor-pointer">
              <input
                type="checkbox"
                checked={lockProductForeground}
                onChange={(e) => setLockProductForeground(e.target.checked)}
                className="mt-0.5 rounded border-dark-700 bg-dark-900 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-xs text-gray-300 leading-relaxed">
                <strong className="text-white block">
                  قفل بكسلات المنتج والشعار (Foreground Lock Compositing)
                </strong>
                دمج المنتج المعزول الأصلي فوق الخلفية المولّدة للحفاظ التام على الشعار والنصوص، مع قياس التطابق على الصورة النهائية المسلّمة.
              </span>
            </label>

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
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-dark-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-400" />
                <span>{t.resultTitle}</span>
              </h2>
              {activeResult && (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 border ${
                      activeResult.fidelityVerified
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      تطابق الصورة النهائية للمنتج: {(activeResult.fidelityScore * 100).toFixed(1)}%
                    </span>
                  </span>
                  {activeResult.synthIdDetected ? (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-300 font-medium">
                      SynthID Verified ({activeResult.modelUsed})
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5" />
                      <span>وضع الدمج المحلي (Sandbox Composite)</span>
                    </span>
                  )}
                </div>
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
              </div>
            ) : activeResult ? (
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden bg-dark-950 border border-brand-500/30 aspect-square shadow-2xl">
                  <img
                    src={activeResult.imageUrl}
                    alt="Active Studio Result"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-3 end-3 px-2.5 py-1 rounded bg-dark-950/80 backdrop-blur text-xs text-gray-200 border border-dark-700">
                    {activeResult.aspectRatio} | {activeResult.resolution} | {activeResult.modelUsed}
                  </div>
                </div>

                {/* Mask & Isolated Product Inspection Bar */}
                {(activeResult.maskImageUrl || activeResult.isolatedProductUrl) && (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-dark-950 border border-dark-800 text-xs">
                    {activeResult.isolatedProductUrl && (
                      <div className="flex items-center gap-3">
                        <img
                          src={activeResult.isolatedProductUrl}
                          alt="Isolated Product Foreground"
                          className="w-12 h-12 rounded border border-dark-700 object-contain bg-dark-900"
                        />
                        <div>
                          <div className="font-bold text-gray-200">المنتج المعزول</div>
                          <div className="text-gray-500">Foreground RGBA</div>
                        </div>
                      </div>
                    )}
                    {activeResult.maskImageUrl && (
                      <div className="flex items-center gap-3">
                        <img
                          src={activeResult.maskImageUrl}
                          alt="Binary Alpha Mask"
                          className="w-12 h-12 rounded border border-dark-700 object-contain bg-black"
                        />
                        <div>
                          <div className="font-bold text-gray-200">قناع الحماية الثنائي</div>
                          <div className="text-gray-500">Binary Alpha Mask</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
                  ارفع صورة منتجك من القائمة الجانبية واختر النمط المفضل، ثم اضغط على &quot;توليد جلسة التصوير&quot; لمشاهدة النتائج بدقة استوديو تجاري.
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
