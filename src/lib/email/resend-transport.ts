import type {
  EmailTransport,
  EmailMessage,
  EmailSendResult,
} from './types.ts';
import {
  EmailTransportUnavailableError,
  EmailRateLimitedError,
} from './types.ts';

export interface ResendEmailTransportOptions {
  apiKey?: string;
  from?: string;
  replyTo?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  initialDelayMs?: number;
  timeoutMs?: number;
}

function isValidResendApiKey(key?: string): boolean {
  if (!key) return false;
  if (
    key.includes('placeholder') ||
    key.includes('your-') ||
    key.includes('changeme') ||
    key.length < 10
  ) {
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ResendEmailTransport implements EmailTransport {
  readonly provider = 'resend' as const;
  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly timeoutMs: number;

  constructor(options: ResendEmailTransportOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.RESEND_API_KEY ?? '';
    this.from =
      options.from ??
      process.env.EMAIL_FROM ??
      'Shotistry <no-reply@mail.shotistry.com>';
    this.replyTo = options.replyTo ?? process.env.EMAIL_REPLY_TO;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.initialDelayMs = options.initialDelayMs ?? 100;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.apiKey || !isValidResendApiKey(this.apiKey) || !this.from) {
      throw new EmailTransportUnavailableError(
        'Resend API key or From address is unconfigured or placeholder'
      );
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (message.idempotencyKey) {
      headers['Idempotency-Key'] = message.idempotencyKey.slice(0, 256);
    }

    const payload: Record<string, unknown> = {
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    };

    if (this.replyTo) {
      payload.reply_to = this.replyTo;
    }

    const totalAttempts = 1 + this.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        const response = await this.fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        // 429 Rate Limiting
        if (response.status === 429) {
          const retryHeader = response.headers?.get('retry-after');
          const retrySeconds = retryHeader ? Number.parseInt(retryHeader, 10) : 1;
          const waitTimeMs = Number.isFinite(retrySeconds) && retrySeconds > 0
            ? retrySeconds * 1000
            : this.initialDelayMs * Math.pow(2, attempt - 1);

          if (attempt < totalAttempts) {
            await sleep(Math.min(waitTimeMs, 2000));
            continue;
          }

          throw new EmailRateLimitedError(
            'Resend API rate limit exceeded',
            Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds : 10
          );
        }

        // Non-retryable 4xx client errors (fail immediately on attempt 1)
        if (response.status >= 400 && response.status < 500) {
          const errText = await response.text().catch(() => '');
          throw new EmailTransportUnavailableError(
            `Resend API client error (${response.status}): ${errText || response.statusText}`
          );
        }

        // 5xx server errors (retryable transient)
        if (response.status >= 500) {
          const errText = await response.text().catch(() => '');
          lastError = new EmailTransportUnavailableError(
            `Resend API server error (${response.status}): ${errText || response.statusText}`
          );

          if (attempt < totalAttempts) {
            const delay = this.initialDelayMs * Math.pow(2, attempt - 1);
            await sleep(delay);
            continue;
          }

          throw lastError;
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new EmailTransportUnavailableError(
            `Resend API error (${response.status}): ${errText || response.statusText}`
          );
        }

        const data = (await response.json()) as { id?: string };
        if (!data?.id) {
          throw new EmailTransportUnavailableError(
            'Invalid response from Resend API: missing message id'
          );
        }

        return {
          provider: this.provider,
          messageId: data.id,
        };
      } catch (err: unknown) {
        if (
          err instanceof EmailTransportUnavailableError ||
          err instanceof EmailRateLimitedError
        ) {
          throw err;
        }

        // Network / timeout error (retryable transient)
        lastError = new EmailTransportUnavailableError(
          `Failed to send email via Resend (attempt ${attempt}/${totalAttempts}): ${
            err instanceof Error ? err.message : String(err)
          }`
        );

        if (attempt < totalAttempts) {
          const delay = this.initialDelayMs * Math.pow(2, attempt - 1);
          await sleep(delay);
          continue;
        }

        throw lastError;
      }
    }

    throw (
      lastError ??
      new EmailTransportUnavailableError('Resend email delivery failed after retries')
    );
  }
}

export function createResendEmailTransport(
  options: ResendEmailTransportOptions = {}
): ResendEmailTransport {
  return new ResendEmailTransport(options);
}
