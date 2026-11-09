import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Logger,
  createScopedLogger,
  redactSensitiveData,
} from '../src/lib/observability/logger.ts';
import {
  runWithRequestContext,
  getRequestContext,
  updateRequestContext,
} from '../src/lib/observability/request-context.ts';

test('Observability - Request Context AsyncLocalStorage', () => {
  assert.equal(getRequestContext(), undefined, 'Context outside runWithRequestContext should be undefined');

  runWithRequestContext(
    {
      requestId: 'req-custom-123',
      traceId: 'tr-abc-456',
      workspaceId: 'ws-test-789',
      userId: 'usr-999',
    },
    () => {
      const ctx = getRequestContext();
      assert.ok(ctx, 'Context must be populated inside runWithRequestContext');
      assert.equal(ctx.requestId, 'req-custom-123');
      assert.equal(ctx.traceId, 'tr-abc-456');
      assert.equal(ctx.workspaceId, 'ws-test-789');
      assert.equal(ctx.userId, 'usr-999');

      updateRequestContext({ path: '/api/test' });
      assert.equal(getRequestContext()?.path, '/api/test');
    }
  );

  assert.equal(getRequestContext(), undefined, 'Context must be cleared after execution');
});

test('Observability - Redaction of Sensitive Fields in Objects', () => {
  const payload = {
    username: 'merchant@example.com',
    password: 'super-secret-password-123',
    token: 'jwt-token-xyz',
    api_key: 'gemini-live-secret-key',
    apiKey: 'another-secret-key',
    client_secret: 'paymob-client-secret',
    private_key: 'rsa-private-key-data',
    authorization: 'Bearer secret-jwt-value',
    cookie: 'session_token=abcdef123',
    hmac: 'hmac-sha512-signature',
    safeData: {
      plan: 'STARTER',
      resolution: '1K',
      nestedConfig: {
        access_token: 'secret-token-nested',
        count: 5,
      },
    },
  };

  const redacted = redactSensitiveData(payload);

  assert.equal(redacted.username, 'merchant@example.com');
  assert.equal(redacted.password, '[REDACTED]');
  assert.equal(redacted.token, '[REDACTED]');
  assert.equal(redacted.api_key, '[REDACTED]');
  assert.equal(redacted.apiKey, '[REDACTED]');
  assert.equal(redacted.client_secret, '[REDACTED]');
  assert.equal(redacted.private_key, '[REDACTED]');
  assert.equal(redacted.authorization, '[REDACTED]');
  assert.equal(redacted.cookie, '[REDACTED]');
  assert.equal(redacted.hmac, '[REDACTED]');
  assert.equal(redacted.safeData.plan, 'STARTER');
  assert.equal(redacted.safeData.resolution, '1K');
  assert.equal(redacted.safeData.nestedConfig.access_token, '[REDACTED]');
  assert.equal(redacted.safeData.nestedConfig.count, 5);
});

test('Observability - Redaction of Sensitive String Patterns (Bearer, Hex, Presigned URL)', () => {
  const bearerStr = 'User authenticated with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
  assert.equal(
    redactSensitiveData(bearerStr),
    'User authenticated with Bearer [REDACTED]'
  );

  const urlWithFragment = 'Verification email sent to https://staging.shotistry.com/verify#token=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  assert.equal(
    redactSensitiveData(urlWithFragment),
    'Verification email sent to https://staging.shotistry.com/verify#token=[REDACTED]'
  );

  const presignedUrl = 'https://shotistry-assets.r2.cloudflarestorage.com/raw/img.png?X-Amz-Signature=abcdef123456&X-Amz-Credential=cred123&api_key=secret';
  const sanitizedUrl = redactSensitiveData(presignedUrl);
  assert.ok(!sanitizedUrl.includes('abcdef123456'), 'Amz-Signature value must be redacted');
  assert.ok(!sanitizedUrl.includes('secret'), 'api_key query value must be redacted');
  assert.ok(sanitizedUrl.includes('X-Amz-Signature=[REDACTED]'));

  const rawHexToken = 'Action token was 4a6c8e3b2f109876543210abcdef0123456789abcdef0123456789abcdef0123 for user';
  assert.equal(
    redactSensitiveData(rawHexToken),
    'Action token was [REDACTED_HEX_TOKEN] for user'
  );
});

test('Observability - Circular Reference Handling without Stack Overflow', () => {
  const circularObj = { name: 'test' };
  circularObj.self = circularObj;

  const result = redactSensitiveData(circularObj);
  assert.equal(result.name, 'test');
  assert.equal(result.self, '[CIRCULAR]');
});

test('Observability - Error Object Redaction', () => {
  const err = new Error('Failed with token Bearer secret-auth-token-1234');
  const sanitizedErr = redactSensitiveData(err);
  assert.equal(sanitizedErr.name, 'Error');
  assert.equal(sanitizedErr.message, 'Failed with token Bearer [REDACTED]');
  assert.ok(sanitizedErr.stack?.includes('Bearer [REDACTED]'));
});

test('Observability - Structured JSON Logging and Context Binding', () => {
  const capturedStdout = [];
  const capturedStderr = [];

  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  process.stdout.write = (chunk) => {
    capturedStdout.push(chunk.toString());
    return true;
  };
  process.stderr.write = (chunk) => {
    capturedStderr.push(chunk.toString());
    return true;
  };

  try {
    const testLogger = createScopedLogger('billing:checkout');

    runWithRequestContext(
      {
        requestId: 'req-logger-test',
        traceId: 'tr-test-99',
        workspaceId: 'ws-abc',
        userId: 'usr-xyz',
      },
      () => {
        testLogger.info('Checkout initiated', {
          plan: 'PRO',
          amount: 299,
          client_secret: 'paymob_secret_dont_log',
        });

        testLogger.error('Payment processing failed', new Error('Gateway rejected token Bearer abc123def'), {
          orderId: 'paymob-ord-123',
        });
      }
    );

    assert.equal(capturedStdout.length, 1, 'info log should write to stdout');
    assert.equal(capturedStderr.length, 1, 'error log should write to stderr');

    const infoEntry = JSON.parse(capturedStdout[0]);
    assert.equal(infoEntry.level, 'info');
    assert.equal(infoEntry.scope, 'billing:checkout');
    assert.equal(infoEntry.requestId, 'req-logger-test');
    assert.equal(infoEntry.traceId, 'tr-test-99');
    assert.equal(infoEntry.workspaceId, 'ws-abc');
    assert.equal(infoEntry.userId, 'usr-xyz');
    assert.equal(infoEntry.message, 'Checkout initiated');
    assert.equal(infoEntry.metadata.plan, 'PRO');
    assert.equal(infoEntry.metadata.client_secret, '[REDACTED]');

    const errorEntry = JSON.parse(capturedStderr[0]);
    assert.equal(errorEntry.level, 'error');
    assert.equal(errorEntry.scope, 'billing:checkout');
    assert.equal(errorEntry.message, 'Payment processing failed');
    assert.equal(errorEntry.metadata.orderId, 'paymob-ord-123');
    assert.equal(errorEntry.error.message, 'Gateway rejected token Bearer [REDACTED]');
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
});
