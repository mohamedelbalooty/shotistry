/**
 * Transactional email transport types and error classes.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  tags?: Record<string, string>;
}

export interface EmailSendResult {
  provider: 'resend' | 'memory';
  messageId: string;
}

export interface EmailTransport {
  readonly provider: 'resend' | 'memory';
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class EmailTransportUnavailableError extends Error {
  readonly code: string = 'EMAIL_SERVICE_UNAVAILABLE';

  constructor(
    message = 'Transactional email service is unavailable or unconfigured'
  ) {
    super(message);
    this.name = 'EmailTransportUnavailableError';
  }
}

export class EmailRateLimitedError extends Error {
  readonly code: string = 'EMAIL_RATE_LIMITED';
  readonly retryAfterSeconds: number;

  constructor(
    message = 'Email sending rate limit exceeded',
    retryAfterSeconds = 10
  ) {
    super(message);
    this.name = 'EmailRateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
