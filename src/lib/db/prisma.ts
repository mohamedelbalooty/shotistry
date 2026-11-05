import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';

const globalForDb = globalThis as unknown as {
  prisma?: PrismaClient;
  sqliteDb?: DatabaseSync;
  txMutex?: Promise<void>;
};

export const prisma =
  globalForDb.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.prisma = prisma;
}

const SCHEMA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT,
  "phone" TEXT,
  "passwordHash" TEXT,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "country" TEXT NOT NULL DEFAULT 'EG',
  "locale" TEXT NOT NULL DEFAULT 'ar',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "Workspace" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "ownerId" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'EG',
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "createdAt" TEXT NOT NULL,
  UNIQUE("workspaceId", "userId"),
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Brand" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "logoUrl" TEXT,
  "primaryColor" TEXT,
  "accentColor" TEXT,
  "aesthetic" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Product" (
  "id" TEXT PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "dimensions" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "ProductAsset" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "rawUrl" TEXT NOT NULL,
  "maskedUrl" TEXT,
  "maskUrl" TEXT,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "PromptTemplate" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "isRegional" INTEGER NOT NULL DEFAULT 0,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "PromptVersion" (
  "id" TEXT PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "basePrompt" TEXT NOT NULL,
  "negPrompt" TEXT,
  "modelTarget" TEXT NOT NULL DEFAULT 'gemini-3.1-flash-image',
  "isCurrent" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("templateId") REFERENCES "PromptTemplate"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Photoshoot" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "stylePreset" TEXT NOT NULL,
  "aspectRatio" TEXT NOT NULL DEFAULT '1:1',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "GenerationJob" (
  "id" TEXT PRIMARY KEY,
  "photoshootId" TEXT NOT NULL,
  "promptVersionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "modelUsed" TEXT NOT NULL,
  "creditCost" INTEGER NOT NULL DEFAULT 1,
  "rawPrompt" TEXT NOT NULL,
  "synthesizedPrompt" TEXT NOT NULL,
  "errorMessage" TEXT,
  "startedAt" TEXT,
  "completedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("photoshootId") REFERENCES "Photoshoot"("id") ON DELETE CASCADE,
  FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "GeneratedImage" (
  "id" TEXT PRIMARY KEY,
  "generationJobId" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "resolution" TEXT NOT NULL DEFAULT '1024x1024',
  "aspectRatio" TEXT NOT NULL DEFAULT '1:1',
  "seed" INTEGER,
  "isFavorite" INTEGER NOT NULL DEFAULT 0,
  "synthIdDetected" INTEGER NOT NULL DEFAULT 0,
  "fidelityScore" REAL NOT NULL DEFAULT 1.0,
  "executionMode" TEXT NOT NULL DEFAULT 'LIVE_GEMINI_API',
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL UNIQUE,
  "planTier" TEXT NOT NULL DEFAULT 'FREE',
  "status" TEXT NOT NULL DEFAULT 'INCOMPLETE',
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "monthlyCredits" INTEGER NOT NULL DEFAULT 5,
  "paymobSubscriptionId" TEXT UNIQUE,
  "paymobCardToken" TEXT,
  "currentPeriodStart" TEXT NOT NULL,
  "currentPeriodEnd" TEXT NOT NULL,
  "cancelAtPeriodEnd" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "CreditLedger" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "referenceId" TEXT,
  "idempotencyKey" TEXT UNIQUE,
  "description" TEXT,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CreditLedger_workspaceId_createdAt_idx"
  ON "CreditLedger"("workspaceId", "createdAt");

CREATE TABLE IF NOT EXISTS "CreditReservation" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "generationJobId" TEXT NOT NULL UNIQUE,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TEXT NOT NULL,
  "settledAt" TEXT,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "paymobOrderId" TEXT UNIQUE,
  "paymobTxnId" TEXT UNIQUE,
  "paymentMethod" TEXT,
  "status" TEXT NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL DEFAULT 'PAYMOB',
  "eventId" TEXT NOT NULL UNIQUE,
  "payloadHash" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TEXT,
  "errorMessage" TEXT,
  "createdAt" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "WebhookEvent_source_eventId_idx"
  ON "WebhookEvent"("source", "eventId");

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetId" TEXT,
  "details" TEXT,
  "ipAddress" TEXT,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
`;

function initSqliteDb(dbPath?: string): DatabaseSync {
  const resolvedPath =
    dbPath ??
    process.env.SHOTISTRY_SQLITE_PATH ??
    path.join(process.cwd(), '.data', 'shotistry.sqlite');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new DatabaseSync(resolvedPath);
  if (resolvedPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
  }
  db.exec(SCHEMA_DDL);
  return db;
}

export function getDb(): DatabaseSync {
  if (!globalForDb.sqliteDb) {
    globalForDb.sqliteDb = initSqliteDb();
  }
  return globalForDb.sqliteDb;
}

export async function resetDbForTests(): Promise<void> {
  if (globalForDb.sqliteDb) {
    try {
      globalForDb.sqliteDb.close();
    } catch {
      // Ignore already closed handle
    }
  }
  globalForDb.sqliteDb = initSqliteDb(':memory:');
  globalForDb.txMutex = Promise.resolve();
}

/**
 * Executes a synchronous or asynchronous callback inside a strict SERIALIZABLE
 * SQL transaction with mutex serialization and BEGIN IMMEDIATE locking.
 */
export async function withSerializableTransaction<T>(
  fn: (db: DatabaseSync) => Promise<T> | T
): Promise<T> {
  const previous = globalForDb.txMutex ?? Promise.resolve();
  let releaseMutex!: () => void;
  globalForDb.txMutex = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });

  await previous;
  const db = getDb();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = await fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback errors if already rolled back
    }
    throw err;
  } finally {
    releaseMutex();
  }
}

