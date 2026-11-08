import crypto from 'node:crypto';
import { getAdminRepository } from '../../../../../lib/db/repositories/admin-repository.ts';
import { resolveAuthenticatedSession } from '../../../../../lib/auth/session.ts';
import {
  ADMIN_CREDIT_ADJUSTMENT_MAX,
  SUPPORT_CREDIT_ADJUSTMENT_MAX,
  hasPlatformPermission,
  requirePlatformPermission,
} from '../../../../../lib/auth/rbac.ts';
import { validateCsrfRequest } from '../../../../../lib/security/csrf.ts';
import {
  getClientIp,
  enforceRateLimitPolicies,
} from '../../../../../lib/security/rate-limit.ts';
import { CreditLedgerService } from '../../../../../lib/ledger/credit-ledger-service.ts';

export async function POST(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    const csrf = validateCsrfRequest(request, session.csrfToken);
    if (!csrf.valid) {
      return Response.json(
        { success: false, error: csrf.reason || 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    requirePlatformPermission(session, 'platform:credits:adjust:bounded');

    const rateBlocked = await enforceRateLimitPolicies(
      request,
      'admin:credits:adjust:actor',
      { userId: session.userId }
    );
    if (rateBlocked) return rateBlocked;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ success: false, error: 'Malformed JSON body' }, { status: 400 });
    }

    const targetEmail = typeof body?.targetEmail === 'string' ? body.targetEmail.trim() : '';
    const targetWorkspaceId =
      typeof body?.workspaceId === 'string' ? body.workspaceId.trim() : '';
    const amount = Number(body?.amount);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount === 0) {
      return Response.json(
        { success: false, error: 'Valid non-zero integer credit adjustment amount is required' },
        { status: 400 }
      );
    }

    if (reason.length < 3) {
      return Response.json(
        { success: false, error: 'Audit reason (min 3 chars) is mandatory for credit adjustments' },
        { status: 400 }
      );
    }

    if (!targetWorkspaceId && !targetEmail) {
      return Response.json(
        { success: false, error: 'Either workspaceId or targetEmail is required' },
        { status: 400 }
      );
    }

    const isFullAdmin = hasPlatformPermission(session.platformRole, 'platform:credits:adjust');
    if (!isFullAdmin) {
      if (amount < 0) {
        return Response.json(
          {
            success: false,
            error: 'FORBIDDEN: SUPPORT operators cannot deduct credits; ADMIN role required',
          },
          { status: 403 }
        );
      }
      if (amount > SUPPORT_CREDIT_ADJUSTMENT_MAX) {
        return Response.json(
          {
            success: false,
            error: `FORBIDDEN: SUPPORT credit grants are capped at ${SUPPORT_CREDIT_ADJUSTMENT_MAX} credits`,
          },
          { status: 403 }
        );
      }
    } else if (Math.abs(amount) > ADMIN_CREDIT_ADJUSTMENT_MAX) {
      return Response.json(
        {
          success: false,
          error: `Adjustment exceeds single-transaction cap (${ADMIN_CREDIT_ADJUSTMENT_MAX})`,
        },
        { status: 400 }
      );
    }

    const adminRepo = getAdminRepository();
    const targetWs = await adminRepo.findTargetWorkspace(targetWorkspaceId, targetEmail);
    if (!targetWs) {
      const err = targetWorkspaceId
        ? `Target workspace '${targetWorkspaceId}' not found`
        : `No workspace found for target email '${targetEmail}'`;
      return Response.json({ success: false, error: err }, { status: 404 });
    }
    const resolvedWorkspaceId = targetWs.workspaceId;

    const ledger = new CreditLedgerService();
    const auditLogId = `audit-${crypto.randomUUID()}`;
    const grant = await ledger.grantCredits({
      workspaceId: resolvedWorkspaceId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
      referenceId: auditLogId,
      idempotencyKey: `admin:adj:${auditLogId}`,
      description: `${session.platformRole} adjustment (${reason})`,
    });

    await adminRepo.recordAdminAdjustmentAudit({
      auditLogId,
      userId: session.userId,
      workspaceId: resolvedWorkspaceId,
      details: JSON.stringify({
        operatorRole: session.platformRole,
        targetEmail: targetEmail || null,
        workspaceId: resolvedWorkspaceId,
        amount,
        reason,
        ledgerEntryId: grant.id,
        balanceAfter: grant.balanceAfter,
      }),
      ipAddress: getClientIp(request),
    });

    return Response.json({
      success: true,
      workspaceId: resolvedWorkspaceId,
      newBalance: grant.balanceAfter,
      ledgerEntryId: grant.id,
      auditLogId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Admin credit adjustment failed';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : message.toLowerCase().includes('negative balance')
          ? 400
          : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
