import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CreditLedgerEngine } from '../src/lib/ledger/credit-ledger.ts';

describe('Double-Entry Credit Ledger Engine Tests', () => {
  it('should correctly compute confirmed balance from immutable entries', () => {
    const entries = [
      { id: '1', workspaceId: 'ws_1', amount: 5, balanceAfter: 5, type: 'SUBSCRIPTION_GRANT', createdAt: new Date() },
      { id: '2', workspaceId: 'ws_1', amount: 50, balanceAfter: 55, type: 'TOP_UP_PURCHASE', createdAt: new Date() },
      { id: '3', workspaceId: 'ws_1', amount: -1, balanceAfter: 54, type: 'JOB_SETTLEMENT', createdAt: new Date() }
    ];

    const balance = CreditLedgerEngine.computeBalance(entries);
    assert.strictEqual(balance, 54);
  });

  it('should compute available balance taking into account pending reservations', () => {
    const entries = [
      { id: '1', workspaceId: 'ws_1', amount: 10, balanceAfter: 10, type: 'SUBSCRIPTION_GRANT', createdAt: new Date() }
    ];

    const reservations = [
      { id: 'r1', workspaceId: 'ws_1', generationJobId: 'job_1', amount: 2, status: 'PENDING', createdAt: new Date() },
      { id: 'r2', workspaceId: 'ws_1', generationJobId: 'job_2', amount: 3, status: 'PENDING', createdAt: new Date() },
      { id: 'r3', workspaceId: 'ws_1', generationJobId: 'job_3', amount: 1, status: 'SETTLED', createdAt: new Date() }
    ];

    // Total confirmed = 10. Pending reservations = 2 + 3 = 5. Available = 5.
    const available = CreditLedgerEngine.computeAvailableBalance(entries, reservations);
    assert.strictEqual(available, 5);
  });

  it('should reject reservation creation when available credits are insufficient', () => {
    const entries = [
      { id: '1', workspaceId: 'ws_1', amount: 2, balanceAfter: 2, type: 'SUBSCRIPTION_GRANT', createdAt: new Date() }
    ];
    const reservations = [
      { id: 'r1', workspaceId: 'ws_1', generationJobId: 'job_1', amount: 2, status: 'PENDING', createdAt: new Date() }
    ];

    // Available is 0
    assert.throws(
      () => {
        CreditLedgerEngine.createReservation('ws_1', 'job_new', 1, entries, reservations);
      },
      {
        message: /Insufficient credits/
      }
    );
  });

  it('should create pending reservation hold and update available balance', () => {
    const entries = [
      { id: '1', workspaceId: 'ws_1', amount: 10, balanceAfter: 10, type: 'SUBSCRIPTION_GRANT', createdAt: new Date() }
    ];
    const reservations = [];

    const result = CreditLedgerEngine.createReservation('ws_1', 'job_100', 1, entries, reservations);
    assert.strictEqual(result.reservation.status, 'PENDING');
    assert.strictEqual(result.reservation.amount, 1);
    assert.strictEqual(result.newAvailableBalance, 9);
  });

  it('should settle reservation on generation success and append debit entry', () => {
    const entries = [
      { id: '1', workspaceId: 'ws_1', amount: 10, balanceAfter: 10, type: 'SUBSCRIPTION_GRANT', createdAt: new Date() }
    ];
    const reservation = {
      id: 'res_1',
      workspaceId: 'ws_1',
      generationJobId: 'job_100',
      amount: 1,
      status: 'PENDING',
      createdAt: new Date()
    };

    const { settledReservation, newLedgerEntry } = CreditLedgerEngine.settleReservation(reservation, entries);

    assert.strictEqual(settledReservation.status, 'SETTLED');
    assert.ok(settledReservation.settledAt);
    assert.strictEqual(newLedgerEntry.amount, -1);
    assert.strictEqual(newLedgerEntry.balanceAfter, 9);
    assert.strictEqual(newLedgerEntry.type, 'JOB_SETTLEMENT');
    assert.strictEqual(newLedgerEntry.referenceId, 'job_100');
  });

  it('should release reservation on generation failure with zero loss to user', () => {
    const reservation = {
      id: 'res_1',
      workspaceId: 'ws_1',
      generationJobId: 'job_failed',
      amount: 1,
      status: 'PENDING',
      createdAt: new Date()
    };

    const released = CreditLedgerEngine.releaseReservation(reservation, 'API Timeout from model');
    assert.strictEqual(released.status, 'RELEASED');
    assert.ok(released.settledAt);
  });

  it('should grant credits on subscription activation or top-up', () => {
    const entries = [
      { id: '1', workspaceId: 'ws_1', amount: 5, balanceAfter: 5, type: 'SUBSCRIPTION_GRANT', createdAt: new Date() }
    ];

    const grantEntry = CreditLedgerEngine.grantCredits(
      'ws_1',
      200,
      'SUBSCRIPTION_GRANT',
      'sub_paymob_123',
      'Monthly Pro subscription renewal',
      entries
    );

    assert.strictEqual(grantEntry.amount, 200);
    assert.strictEqual(grantEntry.balanceAfter, 205);
    assert.strictEqual(grantEntry.type, 'SUBSCRIPTION_GRANT');
  });
});
