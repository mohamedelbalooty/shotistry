import type { EmailTransport } from './types.ts';
import { createResendEmailTransport } from './resend-transport.ts';
import { MemoryEmailTransport } from './memory-transport.ts';

export * from './types.ts';
export * from './resend-transport.ts';
export * from './memory-transport.ts';
export * from './templates.ts';

let activeTestTransport: EmailTransport | null = null;

/**
 * Injects an explicit EmailTransport for testing (dev/test only).
 * Strictly throws in production.
 */
export function setEmailTransportForTests(
  transport: EmailTransport | null
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Security Violation: Cannot inject test email transport in production'
    );
  }
  activeTestTransport = transport;
}

/**
 * Resolves the active transactional email transport.
 * In production: always resolves to ResendEmailTransport (which fails closed if unconfigured).
 * In test/dev: resolves to injected test transport, or Resend if key exists, or MemoryEmailTransport fallback.
 */
export function getEmailTransport(): EmailTransport {
  if (activeTestTransport) {
    return activeTestTransport;
  }

  if (process.env.NODE_ENV === 'production') {
    return createResendEmailTransport();
  }

  if (
    process.env.RESEND_API_KEY &&
    !process.env.RESEND_API_KEY.includes('placeholder') &&
    process.env.RESEND_API_KEY.length >= 10
  ) {
    return createResendEmailTransport();
  }

  return new MemoryEmailTransport();
}
