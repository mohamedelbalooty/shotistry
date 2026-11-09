import crypto from 'node:crypto';
import { PaymobSecurity } from '../../../../lib/paymob/paymob-hmac.ts';
import { SUBSCRIPTION_PLANS, TOP_UP_PACKS } from '../../../../lib/pricing/plans.ts';
import { CreditLedgerService } from '../../../../lib/ledger/credit-ledger-service.ts';
import { getWebhookRepository } from '../../../../lib/db/repositories/webhook-repository.ts';
import { getPaymobConfig } from '../../../../lib/paymob/paymob-config.ts';
import type { PlanTier } from '../../../../lib/types/index.ts';

function getConfiguredPaymobSecret(currency?: string): string | null {
  const isSar = String(currency || '').toUpperCase() === 'SAR';
  const regionalSecret = getPaymobConfig(isSar ? 'SA' : 'EG').hmacSecret;
  if (regionalSecret) return regionalSecret;

  const secret = process.env.PAYMOB_HMAC_SECRET?.trim();
  if (
    !secret ||
    secret.length < 8 ||
    secret.includes('placeholder') ||
    secret.includes('your_paymob')
  ) {
    return null;
  }
  return secret;
}

function inferCreditsFromTransaction(txnObj: Record<string, unknown>): {
  credits: number;
  planTier?: PlanTier;
} {
  const isStrict =
    process.env.SHOTISTRY_STRICT_PAYMENT_INTENT === '1' ||
    process.env.SHOTISTRY_DEPLOY_ENV === 'staging' ||
    process.env.NODE_ENV === 'production';

  if (!isStrict && typeof txnObj.credits === 'number' && txnObj.credits > 0) {
    return {
      credits: txnObj.credits,
      planTier: txnObj.plan_tier as PlanTier | undefined,
    };
  }

  const amountCents = Number(txnObj.amount_cents || 0);
  const currency = String(txnObj.currency || 'EGP').toUpperCase();
  const majorAmount = Math.round(amountCents / 100);

  for (const pack of TOP_UP_PACKS) {
    const packPrice = currency === 'SAR' ? pack.priceSAR : pack.priceEGP;
    if (packPrice === majorAmount) {
      return { credits: pack.credits };
    }
  }

  for (const tier of Object.keys(SUBSCRIPTION_PLANS) as PlanTier[]) {
    if (tier === 'FREE') continue;
    const plan = SUBSCRIPTION_PLANS[tier];
    const planPrice = currency === 'SAR' ? plan.priceSAR : plan.priceEGP;
    if (planPrice === majorAmount) {
      return { credits: plan.monthlyCredits, planTier: tier };
    }
  }

  return { credits: 0 };
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let body: Record<string, any>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const payloadCurrency =
      body?.subscription_data?.currency ||
      body?.obj?.currency ||
      body?.currency ||
      'EGP';

    // 1. Fail-closed check: HMAC secret must be configured for target currency
    const secretKey = getConfiguredPaymobSecret(payloadCurrency);
    if (!secretKey) {
      return Response.json(
        {
          error:
            'PAYMOB_HMAC_SECRET is not configured. Webhook endpoint fails closed until secret is provisioned.',
        },
        { status: 503 }
      );
    }

    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const ledger = new CreditLedgerService();
    const webhookRepo = getWebhookRepository();

    // Case 1: Subscription / Recurring Lifecycle Webhook
    if (body?.trigger_type && body?.subscription_data?.id !== undefined) {
      const isVerified = PaymobSecurity.verifySubscriptionWebhook(
        {
          trigger_type: String(body.trigger_type),
          subscription_data: { id: body.subscription_data.id },
          hmac: String(body.hmac || request.headers.get('paymob-hmac') || ''),
        },
        secretKey
      );

      // Fail closed in ALL environments (never bypass HMAC check)
      if (!isVerified) {
        return Response.json({ error: 'Invalid HMAC signature' }, { status: 401 });
      }

      const triggerType = String(body.trigger_type);
      const subData = body.subscription_data as Record<string, any>;
      const paymobSubId = String(subData.id);
      const eventId = String(
        body.event_id ||
          `sub:${triggerType}:${paymobSubId}:${subData.billing_cycle || subData.updated_at || '1'}`
      );

      let workspaceId = String(
        subData.workspace_id || subData.client_info?.workspace_id || ''
      ).trim();

      if (!workspaceId) {
        const found = await webhookRepo.findSubscriptionWorkspace(paymobSubId);
        workspaceId = found ?? '';
      }

      if (!workspaceId) {
        return Response.json(
          { error: 'Missing workspace_id in verified Paymob subscription webhook' },
          { status: 400 }
        );
      }

      const exists = await webhookRepo.workspaceExists(workspaceId);
      if (!exists) {
        return Response.json(
          { error: `Workspace '${workspaceId}' does not exist` },
          { status: 404 }
        );
      }

      const rawTier = String(subData.plan_tier || 'STARTER').toUpperCase();
      const planTier: PlanTier =
        rawTier === 'PRO' || rawTier === 'AGENCY' || rawTier === 'STARTER'
          ? (rawTier as PlanTier)
          : 'STARTER';
      const currency = String(subData.currency || 'EGP').toUpperCase() === 'SAR' ? 'SAR' : 'EGP';

      const outcome = await webhookRepo.processSubscriptionEvent({
        eventId,
        payloadHash,
        rawBody,
        triggerType,
        subData,
        paymobSubId,
        workspaceId,
        planTier,
        currency,
      });

      if (outcome.duplicate) {
        return Response.json({
          received: true,
          type: 'SUBSCRIPTION',
          duplicate: true,
          creditsGranted: 0,
          eventId,
        });
      }

      let creditsGranted = 0;
      if (outcome.shouldGrant && outcome.monthlyCredits) {
        const grant = await ledger.grantCredits({
          workspaceId,
          amount: outcome.monthlyCredits,
          type: 'SUBSCRIPTION_GRANT',
          referenceId: paymobSubId,
          idempotencyKey: `paymob:sub:${eventId}`,
          description: `Paymob Subscription (${planTier}) — ${triggerType}`,
        });
        if (!grant.duplicate) {
          creditsGranted = outcome.monthlyCredits;
        }
      }

      return Response.json({
        received: true,
        type: 'SUBSCRIPTION',
        duplicate: false,
        event: triggerType,
        subscriptionId: paymobSubId,
        subscriptionStatus: outcome.subscriptionStatus,
        creditsGranted,
      });
    }

    // Case 2: Standard Transaction Webhook (One-off credit top-ups or checkout)
    const url = new URL(request.url);
    const receivedHmac =
      request.headers.get('paymob-hmac') ||
      url.searchParams.get('hmac') ||
      (typeof body?.hmac === 'string' ? body.hmac : '');

    const txnObj: Record<string, any> | null =
      body?.obj && typeof body.obj === 'object'
        ? body.obj
        : body?.id !== undefined && body?.amount_cents !== undefined
          ? body
          : null;

    if (!receivedHmac || !txnObj) {
      return Response.json(
        { error: 'Missing HMAC signature or unrecognized webhook payload' },
        { status: 401 }
      );
    }

    const isVerified = PaymobSecurity.verifyTransactionWebhook(
      receivedHmac,
      txnObj,
      secretKey
    );

    if (!isVerified) {
      return Response.json({ error: 'Invalid HMAC signature' }, { status: 401 });
    }

    const paymobTxnId = String(txnObj.id);
    const paymobOrderId = txnObj.order?.id ? String(txnObj.order.id) : null;
    const specialReference =
      txnObj.special_reference ||
      txnObj.merchant_order_id ||
      txnObj.order?.shipping_data?.extra_description ||
      null;
    const eventId = String(body.event_id || `txn:${paymobTxnId}`);

    let workspaceId = String(
      txnObj.workspace_id || txnObj.order?.shipping_data?.extra_description || ''
    ).trim();

    if (!workspaceId && paymobOrderId) {
      const found = await webhookRepo.findTransactionWorkspace(paymobOrderId);
      workspaceId = found ?? '';
    }

    const currency = String(txnObj.currency || 'EGP').toUpperCase() === 'SAR' ? 'SAR' : 'EGP';
    const amountCents = Number(txnObj.amount_cents || 0);
    const isRefunded = txnObj.is_refunded === true;
    const isVoided = txnObj.is_voided === true;
    const isSuccess =
      txnObj.success === true && !isVoided && !isRefunded && !txnObj.error_occured;

    const txnState = await webhookRepo.processTransactionEvent({
      eventId,
      payloadHash,
      rawBody,
      paymobTxnId,
      paymobOrderId,
      specialReference,
      workspaceId,
      currency,
      amountCents,
      paymentMethod: txnObj.source_data?.sub_type || txnObj.source_data?.type || 'card',
      isSuccess,
      isRefunded,
      isVoided,
    });

    if (txnState.duplicate) {
      return Response.json({
        received: true,
        type: 'TRANSACTION',
        duplicate: true,
        creditsGranted: 0,
        transactionStatus: txnState.transactionStatus,
      });
    }

    // Handle Unmatched Intent
    if (txnState.transactionStatus === 'UNMATCHED_INTENT') {
      return Response.json({
        received: true,
        type: 'TRANSACTION',
        error: 'Unmatched intent: no stored checkout transaction matches reference',
        transactionStatus: 'UNMATCHED_INTENT',
        creditsGranted: 0,
      });
    }

    // Handle Amount/Currency Mismatch
    if (txnState.transactionStatus === 'UNMATCHED_AMOUNT') {
      return Response.json({
        received: true,
        type: 'TRANSACTION',
        error: txnState.errorMessage || 'Unmatched amount or currency with stored intent',
        transactionStatus: 'UNMATCHED_AMOUNT',
        creditsGranted: 0,
      });
    }

    // Handle Refund / Void Reversal
    if (isRefunded || isVoided || txnState.transactionStatus === 'REFUNDED' || txnState.transactionStatus === 'VOIDED') {
      const creditsToReverse =
        txnState.storedIntent?.credits || inferCreditsFromTransaction(txnObj).credits;
      const targetWorkspace = txnState.storedIntent?.workspaceId || workspaceId;

      if (creditsToReverse > 0 && targetWorkspace) {
        await ledger.grantCredits({
          workspaceId: targetWorkspace,
          amount: -creditsToReverse,
          type: 'REFUND_REVERSAL',
          referenceId: paymobTxnId,
          idempotencyKey: `paymob:refund:${paymobTxnId}`,
          description: `Paymob Refund Reversal (-${creditsToReverse} credits)`,
        });
      }

      return Response.json({
        received: true,
        type: 'TRANSACTION',
        refunded: true,
        transactionStatus: txnState.transactionStatus,
        creditsReversed: creditsToReverse,
      });
    }

    let creditsGranted = 0;
    if (isSuccess) {
      let credits = 0;
      let targetPlanTier: PlanTier | undefined;
      let targetWorkspace = workspaceId;

      if (txnState.storedIntent) {
        // Zero-trust: derived strictly from stored database intent
        credits = txnState.storedIntent.credits;
        targetPlanTier = txnState.storedIntent.planTier ?? undefined;
        targetWorkspace = txnState.storedIntent.workspaceId;
      } else {
        const inferred = inferCreditsFromTransaction(txnObj);
        credits = inferred.credits;
        targetPlanTier = inferred.planTier;
      }

      if (credits > 0 && targetWorkspace) {
        const grant = await ledger.grantCredits({
          workspaceId: targetWorkspace,
          amount: credits,
          type: targetPlanTier ? 'SUBSCRIPTION_GRANT' : 'TOP_UP_PURCHASE',
          referenceId: paymobTxnId,
          idempotencyKey: `paymob:txn:${paymobTxnId}`,
          description: targetPlanTier
            ? `Paymob Plan Purchase (${targetPlanTier})`
            : `Paymob Credit Top-Up (+${credits} credits)`,
        });
        if (!grant.duplicate) {
          creditsGranted = credits;
        }

        if (targetPlanTier) {
          await webhookRepo.updateSubscriptionPlan(targetWorkspace, targetPlanTier, credits);
        }
      }
    }

    return Response.json({
      received: true,
      type: 'TRANSACTION',
      duplicate: false,
      success: isSuccess,
      transactionStatus: txnState.transactionStatus,
      creditsGranted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
