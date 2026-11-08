import crypto from 'node:crypto';
import { getDb } from '../src/lib/db/prisma.ts';
import { hashPassword } from '../src/lib/auth/password.ts';
import { REGIONAL_PHOTOSHOOT_PRESETS } from '../src/lib/ai/presets.ts';

export const TEST_CREDENTIALS = {
  admin: {
    email: 'admin@shotistry.com',
    password: 'Admin@Shotistry2026!',
    name: 'Platform Administrator',
    role: 'ADMIN',
    country: 'EG',
    locale: 'en',
    verified: true,
    workspace: {
      id: 'ws-admin-primary',
      name: 'Admin Studio Workspace',
      slug: 'admin-studio-workspace',
      country: 'EG',
      currency: 'EGP',
      planTier: 'AGENCY',
      credits: 100,
    },
  },
  user: {
    email: 'user@shotistry.com',
    password: 'User@Shotistry2026!',
    name: 'Studio Merchant',
    role: 'USER',
    phone: '+201000000001',
    country: 'EG',
    locale: 'ar',
    verified: true,
    workspace: {
      id: 'ws-merchant-studio',
      name: 'Merchant Studio Workspace',
      slug: 'merchant-studio-workspace',
      country: 'EG',
      currency: 'EGP',
      planTier: 'STARTER',
      credits: 25,
    },
  },
  saudiMerchant: {
    email: 'saudi-merchant@shotistry.com',
    password: 'Saudi@Shotistry2026!',
    name: 'Riyadh Perfumes',
    role: 'USER',
    phone: '+966500000001',
    country: 'SA',
    locale: 'ar',
    verified: true,
    workspace: {
      id: 'ws-riyadh-studio',
      name: 'Riyadh Studio Workspace',
      slug: 'riyadh-studio-workspace',
      country: 'SA',
      currency: 'SAR',
      planTier: 'PRO',
      credits: 50,
    },
  },
  support: {
    email: 'support@shotistry.com',
    password: 'Support@Shotistry2026!',
    name: 'Support Agent',
    role: 'SUPPORT',
    country: 'EG',
    locale: 'en',
    verified: true,
    workspace: {
      id: 'ws-support-ops',
      name: 'Support Operations Workspace',
      slug: 'support-operations-workspace',
      country: 'EG',
      currency: 'EGP',
      planTier: 'FREE',
      credits: 10,
    },
  },
  unverified: {
    email: 'unverified@shotistry.com',
    password: 'Unverified@Shotistry2026!',
    name: 'Pending Verification Merchant',
    role: 'USER',
    country: 'EG',
    locale: 'ar',
    verified: false,
    workspace: {
      id: 'ws-pending-studio',
      name: 'Pending Studio Workspace',
      slug: 'pending-studio-workspace',
      country: 'EG',
      currency: 'EGP',
      planTier: 'FREE',
      credits: 5,
    },
  },
};

export async function seedDatabase() {
  const db = getDb();
  const now = new Date().toISOString();
  const futurePeriod = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  console.log('--- Seeding Shotistry Test Accounts & Studio Fixtures ---');

  // 1. Seed / Upsert Accounts
  for (const [key, account] of Object.entries(TEST_CREDENTIALS)) {
    const passwordHash = await hashPassword(account.password);
    const existing = db
      .prepare(`SELECT "id" FROM "User" WHERE LOWER("email") = LOWER(?)`)
      .get(account.email);

    let userId = existing ? existing.id : `user-${key}-${crypto.randomBytes(4).toString('hex')}`;

    if (existing) {
      db.prepare(
        `UPDATE "User"
         SET "name" = ?, "passwordHash" = ?, "role" = ?, "country" = ?, "locale" = ?,
             "phone" = ?, "emailVerifiedAt" = ?, "passwordUpdatedAt" = ?, "updatedAt" = ?
         WHERE "id" = ?`
      ).run(
        account.name,
        passwordHash,
        account.role,
        account.country,
        account.locale,
        account.phone || null,
        account.verified ? now : null,
        now,
        now,
        userId
      );
      console.log(`Updated user: ${account.email} (${account.role})`);
    } else {
      db.prepare(
        `INSERT INTO "User" (
           "id", "email", "name", "phone", "passwordHash", "role", "country", "locale",
           "emailVerifiedAt", "trialGrantedAt", "passwordUpdatedAt", "createdAt", "updatedAt"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId,
        account.email,
        account.name,
        account.phone || null,
        passwordHash,
        account.role,
        account.country,
        account.locale,
        account.verified ? now : null,
        now,
        now,
        now,
        now
      );
      console.log(`Created user: ${account.email} (${account.role})`);
    }

    // Provision Workspace
    const ws = account.workspace;
    const existingWs = db
      .prepare(`SELECT "id" FROM "Workspace" WHERE "id" = ? OR "slug" = ?`)
      .get(ws.id, ws.slug);

    if (existingWs) {
      db.prepare(
        `UPDATE "Workspace"
         SET "name" = ?, "ownerId" = ?, "country" = ?, "currency" = ?, "updatedAt" = ?
         WHERE "id" = ?`
      ).run(ws.name, userId, ws.country, ws.currency, now, existingWs.id);
    } else {
      db.prepare(
        `INSERT INTO "Workspace" (
           "id", "name", "slug", "ownerId", "country", "currency", "createdAt", "updatedAt"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(ws.id, ws.name, ws.slug, userId, ws.country, ws.currency, now, now);
    }

    // Workspace Member
    db.prepare(
      `INSERT OR REPLACE INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
       VALUES (?, ?, ?, 'OWNER', ?)`
    ).run(`wm-${ws.id}-${userId}`, ws.id, userId, now);

    // Subscription
    db.prepare(
      `INSERT OR REPLACE INTO "Subscription" (
         "id", "workspaceId", "planTier", "status", "currency", "monthlyCredits",
         "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt", "updatedAt"
       ) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      `sub-${ws.id}`,
      ws.id,
      ws.planTier,
      ws.currency,
      ws.credits,
      now,
      futurePeriod,
      now,
      now
    );

    // Credit Ledger Entry
    const existingLedger = db
      .prepare(`SELECT "id" FROM "CreditLedger" WHERE "workspaceId" = ? AND "idempotencyKey" = ?`)
      .get(ws.id, `seed:ledger:${ws.id}`);

    if (!existingLedger) {
      db.prepare(
        `INSERT INTO "CreditLedger" (
           "id", "workspaceId", "amount", "balanceAfter", "type", "referenceId", "idempotencyKey", "description", "createdAt"
         ) VALUES (?, ?, ?, ?, 'SEED_INITIAL', ?, ?, 'Test seed credit allocation', ?)`
      ).run(
        `led-seed-${ws.id}`,
        ws.id,
        ws.credits,
        ws.credits,
        `seed-${ws.id}`,
        `seed:ledger:${ws.id}`,
        now
      );
    }
  }

  // Also update legacy fixtures if present
  const legacyAdmin = db
    .prepare(`SELECT "id" FROM "User" WHERE "email" = 'admin-system@admin.shotistry.app'`)
    .get();
  if (legacyAdmin) {
    const adminHash = await hashPassword('Admin@Shotistry2026!');
    db.prepare(
      `UPDATE "User"
       SET "passwordHash" = ?, "emailVerifiedAt" = ?, "passwordUpdatedAt" = ?, "updatedAt" = ?
       WHERE "id" = ?`
    ).run(adminHash, now, now, now, legacyAdmin.id);
    console.log('Synchronized legacy admin: admin-system@admin.shotistry.app');
  }

  const legacyMerchant = db
    .prepare(`SELECT "id" FROM "User" WHERE "email" = 'user-default-merchant@merchant.shotistry.app'`)
    .get();
  if (legacyMerchant) {
    const userHash = await hashPassword('User@Shotistry2026!');
    db.prepare(
      `UPDATE "User"
       SET "passwordHash" = ?, "emailVerifiedAt" = ?, "passwordUpdatedAt" = ?, "updatedAt" = ?
       WHERE "id" = ?`
    ).run(userHash, now, now, now, legacyMerchant.id);
    console.log('Synchronized legacy merchant: user-default-merchant@merchant.shotistry.app');
  }

  // 2. Seed Prompt Templates & Versions from presets
  console.log('Seeding Prompt Templates and Versions...');
  for (const preset of REGIONAL_PHOTOSHOOT_PRESETS) {
    db.prepare(
      `INSERT OR REPLACE INTO "PromptTemplate" (
         "id", "name", "nameAr", "category", "thumbnailUrl", "isRegional", "isActive", "createdAt"
       ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      preset.id,
      preset.name,
      preset.nameAr,
      preset.category,
      preset.thumbnailUrl,
      preset.isRegional ? 1 : 0,
      now
    );

    db.prepare(
      `INSERT OR REPLACE INTO "PromptVersion" (
         "id", "templateId", "version", "basePrompt", "negPrompt", "modelTarget", "isCurrent", "createdAt"
       ) VALUES (?, ?, 1, ?, ?, 'gemini-3.1-flash-image', 1, ?)`
    ).run(
      `pv-${preset.id}-v1`,
      preset.id,
      preset.baseSchema.surface + '; ' + preset.baseSchema.backdrop,
      preset.baseSchema.negativeDirectives || 'no blur, no low resolution',
      now
    );
  }

  // 3. Seed Sample Brand & Products for user@shotistry.com
  const userAccount = db
    .prepare(`SELECT "id" FROM "User" WHERE "email" = 'user@shotistry.com'`)
    .get();
  if (userAccount) {
    const brandId = 'brand-nile-essence';
    db.prepare(
      `INSERT OR REPLACE INTO "Brand" (
         "id", "workspaceId", "name", "description", "aesthetic", "createdAt", "updatedAt"
       ) VALUES (?, 'ws-merchant-studio', 'Nile Essence', 'Luxury Egyptian botanical & fragrance brand', 'Warm luxury minimalism', ?, ?)`
    ).run(brandId, now, now);

    const sampleProducts = [
      {
        id: 'prod-royal-oud',
        name: 'Royal Oud Eau de Parfum 100ml',
        category: 'Fragrance',
        description: 'Premium aged Cambodian oud infused with Damascene rose and golden amber.',
      },
      {
        id: 'prod-leather-bag',
        name: 'Artisanal Tan Leather Handbag',
        category: 'Leather Goods',
        description: 'Handcrafted full-grain camel leather with hand-stitched seams and brushed brass hardware.',
      },
      {
        id: 'prod-glow-serum',
        name: 'Hydrating Vitamin C Glow Serum 50ml',
        category: 'Skincare',
        description: 'Antioxidant-rich radiance booster with hyaluronic acid and cold-pressed jojoba extract.',
      },
      {
        id: 'prod-arabic-coffee',
        name: 'Cold-Brew Cardamom Arabica Coffee 250ml',
        category: 'Beverages',
        description: 'Artisanal cold-drip heirloom Arabica beans infused with green cardamom and saffron.',
      },
    ];

    for (const prod of sampleProducts) {
      db.prepare(
        `INSERT OR REPLACE INTO "Product" (
           "id", "brandId", "name", "category", "description", "createdAt", "updatedAt"
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(prod.id, brandId, prod.name, prod.category, prod.description, now, now);
    }
    console.log(`Seeded Brand and ${sampleProducts.length} sample products for user@shotistry.com`);
  }

  console.log('--- Database Seeding Complete ---');
}

if (process.argv[1]?.endsWith('seed-test-accounts.mjs')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
