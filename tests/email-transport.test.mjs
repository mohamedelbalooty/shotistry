import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  EmailTransportUnavailableError,
  EmailRateLimitedError,
} from '../src/lib/email/types.ts';
import {
  createResendEmailTransport,
} from '../src/lib/email/resend-transport.ts';
import {
  MemoryEmailTransport,
} from '../src/lib/email/memory-transport.ts';
import {
  getEmailTransport,
  setEmailTransportForTests,
} from '../src/lib/email/index.ts';
import {
  renderVerifyEmailTemplate,
  renderPasswordResetTemplate,
  renderPasswordChangedNoticeTemplate,
  renderEmailChangeConfirmTemplate,
  renderEmailChangeNoticeTemplate,
  renderWorkspaceInviteTemplate,
} from '../src/lib/email/templates.ts';

describe('Transactional Email Adapter & Templates (Phase 4)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    setEmailTransportForTests(null);
  });

  afterEach(() => {
    process.env = { ...origEnv };
    setEmailTransportForTests(null);
  });

  test('ResendEmailTransport sends HTTP POST to Resend API with correct headers and payload', async () => {
    let capturedUrl = '';
    let capturedHeaders = {};
    let capturedBody = null;

    const mockFetch = async (url, options) => {
      capturedUrl = String(url);
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);

      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_test_12345' }),
      };
    };

    const transport = createResendEmailTransport({
      apiKey: 're_validTestApiKey_98765',
      from: 'Shotistry <no-reply@mail.shotistry.com>',
      replyTo: 'support@shotistry.com',
      fetchImpl: mockFetch,
    });

    const res = await transport.send({
      to: 'merchant@cairo.eg',
      subject: 'Verify your Shotistry account',
      html: '<p>Click to verify</p>',
      text: 'Click to verify',
      idempotencyKey: 'shotistry:verify:token123',
    });

    assert.equal(res.provider, 'resend');
    assert.equal(res.messageId, 'email_test_12345');
    assert.equal(capturedUrl, 'https://api.resend.com/emails');
    assert.equal(capturedHeaders['Authorization'], 'Bearer re_validTestApiKey_98765');
    assert.equal(capturedHeaders['Idempotency-Key'], 'shotistry:verify:token123');
    assert.equal(capturedBody.from, 'Shotistry <no-reply@mail.shotistry.com>');
    assert.equal(capturedBody.to, 'merchant@cairo.eg');
    assert.equal(capturedBody.subject, 'Verify your Shotistry account');
  });

  test('ResendEmailTransport maps HTTP 429 to EmailRateLimitedError with Retry-After', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'retry-after': '7' }),
      json: async () => ({ message: 'Rate limit exceeded' }),
    });

    const transport = createResendEmailTransport({
      apiKey: 're_test_key',
      from: 'Shotistry <no-reply@shotistry.com>',
      fetchImpl: mockFetch,
    });

    await assert.rejects(
      () =>
        transport.send({
          to: 'merchant@cairo.eg',
          subject: 'Test',
          html: 'test',
          text: 'test',
        }),
      (err) => {
        assert.ok(err instanceof EmailRateLimitedError);
        assert.equal(err.code, 'EMAIL_RATE_LIMITED');
        assert.equal(err.retryAfterSeconds, 7);
        return true;
      }
    );
  });

  test('ResendEmailTransport maps placeholder key or HTTP 5xx to EmailTransportUnavailableError', async () => {
    // Placeholder key
    const placeholderTransport = createResendEmailTransport({
      apiKey: 'your-resend-api-key',
      from: 'Shotistry <no-reply@shotistry.com>',
    });

    await assert.rejects(
      () =>
        placeholderTransport.send({
          to: 'merchant@cairo.eg',
          subject: 'Test',
          html: 'test',
          text: 'test',
        }),
      EmailTransportUnavailableError
    );

    // 500 error
    const failingFetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers(),
      json: async () => ({ message: 'Resend server error' }),
    });

    const failingTransport = createResendEmailTransport({
      apiKey: 're_valid_key',
      from: 'Shotistry <no-reply@shotistry.com>',
      fetchImpl: failingFetch,
    });

    await assert.rejects(
      () =>
        failingTransport.send({
          to: 'merchant@cairo.eg',
          subject: 'Test',
          html: 'test',
          text: 'test',
        }),
      EmailTransportUnavailableError
    );
  });

  test('MemoryEmailTransport records sent emails and allows test inspection', async () => {
    const transport = new MemoryEmailTransport();

    const res = await transport.send({
      to: 'customer@riyadh.sa',
      subject: 'Password Reset',
      html: '<p>Reset link</p>',
      text: 'Reset link',
    });

    assert.equal(res.provider, 'memory');
    assert.ok(res.messageId.startsWith('mem_'));

    const sent = transport.getSentMessages();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'customer@riyadh.sa');
    assert.equal(sent[0].subject, 'Password Reset');

    transport.clear();
    assert.equal(transport.getSentMessages().length, 0);
  });

  test('setEmailTransportForTests throws in production environment', () => {
    process.env.NODE_ENV = 'production';
    assert.throws(
      () => setEmailTransportForTests(new MemoryEmailTransport()),
      /cannot inject test email transport in production/i
    );
  });

  test('Templates render with proper RTL/LTR directions, HTML escaping, and #token= fragment URLs', () => {
    const maliciousName = '<script>alert("xss")</script> Tariq & Sons';
    const rawToken = 'secretTokenCSPRNG12345';
    const appBaseUrl = 'https://app.shotistry.com';

    // 1. Verify Email (Arabic)
    const verifyAr = renderVerifyEmailTemplate({
      name: maliciousName,
      targetEmail: 'tariq@brand.sa',
      token: rawToken,
      locale: 'ar',
      appBaseUrl,
    });

    assert.ok(verifyAr.html.includes('dir="rtl"'));
    assert.ok(!verifyAr.html.includes('<script>'), 'XSS payload must be escaped');
    assert.ok(verifyAr.html.includes('&lt;script&gt;'));
    assert.ok(
      verifyAr.html.includes('https://app.shotistry.com/verify-email#token=secretTokenCSPRNG12345'),
      'Token must strictly be in fragment'
    );
    assert.ok(!verifyAr.html.includes('?token='), 'Token must never be in query string');

    // 2. Password Reset (English)
    const resetEn = renderPasswordResetTemplate({
      name: 'John Doe',
      targetEmail: 'john@example.com',
      token: rawToken,
      locale: 'en',
      appBaseUrl,
    });

    assert.ok(resetEn.html.includes('dir="ltr"'));
    assert.ok(
      resetEn.html.includes('https://app.shotistry.com/reset-password#token=secretTokenCSPRNG12345')
    );
    assert.ok(!resetEn.html.includes('?token='));

    // 3. Workspace Invite (Arabic)
    const inviteAr = renderWorkspaceInviteTemplate({
      inviterName: 'Noura',
      workspaceName: 'Luxury Oud <Co>',
      role: 'ADMIN',
      invitedEmail: 'collaborator@perfume.sa',
      token: rawToken,
      locale: 'ar',
      appBaseUrl,
    });

    assert.ok(inviteAr.html.includes('dir="rtl"'));
    assert.ok(!inviteAr.html.includes('<Co>'));
    assert.ok(inviteAr.html.includes('&lt;Co&gt;'));
    assert.ok(
      inviteAr.html.includes('https://app.shotistry.com/invites/accept#token=secretTokenCSPRNG12345')
    );
  });
});
