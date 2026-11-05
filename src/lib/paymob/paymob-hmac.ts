import crypto from 'node:crypto';

/**
 * Paymob Cryptographic HMAC-SHA512 Security Module.
 * Implements strict constant-time signature verification for both:
 * 1. Paymob Subscription / Recurring Webhooks.
 * 2. Paymob Transaction & Unified Checkout Webhooks.
 */
export class PaymobSecurity {
  /**
   * Computes the HMAC-SHA512 for Paymob Subscriptions.
   * Specification: trigger_type + "for" + subscription_data.id
   */
  static calculateSubscriptionHmac(
    triggerType: string,
    subscriptionId: number | string,
    secretKey: string
  ): string {
    const concatenatedString = `${triggerType}for${subscriptionId}`;
    return crypto
      .createHmac('sha512', secretKey)
      .update(concatenatedString)
      .digest('hex');
  }

  /**
   * Cryptographically verifies a Paymob Subscription Webhook payload.
   * Uses crypto.timingSafeEqual to defend against timing attacks.
   */
  static verifySubscriptionWebhook(
    payload: {
      trigger_type: string;
      subscription_data?: { id: number | string };
      hmac: string;
    },
    secretKey: string
  ): boolean {
    if (!payload?.trigger_type || !payload?.subscription_data?.id || !payload?.hmac || !secretKey) {
      return false;
    }

    const expectedHmac = this.calculateSubscriptionHmac(
      payload.trigger_type,
      payload.subscription_data.id,
      secretKey
    );

    try {
      const calculatedBuffer = Buffer.from(expectedHmac, 'hex');
      const receivedBuffer = Buffer.from(payload.hmac, 'hex');

      if (calculatedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(calculatedBuffer, receivedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Computes the HMAC-SHA512 for Paymob standard transactions.
   * Requires concatenating 20 strict fields in exact lexical order.
   */
  static calculateTransactionHmac(
    data: Record<string, any>,
    secretKey: string
  ): string {
    const fields = [
      data.amount_cents,
      data.created_at,
      data.currency,
      data.error_occured,
      data.has_parent_transaction,
      data.id,
      data.integration_id,
      data.is_3d_secure,
      data.is_auth,
      data.is_capture,
      data.is_refunded,
      data.is_standalone_payment,
      data.is_voided,
      data.order?.id ?? data['order.id'],
      data.owner,
      data.pending,
      data.source_data?.pan ?? data['source_data.pan'],
      data.source_data?.sub_type ?? data['source_data.sub_type'],
      data.source_data?.type ?? data['source_data.type'],
      data.success
    ];

    const concatenatedString = fields.map((v) => (v === undefined || v === null ? '' : String(v))).join('');

    return crypto
      .createHmac('sha512', secretKey)
      .update(concatenatedString)
      .digest('hex');
  }

  /**
   * Verifies standard transaction webhooks.
   */
  static verifyTransactionWebhook(
    receivedHmac: string,
    transactionData: Record<string, any>,
    secretKey: string
  ): boolean {
    if (!receivedHmac || !transactionData || !secretKey) {
      return false;
    }

    const calculated = this.calculateTransactionHmac(transactionData, secretKey);

    try {
      const calculatedBuffer = Buffer.from(calculated, 'hex');
      const receivedBuffer = Buffer.from(receivedHmac, 'hex');

      if (calculatedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(calculatedBuffer, receivedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Converts main currency units (EGP / SAR) into Paymob cents/subunits (Piastres / Halalas).
   */
  static toSubunits(amount: number): number {
    return Math.round(amount * 100);
  }

  /**
   * Converts Paymob subunits back to decimal major currency.
   */
  static fromSubunits(amountCents: number): number {
    return amountCents / 100;
  }
}
