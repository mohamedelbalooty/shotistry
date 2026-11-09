import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createResendEmailTransport,
} from '../src/lib/email/resend-transport.ts';
import {
  EmailTransportUnavailableError,
  EmailRateLimitedError,
} from '../src/lib/email/types.ts';
import {
  renderVerifyEmailTemplate,
  renderPasswordResetTemplate,
  renderPasswordChangedNoticeTemplate,
  renderEmailChangeConfirmTemplate,
  renderEmailChangeNoticeTemplate,
  renderWorkspaceInviteTemplate,
} from '../src/lib/email/templates.ts';

describe('Milestone M8: Transactional Email Retries & Secret Redaction Tests', () => {
  it('retries transient 5xx server errors and succeeds when server recovers', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          text: async () => 'Cloudflare Bad Gateway',
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_recovered_123' }),
      };
    };

    const transport = createResendEmailTransport({
      apiKey: 're_valid_key_test_12345',
      from: 'Shotistry <no-reply@mail.shotistry.com>',
      fetchImpl: mockFetch,
      initialDelayMs: 10,
    });

    const res = await transport.send({
      to: 'merchant@cairo.eg',
      subject: 'Verify Account',
      html: '<p>Test</p>',
      text: 'Test',
    });

    assert.equal(callCount, 2, 'Must have made exactly 2 calls (1 failure + 1 retry)');
    assert.equal(res.messageId, 'email_recovered_123');
  });

  it('fails immediately on 4xx client errors without executing unnecessary retries', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: async () => 'Invalid recipient email domain',
      };
    };

    const transport = createResendEmailTransport({
      apiKey: 're_valid_key_test_12345',
      from: 'Shotistry <no-reply@mail.shotistry.com>',
      fetchImpl: mockFetch,
      maxRetries: 3,
      initialDelayMs: 10,
    });

    await assert.rejects(
      () =>
        transport.send({
          to: 'invalid-domain@bad.xyz',
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        }),
      (err) => {
        assert.ok(err instanceof EmailTransportUnavailableError);
        assert.ok(err.message.includes('422'));
        return true;
      }
    );

    assert.equal(callCount, 1, 'Client 4xx errors must fail immediately on attempt 1');
  });

  it('strictly ensures no secret token or fragment URL is ever logged during email handling', () => {
    const rawSecretToken = 'c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ffee1234';
    const appBaseUrl = 'https://staging.shotistry.com';

    const logs = [];
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    try {
      console.log = (...args) => logs.push(args.join(' '));
      console.info = (...args) => logs.push(args.join(' '));
      console.warn = (...args) => logs.push(args.join(' '));
      console.error = (...args) => logs.push(args.join(' '));

      // 1. Render Verify Email
      const verifyTpl = renderVerifyEmailTemplate({
        name: 'Youssef Merchant',
        targetEmail: 'youssef@alexandria.eg',
        token: rawSecretToken,
        locale: 'ar',
        appBaseUrl,
      });
      // Emulate application logging email delivery metadata
      console.info(`[Email] Sending verification email to ${verifyTpl.toDomain || 'domain.eg'}`);

      // 2. Render Password Reset
      const resetTpl = renderPasswordResetTemplate({
        name: 'Fatima Store',
        targetEmail: 'fatima@jeddah.sa',
        token: rawSecretToken,
        locale: 'ar',
        appBaseUrl,
      });
      console.info(`[Email] Sending password reset with subject: ${resetTpl.subject}`);

      // 3. Render Workspace Invite
      const inviteTpl = renderWorkspaceInviteTemplate({
        inviterName: 'Noura Owner',
        workspaceName: 'Saudi Perfumes',
        role: 'MEMBER',
        invitedEmail: 'member@saudi.sa',
        token: rawSecretToken,
        locale: 'en',
        appBaseUrl,
      });
      console.info(`[Email] Sending invite for workspace: ${inviteTpl.subject}`);

      // 4. Assert token is present in the email HTML fragment
      assert.ok(verifyTpl.html.includes(`#token=${rawSecretToken}`));
      assert.ok(resetTpl.html.includes(`#token=${rawSecretToken}`));
      assert.ok(inviteTpl.html.includes(`#token=${rawSecretToken}`));

      // 5. Assert that NOT A SINGLE log message contains the token or the fragment
      const combinedLogs = logs.join('\n');
      assert.ok(
        !combinedLogs.includes(rawSecretToken),
        'Raw 64-hex action token must never appear in log output'
      );
      assert.ok(
        !combinedLogs.includes('#token='),
        'URL fragment #token= must never appear in log output'
      );
      assert.ok(
        !combinedLogs.includes('?token='),
        'URL query parameter ?token= must never exist'
      );
    } finally {
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    }
  });
});

