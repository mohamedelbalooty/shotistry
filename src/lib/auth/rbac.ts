import type { AuthenticatedSessionContext } from './session.ts';
import type { WorkspaceBalanceSummary } from '../ledger/credit-ledger-service.ts';
import type { PlatformRole, WorkspaceRole } from '../types/index.ts';

export type PlatformPermission =
  | 'platform:metrics:read'
  | 'platform:audit:read'
  | 'platform:credits:adjust'
  | 'platform:credits:adjust:bounded'
  | 'platform:users:manage';

export type WorkspacePermission =
  | 'workspace:read'
  | 'workspace:switch'
  | 'workspace:create'
  | 'workspace:members:read'
  | 'workspace:members:manage'
  | 'brand:manage'
  | 'product:manage'
  | 'asset:upload'
  | 'photoshoot:generate'
  | 'job:read'
  | 'billing:checkout';

const PLATFORM_PERMISSION_MATRIX: Record<PlatformRole, ReadonlySet<PlatformPermission>> = {
  USER: new Set<PlatformPermission>(),
  SUPPORT: new Set<PlatformPermission>([
    'platform:metrics:read',
    'platform:audit:read',
    'platform:credits:adjust:bounded',
  ]),
  ADMIN: new Set<PlatformPermission>([
    'platform:metrics:read',
    'platform:audit:read',
    'platform:credits:adjust',
    'platform:credits:adjust:bounded',
    'platform:users:manage',
  ]),
};

const WORKSPACE_PERMISSION_MATRIX: Record<WorkspaceRole, ReadonlySet<WorkspacePermission>> = {
  OWNER: new Set<WorkspacePermission>([
    'workspace:read',
    'workspace:switch',
    'workspace:create',
    'workspace:members:read',
    'workspace:members:manage',
    'brand:manage',
    'product:manage',
    'asset:upload',
    'photoshoot:generate',
    'job:read',
    'billing:checkout',
  ]),
  ADMIN: new Set<WorkspacePermission>([
    'workspace:read',
    'workspace:switch',
    'workspace:create',
    'workspace:members:read',
    'workspace:members:manage',
    'brand:manage',
    'product:manage',
    'asset:upload',
    'photoshoot:generate',
    'job:read',
  ]),
  MEMBER: new Set<WorkspacePermission>([
    'workspace:read',
    'workspace:switch',
    'workspace:create',
    'brand:manage',
    'product:manage',
    'asset:upload',
    'photoshoot:generate',
    'job:read',
  ]),
  VIEWER: new Set<WorkspacePermission>([
    'workspace:read',
    'workspace:switch',
    'workspace:create',
    'job:read',
  ]),
};

export const SUPPORT_CREDIT_ADJUSTMENT_MAX = 200;
export const ADMIN_CREDIT_ADJUSTMENT_MAX = 10000;

export function hasPlatformPermission(
  role: PlatformRole,
  permission: PlatformPermission
): boolean {
  return PLATFORM_PERMISSION_MATRIX[role]?.has(permission) ?? false;
}

export function hasWorkspacePermission(
  role: WorkspaceRole,
  permission: WorkspacePermission
): boolean {
  return WORKSPACE_PERMISSION_MATRIX[role]?.has(permission) ?? false;
}

export function requirePlatformPermission(
  session: AuthenticatedSessionContext,
  permission: PlatformPermission
): void {
  if (!hasPlatformPermission(session.platformRole, permission)) {
    throw new Error(
      `FORBIDDEN: Platform permission '${permission}' required for role '${session.platformRole}'`
    );
  }
}

export function requireWorkspacePermission(
  session: AuthenticatedSessionContext,
  permission: WorkspacePermission
): WorkspaceBalanceSummary {
  if (!session.activeWorkspaceId || !session.activeWorkspace || !session.workspaceRole) {
    throw new Error('FORBIDDEN: Active workspace membership is required');
  }
  if (!hasWorkspacePermission(session.workspaceRole, permission)) {
    throw new Error(
      `FORBIDDEN: Workspace permission '${permission}' denied for role '${session.workspaceRole}'`
    );
  }
  return session.activeWorkspace;
}

export function canManageWorkspaceMemberRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole
): boolean {
  if (actorRole === 'OWNER') {
    return targetRole === 'ADMIN' || targetRole === 'MEMBER' || targetRole === 'VIEWER';
  }
  if (actorRole === 'ADMIN') {
    return targetRole === 'MEMBER' || targetRole === 'VIEWER';
  }
  return false;
}
