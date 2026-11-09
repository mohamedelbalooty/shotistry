import { getRequestContext } from './request-context.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /set-cookie/i,
  /hmac/i,
  /api[_-]?key/i,
  /client[_-]?secret/i,
  /private[_-]?key/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeStringValue(val: string): string {
  let sanitized = val;

  // Redact Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]');

  // Redact #token= fragment values
  sanitized = sanitized.replace(/(#token=)[^&\s]+/gi, '$1[REDACTED]');

  // Redact URL query parameters for secrets (token, key, X-Amz-Signature, etc.)
  sanitized = sanitized.replace(/([?&](?:token|key|api_key|X-Amz-Signature|X-Amz-Credential|signature)=)[^&\s]+/gi, '$1[REDACTED]');

  // Redact raw 64-hex action tokens
  sanitized = sanitized.replace(/\b[0-9a-fA-F]{64}\b/g, '[REDACTED_HEX_TOKEN]');

  return sanitized;
}

export function redactSensitiveData(data: unknown, visited = new WeakSet()): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeStringValue(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitizeStringValue(data.message),
      stack: data.stack ? sanitizeStringValue(data.stack) : undefined,
    };
  }

  if (Array.isArray(data)) {
    if (visited.has(data)) return '[CIRCULAR]';
    visited.add(data);
    return data.map((item) => redactSensitiveData(item, visited));
  }

  if (typeof data === 'object') {
    if (visited.has(data)) return '[CIRCULAR]';
    visited.add(data);

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSensitiveData(val, visited);
      }
    }
    return result;
  }

  return String(data);
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  scope?: string;
  requestId?: string;
  traceId?: string;
  workspaceId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  error?: unknown;
}

export class Logger {
  private scope?: string;
  private minLevel: LogLevel;

  constructor(scope?: string) {
    this.scope = scope;
    const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
    this.minLevel = envLevel in LOG_LEVEL_PRIORITY ? envLevel : 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private write(level: LogLevel, message: string, metadata?: Record<string, unknown>, error?: unknown): void {
    if (!this.shouldLog(level)) return;

    const ctx = getRequestContext();
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizeStringValue(message),
      scope: this.scope,
      requestId: ctx?.requestId,
      traceId: ctx?.traceId,
      workspaceId: ctx?.workspaceId,
      userId: ctx?.userId,
      metadata: metadata ? (redactSensitiveData(metadata) as Record<string, unknown>) : undefined,
      error: error ? redactSensitiveData(error) : undefined,
    };

    const serialized = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(serialized + '\n');
    } else {
      process.stdout.write(serialized + '\n');
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.write('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.write('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.write('warn', message, metadata);
  }

  error(message: string, error?: unknown, metadata?: Record<string, unknown>): void {
    this.write('error', message, metadata, error);
  }

  child(subScope: string): Logger {
    const nextScope = this.scope ? `${this.scope}:${subScope}` : subScope;
    return new Logger(nextScope);
  }
}

export const logger = new Logger();

export function createScopedLogger(scope: string): Logger {
  return new Logger(scope);
}
