import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDb, resetDbForTests } from '../src/lib/db/prisma.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';

describe('Database Persistence & Atomic CreditLedgerService (Integration)', () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  test('provisions a workspace with 5 free trial credits idempotently in SQL persistence', async () => {
    const ledger = new CreditLedgerService();
    const ws1 = await ledger.ensureWorkspace({
      userId: 'user-cairo-1',
      email: 'merchant@cairo-store.eg',
      workspaceId: 'ws-cairo-1',
      workspaceName: 'Cairo Perfumes',
      country: 'EG',
      currency: 'EGP',
    });

    assert.equal(ws1.workspaceId, 'ws-cairo-1');
    assert.equal(ws1.settledBalance, 5);
    assert.equal(ws1.availableCredits, 5);

    // Calling ensureWorkspace again must be idempotent and NOT grant another 5 credits
    const ws2 = await ledger.ensureWorkspace({
      userId: 'user-cairo-1',
      email: 'merchant@cairo-store.eg',
      workspaceId: 'ws-cairo-1',
      workspaceName: 'Cairo Perfumes',
      country: 'EG',
      currency: 'EGP',
    });

    assert.equal(ws2.settledBalance, 5);
    assert.equal(ws2.availableCredits, 5);
  });

  test('atomically reserves credits, settles on job completion, and persists in CreditLedger', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-riyadh-1',
      email: 'founder@riyadh-oud.sa',
      workspaceId: 'ws-riyadh-1',
      workspaceName: 'Riyadh Oud',
      country: 'SA',
      currency: 'SAR',
    });

    const job = await ledger.createPhotoshootJob({
      workspaceId: 'ws-riyadh-1',
      productName: 'Royal Oud 100ml',
      category: 'perfume',
      stylePreset: 'ramadan-luxury',
      aspectRatio: '1:1',
      modelUsed: 'gemini-3.1-flash-image',
      rawPrompt: 'Luxury gold oud bottle',
      synthesizedPrompt: 'Commercial product photo of Luxury gold oud bottle',
      creditCost: 2,
    });

    const reservation = await ledger.reserveCredits({
      workspaceId: 'ws-riyadh-1',
      generationJobId: job.id,
      amount: 2,
    });

    assert.equal(reservation.status, 'PENDING');
    assert.equal(reservation.amount, 2);

    const midBalance = await ledger.getWorkspaceBalance('ws-riyadh-1');
    assert.equal(midBalance.settledBalance, 5);
    assert.equal(midBalance.reservedCredits, 2);
    assert.equal(midBalance.availableCredits, 3);

    const settlement = await ledger.settleReservation(reservation.id);
    assert.equal(settlement.reservation.status, 'SETTLED');
    assert.equal(settlement.ledgerEntry.amount, -2);
    assert.equal(settlement.ledgerEntry.balanceAfter, 3);
    assert.equal(settlement.ledgerEntry.type, 'JOB_SETTLEMENT');

    const finalBalance = await ledger.getWorkspaceBalance('ws-riyadh-1');
    assert.equal(finalBalance.settledBalance, 3);
    assert.equal(finalBalance.reservedCredits, 0);
    assert.equal(finalBalance.availableCredits, 3);
  });

  test('releases credit reservation on generation failure so customer loses zero credits', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-1',
      email: 'test@shotistry.app',
      workspaceId: 'ws-refund-test',
      workspaceName: 'Refund Test WS',
    });

    const job = await ledger.createPhotoshootJob({
      workspaceId: 'ws-refund-test',
      productName: 'Watch',
      category: 'accessories',
      stylePreset: 'minimal-studio',
      aspectRatio: '1:1',
      modelUsed: 'gemini-3.1-flash-image',
      rawPrompt: 'Watch',
      synthesizedPrompt: 'Watch studio',
      creditCost: 1,
    });

    const reservation = await ledger.reserveCredits({
      workspaceId: 'ws-refund-test',
      generationJobId: job.id,
      amount: 1,
    });

    const released = await ledger.releaseReservation(reservation.id, 'Upstream AI timeout');
    assert.equal(released.status, 'RELEASED');

    const balanceAfter = await ledger.getWorkspaceBalance('ws-refund-test');
    assert.equal(balanceAfter.settledBalance, 5);
    assert.equal(balanceAfter.reservedCredits, 0);
    assert.equal(balanceAfter.availableCredits, 5);
  });

  test('prevents double-spending under concurrent reservation contention (SERIALIZABLE lock)', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-race',
      email: 'race@shotistry.app',
      workspaceId: 'ws-race',
      workspaceName: 'Race Condition WS',
    });

    // Workspace starts with 5 credits. Create 8 concurrent jobs each costing 1 credit.
    const jobs = [];
    for (let i = 0; i < 8; i++) {
      jobs.push(
        await ledger.createPhotoshootJob({
          workspaceId: 'ws-race',
          productName: `Item ${i}`,
          category: 'skincare',
          stylePreset: 'minimal-studio',
          aspectRatio: '1:1',
          modelUsed: 'gemini-3.1-flash-image',
          rawPrompt: `Item ${i}`,
          synthesizedPrompt: `Studio Item ${i}`,
          creditCost: 1,
        })
      );
    }

    const results = await Promise.allSettled(
      jobs.map((job) =>
        ledger.reserveCredits({
          workspaceId: 'ws-race',
          generationJobId: job.id,
          amount: 1,
        })
      )
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 5, 'Exactly 5 reservations must succeed');
    assert.equal(rejected.length, 3, 'Remaining 3 reservations must fail with Insufficient credits');

    const balance = await ledger.getWorkspaceBalance('ws-race');
    assert.equal(balance.settledBalance, 5);
    assert.equal(balance.reservedCredits, 5);
    assert.equal(balance.availableCredits, 0);
  });

  test('enforces idempotency on credit grants via idempotencyKey', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-idem',
      email: 'idem@shotistry.app',
      workspaceId: 'ws-idem',
      workspaceName: 'Idempotent WS',
    });

    const grant1 = await ledger.grantCredits({
      workspaceId: 'ws-idem',
      amount: 80,
      type: 'SUBSCRIPTION_GRANT',
      referenceId: 'paymob-txn-999',
      idempotencyKey: 'paymob:txn:999:grant',
      description: 'Starter Plan Activated',
    });

    const grant2 = await ledger.grantCredits({
      workspaceId: 'ws-idem',
      amount: 80,
      type: 'SUBSCRIPTION_GRANT',
      referenceId: 'paymob-txn-999',
      idempotencyKey: 'paymob:txn:999:grant',
      description: 'Starter Plan Activated (Replay)',
    });

    assert.equal(grant1.id, grant2.id);
    const balance = await ledger.getWorkspaceBalance('ws-idem');
    assert.equal(balance.settledBalance, 85); // 5 trial + 80 starter (granted once)
  });
});

