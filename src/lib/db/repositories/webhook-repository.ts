import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { prisma, getDb, withSerializableTransaction } from '../prisma.ts';
import { resolveDbDriver } from '../driver.ts';
import { SUBSCRIPTION_PLANS } from '../../pricing/plans.ts';
import type { PlanTier } from '../../types/index.ts';

export interface ProcessSubscriptionEventInput {
  eventId: string;
  payloadHash: string;
  rawBody: string;
  triggerType: string;
  subData: Record<string, any>;
  paymobSubId: string;
  workspaceId: string;
  planTier: PlanTier;
  currency: 'EGP' | 'SAR';
}

export interface ProcessSubscriptionEventOutcome {
  duplicate: boolean;
  shouldGrant: boolean;
  monthlyCredits: number;
  subscriptionStatus: string;
}

export interface ProcessTransactionEventInput {
  eventId: string;
  payloadHash: string;
  rawBody: string;
  paymobTxnId: string;
  paymobOrderId: string | null;
  workspaceId: string;
  currency: 'EGP' | 'SAR';
  amountCents: number;
  paymentMethod: string;
  isSuccess: boolean;
}

export interface ProcessTransactionEventOutcome {
  duplicate: boolean;
  transactionStatus: string;
}

export interface WebhookRepository {
  workspaceExists(workspaceId: string): Promise<boolean>;
  findSubscriptionWorkspace(paymobSubId: string): Promise<string | null>;
  findTransactionWorkspace(paymobOrderId: string): Promise<string | null>;
  processSubscriptionEvent(
    input: ProcessSubscriptionEventInput
  ): Promise<ProcessSubscriptionEventOutcome>;
  processTransactionEvent(
    input: ProcessTransactionEventInput
  ): Promise<ProcessTransactionEventOutcome>;
  updateSubscriptionPlan(
    workspaceId: string,
    planTier: PlanTier,
    monthlyCredits: number
  ): Promise<void>;
}

export class SqliteWebhookRepository implements WebhookRepository {
  private getDb(): DatabaseSync {
    return getDb();
  }

  async workspaceExists(workspaceId: string): Promise<boolean> {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT "id" FROM "Workspace" WHERE "id" = ?`)
      .get(workspaceId) as { id: string } | undefined;
    return Boolean(row);
  }

  async findSubscriptionWorkspace(paymobSubId: string): Promise<string | null> {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT "workspaceId" FROM "Subscription" WHERE "paymobSubscriptionId" = ?`)
      .get(paymobSubId) as { workspaceId: string } | undefined;
    return row?.workspaceId ?? null;
  }

  async findTransactionWorkspace(paymobOrderId: string): Promise<string | null> {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT "workspaceId" FROM "PaymentTransaction" WHERE "paymobOrderId" = ?`)
      .get(paymobOrderId) as { workspaceId: string } | undefined;
    return row?.workspaceId ?? null;
  }

  async processSubscriptionEvent(
    input: ProcessSubscriptionEventInput
  ): Promise<ProcessSubscriptionEventOutcome> {
    return withSerializableTransaction((db) => {
      const existingEvent = db
        .prepare(`SELECT "id", "processed" FROM "WebhookEvent" WHERE "eventId" = ?`)
        .get(input.eventId) as { id: string; processed: number } | undefined;

      if (existingEvent && existingEvent.processed === 1) {
        return {
          duplicate: true,
          shouldGrant: false,
          monthlyCredits: 0,
          subscriptionStatus: 'UNCHANGED',
        };
      }

      const now = new Date().toISOString();
      if (!existingEvent) {
        db.prepare(
          `INSERT INTO "WebhookEvent" (
             "id", "source", "eventId", "payloadHash", "payload", "processed", "processedAt", "createdAt"
           ) VALUES (?, 'PAYMOB', ?, ?, ?, 1, ?, ?)`
        ).run(
          `wh-${crypto.randomUUID()}`,
          input.eventId,
          input.payloadHash,
          input.rawBody,
          now,
          now
        );
      } else {
        db.prepare(
          `UPDATE "WebhookEvent" SET "processed" = 1, "processedAt" = ? WHERE "id" = ?`
        ).run(now, existingEvent.id);
      }

      const triggerLower = input.triggerType.toLowerCase();
      const isGrantTrigger =
        triggerLower.includes('created') ||
        triggerLower.includes('renew') ||
        triggerLower.includes('payment_success') ||
        triggerLower.includes('activated');

      const isPastDueTrigger =
        triggerLower.includes('fail') || triggerLower.includes('past_due');
      const isSuspendedTrigger = triggerLower.includes('suspend');
      const isCanceledTrigger = triggerLower.includes('cancel');

      let newStatus = 'ACTIVE';
      if (isPastDueTrigger) newStatus = 'PAST_DUE';
      else if (isSuspendedTrigger) newStatus = 'SUSPENDED';
      else if (isCanceledTrigger) newStatus = 'CANCELED';

      const planConfig = SUBSCRIPTION_PLANS[input.planTier];
      const monthlyCredits = Number(
        input.subData.credits || planConfig.monthlyCredits || 80
      );
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(
        `UPDATE "Subscription"
         SET "planTier" = ?,
             "status" = ?,
             "currency" = ?,
             "monthlyCredits" = ?,
             "paymobSubscriptionId" = ?,
             "currentPeriodStart" = ?,
             "currentPeriodEnd" = ?,
             "cancelAtPeriodEnd" = ?,
             "updatedAt" = ?
         WHERE "workspaceId" = ?`
      ).run(
        input.planTier,
        newStatus,
        input.currency,
        monthlyCredits,
        input.paymobSubId,
        now,
        periodEnd,
        isCanceledTrigger ? 1 : 0,
        now,
        input.workspaceId
      );

      return {
        duplicate: false,
        shouldGrant: isGrantTrigger,
        monthlyCredits,
        subscriptionStatus: newStatus,
      };
    });
  }

  async processTransactionEvent(
    input: ProcessTransactionEventInput
  ): Promise<ProcessTransactionEventOutcome> {
    return withSerializableTransaction((db) => {
      const existingEvent = db
        .prepare(`SELECT "id", "processed" FROM "WebhookEvent" WHERE "eventId" = ?`)
        .get(input.eventId) as { id: string; processed: number } | undefined;

      const status = input.isSuccess ? 'SUCCEEDED' : 'FAILED';
      if (existingEvent && existingEvent.processed === 1) {
        return { duplicate: true, transactionStatus: status };
      }

      const now = new Date().toISOString();
      if (!existingEvent) {
        db.prepare(
          `INSERT INTO "WebhookEvent" (
             "id", "source", "eventId", "payloadHash", "payload", "processed", "processedAt", "createdAt"
           ) VALUES (?, 'PAYMOB', ?, ?, ?, 1, ?, ?)`
        ).run(
          `wh-${crypto.randomUUID()}`,
          input.eventId,
          input.payloadHash,
          input.rawBody,
          now,
          now
        );
      } else {
        db.prepare(
          `UPDATE "WebhookEvent" SET "processed" = 1, "processedAt" = ? WHERE "id" = ?`
        ).run(now, existingEvent.id);
      }

      const existingTxn = input.paymobOrderId
        ? (db
            .prepare(`SELECT "id" FROM "PaymentTransaction" WHERE "paymobOrderId" = ?`)
            .get(input.paymobOrderId) as { id: string } | undefined)
        : undefined;

      if (existingTxn) {
        db.prepare(
          `UPDATE "PaymentTransaction"
           SET "paymobTxnId" = ?, "status" = ?, "errorMessage" = ?
           WHERE "id" = ?`
        ).run(
          input.paymobTxnId,
          status,
          input.isSuccess ? null : 'Transaction reported success=false',
          existingTxn.id
        );
      } else {
        db.prepare(
          `INSERT OR IGNORE INTO "PaymentTransaction" (
             "id", "workspaceId", "amountCents", "currency", "paymobOrderId",
             "paymobTxnId", "paymentMethod", "status", "errorMessage", "createdAt"
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `pt-${crypto.randomUUID()}`,
          input.workspaceId,
          input.amountCents,
          input.currency,
          input.paymobOrderId,
          input.paymobTxnId,
          input.paymentMethod,
          status,
          input.isSuccess ? null : 'Transaction reported success=false',
          now
        );
      }

      return { duplicate: false, transactionStatus: status };
    });
  }

  async updateSubscriptionPlan(
    workspaceId: string,
    planTier: PlanTier,
    monthlyCredits: number
  ): Promise<void> {
    const now = new Date().toISOString();
    await withSerializableTransaction((db) => {
      db.prepare(
        `UPDATE "Subscription"
         SET "planTier" = ?, "status" = 'ACTIVE', "monthlyCredits" = ?, "updatedAt" = ?
         WHERE "workspaceId" = ?`
      ).run(planTier, monthlyCredits, now, workspaceId);
    });
  }
}

export class PostgresWebhookRepository implements WebhookRepository {
  private client: typeof prisma;

  constructor(client?: typeof prisma) {
    this.client = client ?? prisma;
  }

  async workspaceExists(workspaceId: string): Promise<boolean> {
    const ws = await this.client.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    return Boolean(ws);
  }

  async findSubscriptionWorkspace(paymobSubId: string): Promise<string | null> {
    const sub = await this.client.subscription.findUnique({
      where: { paymobSubscriptionId: paymobSubId },
      select: { workspaceId: true },
    });
    return sub?.workspaceId ?? null;
  }

  async findTransactionWorkspace(paymobOrderId: string): Promise<string | null> {
    const txn = await this.client.paymentTransaction.findUnique({
      where: { paymobOrderId },
      select: { workspaceId: true },
    });
    return txn?.workspaceId ?? null;
  }

  async processSubscriptionEvent(
    input: ProcessSubscriptionEventInput
  ): Promise<ProcessSubscriptionEventOutcome> {
    return this.client.$transaction(async (tx) => {
      const existingEvent = await tx.webhookEvent.findUnique({
        where: { eventId: input.eventId },
      });

      if (existingEvent && existingEvent.processed) {
        return {
          duplicate: true,
          shouldGrant: false,
          monthlyCredits: 0,
          subscriptionStatus: 'UNCHANGED',
        };
      }

      const now = new Date();
      if (!existingEvent) {
        await tx.webhookEvent.create({
          data: {
            id: `wh-${crypto.randomUUID()}`,
            source: 'PAYMOB',
            eventId: input.eventId,
            payloadHash: input.payloadHash,
            payload: JSON.parse(input.rawBody),
            processed: true,
            processedAt: now,
            createdAt: now,
          },
        });
      } else {
        await tx.webhookEvent.update({
          where: { id: existingEvent.id },
          data: { processed: true, processedAt: now },
        });
      }

      const triggerLower = input.triggerType.toLowerCase();
      const isGrantTrigger =
        triggerLower.includes('created') ||
        triggerLower.includes('renew') ||
        triggerLower.includes('payment_success') ||
        triggerLower.includes('activated');

      const isPastDueTrigger =
        triggerLower.includes('fail') || triggerLower.includes('past_due');
      const isSuspendedTrigger = triggerLower.includes('suspend');
      const isCanceledTrigger = triggerLower.includes('cancel');

      let newStatus: any = 'ACTIVE';
      if (isPastDueTrigger) newStatus = 'PAST_DUE';
      else if (isSuspendedTrigger) newStatus = 'SUSPENDED';
      else if (isCanceledTrigger) newStatus = 'CANCELED';

      const planConfig = SUBSCRIPTION_PLANS[input.planTier];
      const monthlyCredits = Number(
        input.subData.credits || planConfig.monthlyCredits || 80
      );
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await tx.subscription.update({
        where: { workspaceId: input.workspaceId },
        data: {
          planTier: input.planTier,
          status: newStatus,
          currency: input.currency,
          monthlyCredits,
          paymobSubscriptionId: input.paymobSubId,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: isCanceledTrigger,
          updatedAt: now,
        },
      });

      return {
        duplicate: false,
        shouldGrant: isGrantTrigger,
        monthlyCredits,
        subscriptionStatus: newStatus,
      };
    });
  }

  async processTransactionEvent(
    input: ProcessTransactionEventInput
  ): Promise<ProcessTransactionEventOutcome> {
    return this.client.$transaction(async (tx) => {
      const existingEvent = await tx.webhookEvent.findUnique({
        where: { eventId: input.eventId },
      });

      const status = input.isSuccess ? 'SUCCEEDED' : 'FAILED';
      if (existingEvent && existingEvent.processed) {
        return { duplicate: true, transactionStatus: status };
      }

      const now = new Date();
      if (!existingEvent) {
        await tx.webhookEvent.create({
          data: {
            id: `wh-${crypto.randomUUID()}`,
            source: 'PAYMOB',
            eventId: input.eventId,
            payloadHash: input.payloadHash,
            payload: JSON.parse(input.rawBody),
            processed: true,
            processedAt: now,
            createdAt: now,
          },
        });
      } else {
        await tx.webhookEvent.update({
          where: { id: existingEvent.id },
          data: { processed: true, processedAt: now },
        });
      }

      const existingTxn = input.paymobOrderId
        ? await tx.paymentTransaction.findUnique({
            where: { paymobOrderId: input.paymobOrderId },
          })
        : null;

      if (existingTxn) {
        await tx.paymentTransaction.update({
          where: { id: existingTxn.id },
          data: {
            paymobTxnId: input.paymobTxnId,
            status,
            errorMessage: input.isSuccess ? null : 'Transaction reported success=false',
          },
        });
      } else {
        await tx.paymentTransaction.create({
          data: {
            id: `pt-${crypto.randomUUID()}`,
            workspaceId: input.workspaceId,
            amountCents: input.amountCents,
            currency: input.currency,
            paymobOrderId: input.paymobOrderId,
            paymobTxnId: input.paymobTxnId,
            paymentMethod: input.paymentMethod,
            status,
            errorMessage: input.isSuccess ? null : 'Transaction reported success=false',
            createdAt: now,
          },
        });
      }

      return { duplicate: false, transactionStatus: status };
    });
  }

  async updateSubscriptionPlan(
    workspaceId: string,
    planTier: PlanTier,
    monthlyCredits: number
  ): Promise<void> {
    await this.client.subscription.update({
      where: { workspaceId },
      data: {
        planTier,
        status: 'ACTIVE',
        monthlyCredits,
        updatedAt: new Date(),
      },
    });
  }
}

export function getWebhookRepository(): WebhookRepository {
  return resolveDbDriver() === 'postgres'
    ? new PostgresWebhookRepository()
    : new SqliteWebhookRepository();
}
