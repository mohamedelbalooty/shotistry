import { z } from 'zod';
import {
  getWorkspacesForUser,
  resolveAuthenticatedSession,
} from '../../../lib/auth/session.ts';
import { CreditLedgerService } from '../../../lib/ledger/credit-ledger-service.ts';
import { validateCsrfRequest } from '../../../lib/security/csrf.ts';
import { requireVerifiedEmail } from '../../../lib/auth/email-verification-guard.ts';

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  country: z.enum(['EG', 'SA']).optional().default('EG'),
});

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    const workspaces = await getWorkspacesForUser(session.userId);
    return Response.json({
      success: true,
      activeWorkspaceId: session.activeWorkspaceId,
      workspaces,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch workspaces';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}

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

    const unverified = requireVerifiedEmail(session);
    if (unverified) return unverified;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ success: false, error: 'Malformed JSON body' }, { status: 400 });
    }

    const parsed = createWorkspaceSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid workspace details' },
        { status: 400 }
      );
    }

    const ledger = new CreditLedgerService();
    const workspace = await ledger.createAdditionalWorkspaceForUser({
      userId: session.userId,
      workspaceName: parsed.data.name,
      country: parsed.data.country,
    });

    return Response.json({ success: true, workspace }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create workspace';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
