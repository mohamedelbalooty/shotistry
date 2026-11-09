export type Country = 'EG' | 'SA';
export type CountryCode = Country;
export type Currency = 'EGP' | 'SAR' | 'USD';
export type CurrencyCode = Currency;
export type Locale = 'ar' | 'en';
export type PlatformRole = 'USER' | 'SUPPORT' | 'ADMIN';
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

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
  | 'TRIAL_GRANT'
  | 'SUBSCRIPTION_GRANT'
  | 'TOP_UP_PURCHASE'
  | 'JOB_SETTLEMENT'
  | 'JOB_REFUND'
  | 'ADMIN_ADJUSTMENT'
  | 'REFUND_REVERSAL';

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

export type GeminiImageModelId =
  | 'gemini-3.1-flash-image'
  | 'gemini-3.1-flash-lite-image'
  | 'gemini-3-pro-image';

export type GeminiImageSize = '512' | '1K' | '2K' | '4K';

export type GeminiServiceTier = 'standard' | 'batch' | 'flex' | 'priority';

export type SupportedImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export type ExecutionMode = 'LIVE_GEMINI_API' | 'LOCAL_COMPOSITE_SANDBOX';

export interface GeminiUsageMetadata {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens?: number;
  totalTokens: number;
}

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
  defaultModel: GeminiImageModelId;
  defaultImageSize: GeminiImageSize;
  maxImageSize: GeminiImageSize;
  allowedModels: GeminiImageModelId[];
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
  photoshootId?: string;
  interactionId?: string;
  status?: 'COMPLETED' | 'FAILED';
  imageUrl: string;
  thumbnailUrl: string;
  maskImageUrl?: string;
  isolatedProductUrl?: string;
  aspectRatio: AspectRatio;
  resolution: string;
  modelUsed: GeminiImageModelId | string;
  executionMode: ExecutionMode;
  synthesizedPrompt: string;
  negativePrompt?: string;
  synthIdDetected: boolean;
  aiGenerated?: boolean;
  costUsdMicros?: number;
  fidelityScore: number;
  fidelityVerified: boolean;
  usageMetadata?: GeminiUsageMetadata;
  creditsCharged?: number;
  remainingCredits?: number;
  completedAt: string;
}

export type PhotoshootGenerationResult = GenerationResult;
