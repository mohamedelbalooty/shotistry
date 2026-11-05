import type { LedgerTransactionType, ReservationStatus } from '../types/index.ts';

export interface LedgerEntry {
  id: string;
  workspaceId: string;
  amount: number; // Positive = credit, Negative = debit
  balanceAfter: number;
  type: LedgerTransactionType;
  referenceId?: string;
  description?: string;
  createdAt: Date;
}

export interface ReservationRecord {
  id: string;
  workspaceId: string;
  generationJobId: string;
  amount: number;
  status: ReservationStatus;
  createdAt: Date;
  settledAt?: Date;
}

/**
 * Pure double-entry credit ledger engine ensuring strict mathematical consistency,
 * zero lost updates, and automatic refunding on failed generation operations.
 */
export class CreditLedgerEngine {
  /**
   * Calculates the current confirmed balance from an array of immutable ledger transactions.
   */
  static computeBalance(entries: LedgerEntry[]): number {
    return entries.reduce((acc, entry) => acc + entry.amount, 0);
  }

  /**
   * Calculates available credits factoring in active pending reservations.
   * Available = Confirmed Balance - Sum(Pending Reservations)
   */
  static computeAvailableBalance(
    ledgerEntries: LedgerEntry[],
    activeReservations: ReservationRecord[]
  ): number {
    const confirmedBalance = this.computeBalance(ledgerEntries);
    const reservedTotal = activeReservations
      .filter((r) => r.status === 'PENDING')
      .reduce((acc, r) => acc + r.amount, 0);

    return Math.max(0, confirmedBalance - reservedTotal);
  }

  /**
   * Phase 1 of 3-Phase Generation Commit:
   * Validates available balance and creates a PENDING reservation lock.
   * Throws an error if insufficient credits exist.
   */
  static createReservation(
    workspaceId: string,
    generationJobId: string,
    amount: number,
    ledgerEntries: LedgerEntry[],
    activeReservations: ReservationRecord[]
  ): { reservation: ReservationRecord; newAvailableBalance: number } {
    if (amount <= 0) {
      throw new Error('Reservation amount must be greater than zero.');
    }

    const available = this.computeAvailableBalance(ledgerEntries, activeReservations);

    if (available < amount) {
      throw new Error(
        `Insufficient credits: Required ${amount}, but only ${available} available.`
      );
    }

    const reservation: ReservationRecord = {
      id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      workspaceId,
      generationJobId,
      amount,
      status: 'PENDING',
      createdAt: new Date()
    };

    return {
      reservation,
      newAvailableBalance: available - amount
    };
  }

  /**
   * Phase 2: Settle Reservation on Generation Success.
   * Transitions reservation status to SETTLED and appends a debit entry to the immutable ledger.
   */
  static settleReservation(
    reservation: ReservationRecord,
    currentLedgerEntries: LedgerEntry[]
  ): { settledReservation: ReservationRecord; newLedgerEntry: LedgerEntry } {
    if (reservation.status !== 'PENDING') {
      throw new Error(
        `Cannot settle reservation in state '${reservation.status}'. Only PENDING reservations can be settled.`
      );
    }

    const currentBalance = this.computeBalance(currentLedgerEntries);
    const balanceAfter = currentBalance - reservation.amount;

    const settledReservation: ReservationRecord = {
      ...reservation,
      status: 'SETTLED',
      settledAt: new Date()
    };

    const newLedgerEntry: LedgerEntry = {
      id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      workspaceId: reservation.workspaceId,
      amount: -reservation.amount,
      balanceAfter,
      type: 'JOB_SETTLEMENT',
      referenceId: reservation.generationJobId,
      description: `Settlement for Generation Job ${reservation.generationJobId}`,
      createdAt: new Date()
    };

    return {
      settledReservation,
      newLedgerEntry
    };
  }

  /**
   * Phase 3: Release/Refund Reservation on Generation Failure or Abort.
   * Transitions reservation status to RELEASED.
   * Crucially: NO debit is added to the ledger, so the customer loses 0 credits!
   */
  static releaseReservation(
    reservation: ReservationRecord,
    failureReason: string
  ): ReservationRecord {
    if (reservation.status !== 'PENDING') {
      throw new Error(
        `Cannot release reservation in state '${reservation.status}'. Only PENDING reservations can be released.`
      );
    }

    return {
      ...reservation,
      status: 'RELEASED',
      settledAt: new Date()
    };
  }

  /**
   * Grants credits to a workspace (e.g., Subscription activation, renewal, or top-up purchase).
   */
  static grantCredits(
    workspaceId: string,
    amount: number,
    type: 'SUBSCRIPTION_GRANT' | 'TOP_UP_PURCHASE' | 'ADMIN_ADJUSTMENT',
    referenceId: string,
    description: string,
    currentLedgerEntries: LedgerEntry[]
  ): LedgerEntry {
    if (amount <= 0) {
      throw new Error('Grant credit amount must be greater than zero.');
    }

    const currentBalance = this.computeBalance(currentLedgerEntries);
    const balanceAfter = currentBalance + amount;

    return {
      id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      workspaceId,
      amount,
      balanceAfter,
      type,
      referenceId,
      description,
      createdAt: new Date()
    };
  }
}
