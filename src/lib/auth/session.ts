import { getDb } from '../db/prisma.ts';
import {
  CreditLedgerService,
  type WorkspaceBalanceSummary,
} from '../ledger/credit-ledger-service.ts';

export interface ResolvedSession {
  userId: string;
  workspaceId: string;
  role: 'USER' | 'ADMIN' | 'SUPPORT';
  country: 'EG' | 'SA';
  workspace: WorkspaceBalanceSummary;
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k && v.length > 0) {
      result[k.trim()] = decodeURIComponent(v.join('='));
    }
  }
  return result;
}

/**
 * Resolves the authenticated user and active workspace from request headers or cookies,
 * provisioning the workspace in SQL persistence if it does not yet exist, and verifying
 * workspace membership/ownership.
 */
export async function resolveWorkspaceSession(
  request: Request,
  bodyWorkspaceId?: string
): Promise<ResolvedSession> {
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const userId =
    request.headers.get('x-user-id')?.trim() ||
    cookies['shotistry_user_id'] ||
    'user-default-merchant';

  const workspaceId =
    request.headers.get('x-workspace-id')?.trim() ||
    bodyWorkspaceId?.trim() ||
    cookies['shotistry_workspace_id'] ||
    'ws-default-studio';

  const roleHeader = (request.headers.get('x-user-role') || cookies['shotistry_role'] || 'USER')
    .trim()
    .toUpperCase();
  const role: 'USER' | 'ADMIN' | 'SUPPORT' =
    roleHeader === 'ADMIN' || roleHeader === 'SUPPORT' ? roleHeader : 'USER';

  const countryHeader = (
    request.headers.get('x-country') ||
    cookies['shotistry_country'] ||
    'EG'
  )
    .trim()
    .toUpperCase();
  const country: 'EG' | 'SA' = countryHeader === 'SA' ? 'SA' : 'EG';

  const db = getDb();
  const existingWorkspace = db
    .prepare(`SELECT "id", "ownerId" FROM "Workspace" WHERE "id" = ?`)
    .get(workspaceId) as { id: string; ownerId: string } | undefined;

  if (existingWorkspace && existingWorkspace.ownerId !== userId && role !== 'ADMIN') {
    const member = db
      .prepare(
        `SELECT "id" FROM "WorkspaceMember" WHERE "workspaceId" = ? AND "userId" = ?`
      )
      .get(workspaceId, userId) as { id: string } | undefined;

    if (!member) {
      throw new Error(`FORBIDDEN: User ${userId} does not have access to workspace ${workspaceId}`);
    }
  }

  const ledger = new CreditLedgerService();
  const workspace = await ledger.ensureWorkspace({
    userId,
    workspaceId,
    role,
    country,
    currency: country === 'SA' ? 'SAR' : 'EGP',
  });

  return {
    userId,
    workspaceId,
    role,
    country,
    workspace,
  };
}
