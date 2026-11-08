import type { DatabaseSync } from 'node:sqlite';
import { prisma, getDb, withSerializableTransaction } from '../prisma.ts';
import { resolveDbDriver } from '../driver.ts';

export interface CreatePendingPaymentTransactionParams {
  id: string;
  workspaceId: string;
  amountCents: number;
  currency: string;
  paymobOrderId: string;
  paymentMethod: string;
  createdAt: string;
}

export interface BillingRepository {
  createPendingPaymentTransaction(
    params: CreatePendingPaymentTransactionParams
  ): Promise<void>;
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
           "id", "workspaceId", "amountCents", "currency", "paymobOrderId",
           "paymentMethod", "status", "createdAt"
         ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`
      ).run(
        params.id,
        params.workspaceId,
        params.amountCents,
        params.currency,
        params.paymobOrderId,
        params.paymentMethod,
        params.createdAt
      );
    });
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
        paymobOrderId: params.paymobOrderId,
        paymentMethod: params.paymentMethod,
        status: 'PENDING',
        createdAt: new Date(params.createdAt),
      },
    });
  }
}

export function getBillingRepository(): BillingRepository {
  return resolveDbDriver() === 'postgres'
    ? new PostgresBillingRepository()
    : new SqliteBillingRepository();
}
