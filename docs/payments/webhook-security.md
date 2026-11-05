# Paymob Webhook Security & Verification Specification

## 1. Webhook Authentication Protocol

Paymob webhooks are secured using **HMAC-SHA512** cryptographic signatures. Because Paymob uses distinct payload formats for recurring subscriptions versus standard transaction callbacks, Shotistry implements dedicated signature verification pipelines for both.

---

## 2. Subscription Webhook Signature Algorithm

In Paymob Subscription webhooks, the `hmac` signature is passed directly inside the JSON body:

```json
{
  "paymob_request_id": "9a12c8e3-...",
  "trigger_type": "Subscription Created",
  "subscription_data": {
    "id": 1264,
    "amount_cents": 89900,
    "frequency": 30,
    ...
  },
  "hmac": "d98f7a6b4..."
}
```

### Concatenation Rule:
$$\text{Signature Source} = \text{trigger\_type} + \text{"for"} + \text{subscription\_data.id}$$

### Verification Implementation (TypeScript):
```typescript
import crypto from 'node:crypto';

export function verifySubscriptionHmac(
  triggerType: string,
  subscriptionId: number | string,
  receivedHmac: string,
  secretKey: string
): boolean {
  if (!triggerType || !subscriptionId || !receivedHmac || !secretKey) {
    return false;
  }

  const concatenatedString = `${triggerType}for${subscriptionId}`;
  const calculatedHmac = crypto
    .createHmac('sha512', secretKey)
    .update(concatenatedString)
    .digest('hex');

  // Prevent timing attacks using timingSafeEqual
  const calculatedBuffer = Buffer.from(calculatedHmac, 'hex');
  const receivedBuffer = Buffer.from(receivedHmac, 'hex');

  if (calculatedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedBuffer, receivedBuffer);
}
```

---

## 3. Transaction Webhook Signature Algorithm (For One-Off Credit Packs)
For standard transaction webhooks, Paymob requires concatenating 20 specific transaction fields in strict lexical sequence before computing HMAC-SHA512.

### Strict Ordered Fields:
1. `amount_cents`
2. `created_at`
3. `currency`
4. `error_occured`
5. `has_parent_transaction`
6. `id`
7. `integration_id`
8. `is_3d_secure`
9. `is_auth`
10. `is_capture`
11. `is_refunded`
12. `is_standalone_payment`
13. `is_voided`
14. `order.id`
15. `owner`
16. `pending`
17. `source_data.pan`
18. `source_data.sub_type`
19. `source_data.type`
20. `success`

---

## 4. Idempotency & Replay Attack Defense
1. **Timestamp Check:** Webhook timestamps older than 5 minutes are flagged for audit review.
2. **Database Deduplication:** Each incoming event is written to `WebhookEvent` with `payload_hash` and `event_id` unique constraints inside a serializable transaction. Duplicate events are silently acknowledged with HTTP 200 without reprocessing.

