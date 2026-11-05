import crypto from 'node:crypto';
import { getDb, withSerializableTransaction } from '../../../../../lib/db/prisma.ts';
import { CreditLedgerService } from '../../../../../lib/ledger/credit-ledger-service.ts';

export async function POST(request: Request) {
  try {
    const roleHeader = (request.headers.get('x-user-role') || 'ADMIN').trim().toUpperCase();
    if (roleHeader !== 'ADMIN' && roleHeader !== 'SUPPORT') {
      return Response.json(
        { success: false, error: 'FORBIDDEN: Admin role required for credit adjustments' },
        { status: 403 }
      );
    }

    const adminUserId = request.headers.get('x-user-id')?.trim() || 'admin-system';
    const body = await request.json();
    const targetEmail = String(body?.targetEmail || '').trim();
    const targetWorkspaceId = String(body?.workspaceId || '').trim();
    const amount = Number(body?.amount);
    const reason = String(body?.reason || '').trim();

    if (!Number.isFinite(amount) || amount === 0) {
      return Response.json(
        { success: false, error: 'Valid non-zero credit adjustment amount is required' },
        { status: 400 }
      );
    }

    if (!reason) {
      return Response.json(
        { success: false, error: 'Audit reason is mandatory for credit adjustments' },
        { status: 400 }
      );
    }

    const db = getDb();
    const ledger = new CreditLedgerService();

    // Ensure admin user record exists for foreign key on AdminAuditLog
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO "User" ("id", "email", "name", "role", "country", "locale", "createdAt", "updatedAt")
       VALUES (?, ?, 'System Administrator', 'ADMIN', 'SA', 'ar', ?, ?)`
    ).run(adminUserId, `${adminUserId}@admin.shotistry.app`, now, now);

    // Resolve target workspace by email or workspaceId
    let resolvedWorkspaceId = targetWorkspaceId;
    if (!resolvedWorkspaceId && targetEmail) {
      const foundWs = db
        .prepare(
          `SELECT w."id"
           FROM "Workspace" w
           JOIN "User" u ON u."id" = w."ownerId"
           WHERE LOWER(u."email") = LOWER(?)
           LIMIT 1`
        )
        .get(targetEmail) as { id: string } | undefined;

      if (foundWs) {
        resolvedWorkspaceId = foundWs.id;
      } else {
        // Provision target merchant workspace if not yet created
        const slug = targetEmail.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '-');
        const provisioned = await ledger.ensureWorkspace({
          userId: `user-${slug}`,
          email: targetEmail,
          workspaceId: `ws-${slug}`,
        });
        resolvedWorkspaceId = provisioned.workspaceId;
      }
    }

    if (!resolvedWorkspaceId) {
      resolvedWorkspaceId = 'ws-default-studio';
      await ledger.ensureWorkspace({ workspaceId: resolvedWorkspaceId });
    }

    const auditLogId = `audit-${crypto.randomUUID()}`;
    const grant = await ledger.grantCredits({
      workspaceId: resolvedWorkspaceId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
      referenceId: auditLogId,
      idempotencyKey: `admin:adj:${auditLogId}`,
      description: `Admin adjustment (${reason})`,
    });

    await withSerializableTransaction((txDb) => {
      txDb
        .prepare(
          `INSERT INTO "AdminAuditLog" ("id", "userId", "action", "targetId", "details", "ipAddress", "createdAt")
           VALUES (?, ?, 'CREDIT_ADJUSTMENT', ?, ?, ?, ?)`
        )
        .run(
          auditLogId,
          adminUserId,
          resolvedWorkspaceId,
          JSON.stringify({
            targetEmail,
            workspaceId: resolvedWorkspaceId,
            amount,
            reason,
            ledgerEntryId: grant.id,
            balanceAfter: grant.balanceAfter,
          }),
          request.headers.get('x-forwarded-for') || '127.0.0.1',
          now
        );
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
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

