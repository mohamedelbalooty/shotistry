export class GeminiError extends Error {
  public readonly isRetryable: boolean;
  public readonly statusCode?: number;
  public readonly errorCode?: string;

  constructor(
    message: string,
    options: { isRetryable: boolean; statusCode?: number; errorCode?: string }
  ) {
    super(message);
    this.name = 'GeminiError';
    this.isRetryable = options.isRetryable;
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
  }
}

export class GeminiTimeoutError extends GeminiError {
  constructor(timeoutMs = 30000) {
    super(`Gemini API request timed out after ${timeoutMs}ms`, {
      isRetryable: true,
      statusCode: 504,
      errorCode: 'TIMEOUT',
    });
    this.name = 'GeminiTimeoutError';
  }
}

export class GeminiRateLimitError extends GeminiError {
  constructor(message = 'Gemini API rate limit exceeded (429 / RESOURCE_EXHAUSTED)') {
    super(message, {
      isRetryable: true,
      statusCode: 429,
      errorCode: 'RESOURCE_EXHAUSTED',
    });
    this.name = 'GeminiRateLimitError';
  }
}

export class GeminiUnavailableError extends GeminiError {
  constructor(message = 'Gemini API service temporarily unavailable (503 / UNAVAILABLE)') {
    super(message, {
      isRetryable: true,
      statusCode: 503,
      errorCode: 'UNAVAILABLE',
    });
    this.name = 'GeminiUnavailableError';
  }
}

export class GeminiSafetyBlockError extends GeminiError {
  constructor(
    message = 'Image generation blocked by policy (safety policy). Please adjust product photo or directives.'
  ) {
    super(message, {
      isRetryable: false,
      statusCode: 400,
      errorCode: 'SAFETY_BLOCKED',
    });
    this.name = 'GeminiSafetyBlockError';
  }
}

export class GeminiInvalidInputError extends GeminiError {
  constructor(message: string) {
    super(message, {
      isRetryable: false,
      statusCode: 400,
      errorCode: 'INVALID_ARGUMENT',
    });
    this.name = 'GeminiInvalidInputError';
  }
}

export class GeminiNoImageOutputError extends GeminiError {
  constructor(
    message = 'Gemini Interactions API returned no image output in interaction.output_image.data or model_output steps'
  ) {
    super(message, {
      isRetryable: false,
      statusCode: 502,
      errorCode: 'NO_IMAGE_OUTPUT',
    });
    this.name = 'GeminiNoImageOutputError';
  }
}

/**
 * Classifies an unknown error or API interaction error response into structured GeminiError.
 */
export function classifyGeminiError(err: unknown): GeminiError {
  if (err instanceof GeminiError) {
    return err;
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  const lower = rawMsg.toLowerCase();

  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('abort')
  ) {
    return new GeminiTimeoutError(30000);
  }

  if (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return new GeminiRateLimitError(rawMsg);
  }

  if (
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('500') ||
    lower.includes('unavailable') ||
    lower.includes('internal')
  ) {
    return new GeminiUnavailableError(rawMsg);
  }

  if (lower.includes('safety') || lower.includes('blocked') || lower.includes('policy')) {
    return new GeminiSafetyBlockError();
  }

  if (lower.includes('no image output') || lower.includes('empty image')) {
    return new GeminiNoImageOutputError(rawMsg);
  }

  return new GeminiInvalidInputError(rawMsg);
}
