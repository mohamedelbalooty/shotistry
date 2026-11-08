import type { PlanConfig, TopUpPackConfig, Country, Currency, PlanTier } from '../types/index.ts';

export const SUBSCRIPTION_PLANS: Record<PlanTier, PlanConfig> = {
  FREE: {
    tier: 'FREE',
    name: 'Free Trial',
    nameAr: 'تجربة مجانية',
    monthlyCredits: 5,
    priceEGP: 0,
    priceSAR: 0,
    featuresEn: [
      '5 free trial credits',
      'Standard resolution (1K)',
      '1 Brand profile',
      'All standard presets',
      'Community support'
    ],
    featuresAr: [
      '5 رصيد تجريبي مجاني',
      'دقة قياسية (1K)',
      'بروفايل علامة تجارية واحدة',
      'جميع الأنماط القياسية',
      'دعم المجتمع'
    ],
    maxBrands: 1,
    maxTeamSeats: 1,
    priorityQueue: false,
    resolution: 'HD',
    defaultModel: 'gemini-3.1-flash-image',
    defaultImageSize: '1K',
    maxImageSize: '1K',
    allowedModels: ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']
  },
  STARTER: {
    tier: 'STARTER',
    name: 'Starter',
    nameAr: 'البداية',
    monthlyCredits: 80,
    priceEGP: 349,
    priceSAR: 79,
    featuresEn: [
      '80 monthly commercial credits',
      'High-Definition (HD) exports',
      '1 Brand profile',
      'Zero watermarks',
      'Commercial license included',
      'Fast standard queue'
    ],
    featuresAr: [
      '80 رصيد تصوير تجاري شهرياً',
      'تصدير فائق الدقة بدون علامة مائية',
      'بروفايل علامة تجارية واحدة',
      'ترخيص تجاري كامل للاستخدام التسويقي',
      'طابور توليد سريع'
    ],
    maxBrands: 1,
    maxTeamSeats: 1,
    priorityQueue: false,
    resolution: 'HD',
    defaultModel: 'gemini-3.1-flash-image',
    defaultImageSize: '1K',
    maxImageSize: '1K',
    allowedModels: ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']
  },
  PRO: {
    tier: 'PRO',
    name: 'Pro Studio',
    nameAr: 'استوديو برو',
    monthlyCredits: 200,
    priceEGP: 899,
    priceSAR: 189,
    featuresEn: [
      '200 monthly commercial credits',
      'Ultra 4K studio rendering',
      '3 Brand profiles',
      'Full Regional Preset Library (Gulf Luxury, Ramadan)',
      'Custom prompt directives',
      'Priority generation queue',
      'Direct email & WhatsApp support'
    ],
    featuresAr: [
      '200 رصيد تصوير تجاري شهرياً',
      'تصدير بجودة الاستوديو الفائقة 4K',
      '3 بروفايلات لعلامات تجارية متعددة',
      'المكتبة الإقليمية الكاملة (فخامة خليجية، رمضانيات)',
      'تخصيص كامل لأوامر الإضاءة والخلفيات',
      'أولوية قصوى في معالجة الصور',
      'دعم مباشر عبر البريد والواتساب'
    ],
    maxBrands: 3,
    maxTeamSeats: 2,
    priorityQueue: true,
    resolution: '4K',
    defaultModel: 'gemini-3.1-flash-image',
    defaultImageSize: '1K',
    maxImageSize: '4K',
    allowedModels: ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image']
  },
  AGENCY: {
    tier: 'AGENCY',
    name: 'Agency Scale',
    nameAr: 'الوكالات والمتاجر الكبرى',
    monthlyCredits: 500,
    priceEGP: 1899,
    priceSAR: 399,
    featuresEn: [
      '500 monthly commercial credits',
      'Ultra 4K studio rendering',
      'Unlimited brand profiles',
      '5 Team collaboration seats',
      'Batch catalog processing',
      'Dedicated account manager',
      'API access for bulk generation'
    ],
    featuresAr: [
      '500 رصيد تصوير تجاري شهرياً',
      'تصدير بجودة الاستوديو الفائقة 4K',
      'عدد غير محدود من العلامات التجارية',
      '5 مقاعد عمل تعاونية للفريق',
      'معالجة جماعية لكتالوجات المنتجات',
      'مدير حسابات مخصص',
      'إمكانية الربط البرمجي API'
    ],
    maxBrands: 999,
    maxTeamSeats: 5,
    priorityQueue: true,
    resolution: '4K',
    defaultModel: 'gemini-3.1-flash-image',
    defaultImageSize: '1K',
    maxImageSize: '4K',
    allowedModels: ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image']
  }
};

export const TOP_UP_PACKS: TopUpPackConfig[] = [
  {
    id: 'pack_50',
    credits: 50,
    priceEGP: 249,
    priceSAR: 49,
    nameEn: '50 Extra Credits',
    nameAr: '50 رصيد إضافي'
  },
  {
    id: 'pack_150',
    credits: 150,
    priceEGP: 599,
    priceSAR: 119,
    nameEn: '150 Extra Credits (Popular)',
    nameAr: '150 رصيد إضافي (الأكثر طلباً)'
  },
  {
    id: 'pack_500',
    credits: 500,
    priceEGP: 1499,
    priceSAR: 299,
    nameEn: '500 Extra Credits (Best Value)',
    nameAr: '500 رصيد إضافي (أفضل قيمة)'
  }
];

export function getPriceForCountry(
  tier: PlanTier,
  country: Country
): { amount: number; currency: Currency; formatted: string } {
  const plan = SUBSCRIPTION_PLANS[tier];
  if (country === 'SA') {
    return {
      amount: plan.priceSAR,
      currency: 'SAR',
      formatted: `${plan.priceSAR} ر.س`
    };
  }
  return {
    amount: plan.priceEGP,
    currency: 'EGP',
    formatted: `${plan.priceEGP} ج.م`
  };
}

export function formatCurrency(amount: number, currency: Currency, locale: 'ar' | 'en' = 'ar'): string {
  if (currency === 'SAR') {
    return locale === 'ar' ? `${amount.toLocaleString('ar-SA')} ر.س` : `${amount.toLocaleString('en-US')} SAR`;
  }
  if (currency === 'EGP') {
    return locale === 'ar' ? `${amount.toLocaleString('ar-EG')} ج.م` : `${amount.toLocaleString('en-US')} EGP`;
  }
  return `$${amount.toFixed(2)}`;
}
