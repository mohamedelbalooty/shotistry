export type GenerationJobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export const JOB_ERROR_CODES = {
  TIMEOUT_STALE_HEARTBEAT: 'TIMEOUT_STALE_HEARTBEAT',
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  AI_GENERATION_FAILED: 'AI_GENERATION_FAILED',
  IMAGE_PROCESSING_FAILED: 'IMAGE_PROCESSING_FAILED',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  WORKSPACE_CONCURRENCY_LIMIT: 'WORKSPACE_CONCURRENCY_LIMIT',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;

export type JobErrorCode = (typeof JOB_ERROR_CODES)[keyof typeof JOB_ERROR_CODES];

export interface GenerationJobDetail {
  id: string;
  photoshootId: string;
  workspaceId: string;
  status: GenerationJobStatus;
  modelUsed: string;
  creditCost: number;
  rawPrompt: string;
  synthesizedPrompt: string;
  errorMessage: string | null;
  lastErrorCode: string | null;
  attempts: number;
  idempotencyKey: string | null;
  assetKey: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  thoughtTokens: number | null;
  costUsdMicros: number | null;
  startedAt: string | null;
  completedAt: string | null;
  heartbeatAt: string | null;
  createdAt: string;
  reservationStatus?: string | null;
}

