import crypto from 'node:crypto';
import { getActionTokenRepository } from '../db/repositories/action-token-repository.ts';
import type {
  ActionTokenType,
  ActionTokenRecord,
} from '../db/repositories/action-token-repository.ts';

export interface CreateActionTokenInput {
  userId: string;
  type: ActionTokenType;
  targetEmail?: string | null;
  ttlMinutes: number;
  createdIp?: string | null;
  revokeReason?: string;
}

export interface CreateActionTokenResult {
  rawToken: string;
  tokenRecord: ActionTokenRecord;
}

export interface ConsumeActionTokenInput {
  rawToken: string;
  expectedType: ActionTokenType;
  expectedTargetEmail?: string | null;
  now?: Date;
}

/**
 * Creates and issues a cryptographically secure, single-use action token.
 * The raw token (256-bit CSPRNG base64url) is returned once to the caller.
 * Only the SHA-256 digest is persisted in the database.
 */
export async function createActionToken(
  input: CreateActionTokenInput
): Promise<CreateActionTokenResult> {
  const rawBytes = crypto.randomBytes(32);
  const rawToken = rawBytes.toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60 * 1000);
  const repo = getActionTokenRepository();

  if (input.revokeReason) {
    await repo.revokeActiveTokensForUser(
      input.userId,
      input.type,
      input.revokeReason
    );
  }

  const tokenRecord = await repo.issueToken({
    userId: input.userId,
    type: input.type,
    tokenHash,
    targetEmail: input.targetEmail ?? null,
    createdIp: input.createdIp ?? null,
    expiresAt,
  });

  return { rawToken, tokenRecord };
}

/**
 * Atomically consumes a single-use action token.
 * Validates expiration, active state, and expected token type.
 * Returns the consumed record or null if the token is invalid, expired, or already consumed.
 */
export async function consumeActionToken(
  input: ConsumeActionTokenInput
): Promise<ActionTokenRecord | null> {
  if (!input.rawToken || typeof input.rawToken !== 'string') {
    return null;
  }

  const tokenHash = crypto
    .createHash('sha256')
    .update(input.rawToken.trim())
    .digest('hex');

  const repo = getActionTokenRepository();
  const tokenRecord = await repo.consumeToken({
    tokenHash,
    expectedType: input.expectedType,
    now: input.now,
  });

  if (!tokenRecord) {
    return null;
  }

  if (input.expectedTargetEmail && tokenRecord.targetEmail) {
    if (
      tokenRecord.targetEmail.trim().toLowerCase() !==
      input.expectedTargetEmail.trim().toLowerCase()
    ) {
      return null;
    }
  }

  return tokenRecord;
}
