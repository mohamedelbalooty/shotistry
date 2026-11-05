export type Country = 'EG' | 'SA';
export type Currency = 'EGP' | 'SAR' | 'USD';
export type Locale = 'ar' | 'en';

export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'AGENCY';

export type SubscriptionStatus =
  | 'INCOMPLETE'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELED';

export type JobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export type ReservationStatus = 'PENDING' | 'SETTLED' | 'RELEASED';

export type LedgerTransactionType =
  | 'SUBSCRIPTION_GRANT'
  | 'TOP_UP_PURCHASE'
  | 'JOB_SETTLEMENT'
  | 'JOB_REFUND'
  | 'ADMIN_ADJUSTMENT';

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  nameAr: string;
  monthlyCredits: number;
  priceEGP: number; // In whole EGP
  priceSAR: number; // In whole SAR
  featuresEn: string[];
  featuresAr: string[];
  maxBrands: number;
  maxTeamSeats: number;
  priorityQueue: boolean;
  resolution: 'HD' | '4K';
}

export interface TopUpPackConfig {
  id: string;
  credits: number;
  priceEGP: number;
  priceSAR: number;
  nameEn: string;
  nameAr: string;
}

export interface PromptComponentSchema {
  subject: string;
  surface: string;
  backdrop: string;
  lighting: string;
  cameraLens: string;
  depthOfField: string;
  colorGrading: string;
  props: string;
  physicalCoherence: string;
  negativeDirectives: string;
}

export interface PhotoshootPreset {
  id: string;
  name: string;
  nameAr: string;
  category: 'fragrances' | 'cosmetics' | 'apparel' | 'fnb' | 'jewelry' | 'seasonal';
  descriptionEn: string;
  descriptionAr: string;
  thumbnailUrl: string;
  isRegional: boolean;
  baseSchema: Partial<PromptComponentSchema>;
}

export interface GenerationRequest {
  photoshootId: string;
  workspaceId: string;
  productTitle: string;
  productCategory: string;
  presetId: string;
  aspectRatio: AspectRatio;
  customNotes?: string;
  rawImageUrl: string;
  maskedImageUrl?: string;
}

export interface GenerationResult {
  jobId: string;
  imageUrl: string;
  thumbnailUrl: string;
  aspectRatio: AspectRatio;
  resolution: string;
  modelUsed: string;
  synthesizedPrompt: string;
  synthIdDetected: boolean;
  completedAt: string;
}
