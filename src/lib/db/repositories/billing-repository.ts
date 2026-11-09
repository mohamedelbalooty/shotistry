import type { DatabaseSync } from 'node:sqlite';
import { prisma, getDb, withSerializableTransaction } from '../prisma.ts';
import { resolveDbDriver } from '../driver.ts';
import type { PlanTier } from '../../types/index.ts';

export interface CreatePendingPaymentTransactionParams {
  id: string;
  workspaceId: string;
  amountCents: number;
  currency: string;
  kind?: string;
  planTier?: PlanTier | null;
  packId?: string | null;
  credits?: number;
  region?: string;
  paymobOrderId?: string | null;
  intentionId?: string | null;
  specialReference?: string | null;
  paymentMethod?: string | null;
  createdAt: string;
}

export interface PaymentTransactionRecord {
  id: string;
  workspaceId: string;
  amountCents: number;
  currency: string;
  kind: string;
  planTier: PlanTier | null;
  packId: string | null;
  credits: number;
  region: string;
  paymobOrderId: string | null;
  paymobTxnId: string | null;
  intentionId: string | null;
  specialReference: string | null;
  paymentMethod: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface BillingRepository {
  createPendingPaymentTransaction(
    params: CreatePendingPaymentTransactionParams
  ): Promise<void>;
  findPaymentTransactionById(id: string): Promise<PaymentTransactionRecord | null>;
  findPaymentTransactionByReference(
    reference: string
  ): Promise<PaymentTransactionRecord | null>;
}

export class SqliteBillingRepository implements BillingRepository {
  private getDb(): DatabaseSync {
    return getDb();
  }

  async createPendingPaymentTransaction(
    params: CreatePendingPaymentTransactionParams
  ): Promise<void> {
    await withSerializableTransaction((db) => {
      db.prepare(
        `INSERT INTO "PaymentTransaction" (
           "id", "workspaceId", "amountCents", "currency", "kind", "planTier",
           "packId", "credits", "region", "paymobOrderId", "intentionId",
           "specialReference", "paymentMethod", "status", "createdAt"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`
      ).run(
        params.id,
        params.workspaceId,
        params.amountCents,
        params.currency,
        params.kind || 'TOP_UP',
        params.planTier ?? null,
        params.packId ?? null,
        params.credits ?? 0,
        params.region || 'EG',
        params.paymobOrderId ?? null,
        params.intentionId ?? null,
        params.specialReference ?? null,
        params.paymentMethod ?? null,
        params.createdAt
      );
    });
  }

  async findPaymentTransactionById(id: string): Promise<PaymentTransactionRecord | null> {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT * FROM "PaymentTransaction" WHERE "id" = ?`)
      .get(id) as PaymentTransactionRecord | undefined;
    return row ?? null;
  }

  async findPaymentTransactionByReference(
    reference: string
  ): Promise<PaymentTransactionRecord | null> {
    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT * FROM "PaymentTransaction"
         WHERE "id" = ? OR "paymobOrderId" = ? OR "specialReference" = ? OR "intentionId" = ?`
      )
      .get(reference, reference, reference, reference) as PaymentTransactionRecord | undefined;
    return row ?? null;
  }
}

export class PostgresBillingRepository implements BillingRepository {
  private client: typeof prisma;

  constructor(client?: typeof prisma) {
    this.client = client ?? prisma;
  }

  async createPendingPaymentTransaction(
    params: CreatePendingPaymentTransactionParams
  ): Promise<void> {
    await this.client.paymentTransaction.create({
      data: {
        id: params.id,
        workspaceId: params.workspaceId,
        amountCents: params.amountCents,
        currency: params.currency as any,
        kind: params.kind || 'TOP_UP',
        planTier: params.planTier ?? null,
        packId: params.packId ?? null,
        credits: params.credits ?? 0,
        region: params.region || 'EG',
        paymobOrderId: params.paymobOrderId ?? null,
        intentionId: params.intentionId ?? null,
        specialReference: params.specialReference ?? null,
        paymentMethod: params.paymentMethod ?? null,
        status: 'PENDING',
        createdAt: new Date(params.createdAt),
      },
    });
  }

  async findPaymentTransactionById(id: string): Promise<PaymentTransactionRecord | null> {
    const row = await this.client.paymentTransaction.findUnique({
      where: { id },
    });
    if (!row) return null;
    return {
      ...row,
      planTier: row.planTier as PlanTier | null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findPaymentTransactionByReference(
    reference: string
  ): Promise<PaymentTransactionRecord | null> {
    const row = await this.client.paymentTransaction.findFirst({
      where: {
        OR: [
          { id: reference },
          { paymobOrderId: reference },
          { specialReference: reference },
          { intentionId: reference },
        ],
      },
    });
    if (!row) return null;
    return {
      ...row,
      planTier: row.planTier as PlanTier | null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export function getBillingRepository(): BillingRepository {
  return resolveDbDriver() === 'postgres'
    ? new PostgresBillingRepository()
    : new SqliteBillingRepository();
}
