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

export class ResendEmailTransport implements EmailTransport {
  readonly provider = 'resend' as const;
  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ResendEmailTransportOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.RESEND_API_KEY ?? '';
    this.from =
      options.from ??
      process.env.EMAIL_FROM ??
      'Shotistry <no-reply@mail.shotistry.com>';
    this.replyTo = options.replyTo ?? process.env.EMAIL_REPLY_TO;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
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

    try {
      const response = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 429) {
        const retryHeader = response.headers?.get('retry-after');
        const retrySeconds = retryHeader ? Number.parseInt(retryHeader, 10) : 10;
        throw new EmailRateLimitedError(
          'Resend API rate limit exceeded',
          Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds : 10
        );
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
      throw new EmailTransportUnavailableError(
        `Failed to send email via Resend: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export function createResendEmailTransport(
  options: ResendEmailTransportOptions = {}
): ResendEmailTransport {
  return new ResendEmailTransport(options);
}
