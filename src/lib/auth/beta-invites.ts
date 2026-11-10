import crypto from 'node:crypto';
import { getBetaRepository } from '../db/repositories/beta-repository.ts';

export interface ValidatedBetaInvite {
  id: string;
  code: string;
  description?: string | null;
  maxUses: number;
  usedCount: number;
  isValid: boolean;
  reason?: 'NOT_FOUND' | 'EXPIRED' | 'EXHAUSTED' | 'INACTIVE';
}

export function isBetaInviteRequired(): boolean {
  return (
    process.env.SHOTISTRY_BETA_INVITE_REQUIRED === '1' ||
    process.env.SHOTISTRY_BETA_INVITE_REQUIRED === 'true'
  );
}

export async function validateBetaInviteCode(rawCode?: string | null): Promise<ValidatedBetaInvite> {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) {
    return {
      id: '',
      code: '',
      maxUses: 0,
      usedCount: 0,
      isValid: false,
      reason: 'NOT_FOUND',
    };
  }

  const betaRepo = getBetaRepository();
  const record = await betaRepo.findInviteByCode(code);

  if (!record) {
    return { id: '', code, maxUses: 0, usedCount: 0, isValid: false, reason: 'NOT_FOUND' };
  }

  if (!record.isActive) {
    return {
      id: record.id,
      code,
      maxUses: record.maxUses,
      usedCount: record.usedCount,
      isValid: false,
      reason: 'INACTIVE',
    };
  }

  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return {
      id: record.id,
      code,
      maxUses: record.maxUses,
      usedCount: record.usedCount,
      isValid: false,
      reason: 'EXPIRED',
    };
  }

  if (record.usedCount >= record.maxUses) {
    return {
      id: record.id,
      code,
      maxUses: record.maxUses,
      usedCount: record.usedCount,
      isValid: false,
      reason: 'EXHAUSTED',
    };
  }

  return {
    id: record.id,
    code: record.code,
    description: record.description,
    maxUses: record.maxUses,
    usedCount: record.usedCount,
    isValid: true,
  };
}

export async function redeemBetaInvite(inviteCodeId: string, userId: string): Promise<void> {
  const betaRepo = getBetaRepository();
  await betaRepo.redeemInviteCode(inviteCodeId, userId);
}

export async function createBetaInviteCode(params: {
  code: string;
  description?: string;
  maxUses?: number;
  expiresAt?: Date | null;
}): Promise<{ id: string; code: string }> {
  const betaRepo = getBetaRepository();
  const id = `beta-inv-${crypto.randomUUID()}`;
  const normalizedCode = params.code.trim().toUpperCase();
  const nowIso = new Date().toISOString();
  const expiresAtIso = params.expiresAt ? params.expiresAt.toISOString() : null;

  await betaRepo.createInviteCode({
    id,
    code: normalizedCode,
    description: params.description,
    maxUses: params.maxUses ?? 1,
    expiresAtIso,
    nowIso,
  });

  return { id, code: normalizedCode };
}
