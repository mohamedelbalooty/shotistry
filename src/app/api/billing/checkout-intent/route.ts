import crypto from 'node:crypto';
import { SUBSCRIPTION_PLANS, TOP_UP_PACKS } from '../../../../lib/pricing/plans.ts';
import { PaymobSecurity } from '../../../../lib/paymob/paymob-hmac.ts';
import { resolveAuthenticatedSession } from '../../../../lib/auth/session.ts';
import { requireWorkspacePermission } from '../../../../lib/auth/rbac.ts';
import { validateCsrfRequest } from '../../../../lib/security/csrf.ts';
import { enforceRateLimitPolicies } from '../../../../lib/security/rate-limit.ts';
import { requireVerifiedEmail } from '../../../../lib/auth/email-verification-guard.ts';
import { getBillingRepository } from '../../../../lib/db/repositories/billing-repository.ts';
import { isMockFallbackAllowed } from '../../../../lib/config/env.ts';
import { POST as paymobWebhookPost } from '../../webhooks/paymob/route.ts';
import type { PlanTier } from '../../../../lib/types/index.ts';

export async function POST(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request, { requireWorkspace: true });
    const csrf = validateCsrfRequest(request, session.csrfToken);
    if (!csrf.valid) {
      return Response.json(
        { success: false, error: csrf.reason || 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const workspace = requireWorkspacePermission(session, 'billing:checkout');

    const unverified = requireVerifiedEmail(session);
    if (unverified) return unverified;

    const rateBlocked = await enforceRateLimitPolicies(
      request,
      'billing:checkout_intent:ws',
      { workspaceId: workspace.workspaceId }
    );
    if (rateBlocked) return rateBlocked;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ success: false, error: 'Malformed JSON body' }, { status: 400 });
    }

    const requestedWorkspaceId =
      typeof body.workspaceId === 'string' ? body.workspaceId.trim() : undefined;
    if (requestedWorkspaceId && requestedWorkspaceId !== workspace.workspaceId) {
      return Response.json(
        {
          success: false,
          error: 'FORBIDDEN: Requested workspaceId does not match active authenticated workspace',
        },
        { status: 403 }
      );
    }

    if (body?.sandboxSimulateWebhook === true) {
      if (!isMockFallbackAllowed() || process.env.NODE_ENV === 'production') {
        return Response.json(
          {
            success: false,
            error:
              'FORBIDDEN: Sandbox webhook simulation is disabled in staging and production environments',
          },
          { status: 403 }
        );
      }
    }

    const kind = body?.kind === 'TOP_UP' ? 'TOP_UP' : 'SUBSCRIPTION';
    const currency =
      body?.currency === 'SAR' || (body?.currency !== 'EGP' && session.country === 'SA')
        ? 'SAR'
        : 'EGP';
    const paymentMethod = String(body?.paymentMethod || 'card');

    let amountMajor = 0;
    let credits = 0;
    let planTier: PlanTier | undefined;
    let packId: string | undefined;

    if (kind === 'SUBSCRIPTION') {
      const tier = String(body?.planTier || 'STARTER').toUpperCase() as PlanTier;
      const plan = SUBSCRIPTION_PLANS[tier];
      if (!plan || tier === 'FREE') {
        return Response.json(
          { success: false, error: 'Invalid paid subscription plan tier' },
          { status: 400 }
        );
      }
      planTier = tier;
      amountMajor = currency === 'SAR' ? plan.priceSAR : plan.priceEGP;
      credits = plan.monthlyCredits;
    } else {
      const pack = TOP_UP_PACKS.find((p) => p.id === body?.packId);
      if (!pack) {
        return Response.json(
          { success: false, error: 'Invalid top-up pack ID' },
          { status: 400 }
        );
      }
      packId = pack.id;
      amountMajor = currency === 'SAR' ? pack.priceSAR : pack.priceEGP;
      credits = pack.credits;
    }

    const amountCents = PaymobSecurity.toSubunits(amountMajor);
    const transactionId = `pt-${crypto.randomUUID()}`;
    const paymobOrderId = `ord-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const now = new Date().toISOString();

    const billingRepo = getBillingRepository();
    await billingRepo.createPendingPaymentTransaction({
      id: transactionId,
      workspaceId: workspace.workspaceId,
      amountCents,
      currency,
      paymobOrderId,
      paymentMethod,
      createdAt: now,
    });

    // Optional Sandbox Webhook Simulation (ONLY in non-production environments)
    let sandboxWebhookResult: Record<string, unknown> | null = null;
    if (body?.sandboxSimulateWebhook === true && process.env.NODE_ENV !== 'production') {
      const sandboxSecret =
        process.env.PAYMOB_HMAC_SECRET &&
        !process.env.PAYMOB_HMAC_SECRET.includes('placeholder')
          ? process.env.PAYMOB_HMAC_SECRET
          : 'sandbox_local_paymob_hmac_secret_sha512';

      const prevSecret = process.env.PAYMOB_HMAC_SECRET;
      process.env.PAYMOB_HMAC_SECRET = sandboxSecret;

      try {
        const simulatedTxn = {
          amount_cents: amountCents,
          created_at: now,
          currency,
          error_occured: false,
          has_parent_transaction: false,
          id: Math.floor(100000000 + Math.random() * 900000000),
          integration_id: 441122,
          is_3d_secure: true,
          is_auth: false,
          is_capture: false,
          is_refunded: false,
          is_standalone_payment: true,
          is_voided: false,
          order: { id: paymobOrderId },
          owner: 112233,
          pending: false,
          source_data: {
            pan: '4242',
            sub_type: paymentMethod,
            type: 'card',
          },
          success: true,
          workspace_id: workspace.workspaceId,
          credits,
          plan_tier: planTier,
        };

        const hmac = PaymobSecurity.calculateTransactionHmac(simulatedTxn, sandboxSecret);
        const webhookReq = new Request('http://localhost:3000/api/webhooks/paymob', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'paymob-hmac': hmac,
          },
          body: JSON.stringify(simulatedTxn),
        });
        const webhookRes = await paymobWebhookPost(webhookReq);
        sandboxWebhookResult = (await webhookRes.json()) as Record<string, unknown>;
      } finally {
        if (prevSecret === undefined) {
          delete process.env.PAYMOB_HMAC_SECRET;
        } else {
          process.env.PAYMOB_HMAC_SECRET = prevSecret;
        }
      }
    }

    return Response.json({
      success: true,
      intent: {
        transactionId,
        paymobOrderId,
        workspaceId: workspace.workspaceId,
        kind,
        planTier: planTier ?? null,
        packId: packId ?? null,
        amountCents,
        currency,
        credits,
        status: sandboxWebhookResult?.creditsGranted ? 'SUCCEEDED_SANDBOX' : 'PENDING',
        sandboxWebhookResult,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Checkout intent creation failed';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
