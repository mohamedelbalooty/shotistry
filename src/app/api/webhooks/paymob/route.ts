import { NextResponse } from 'next/server';
import { PaymobSecurity } from '../../../../lib/paymob/paymob-hmac';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let body: any;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const secretKey = process.env.PAYMOB_HMAC_SECRET || 'placeholder_hmac_secret_sha512';

    // Case 1: Subscription / Recurring Webhook
    if (body.trigger_type && body.subscription_data) {
      const isVerified = PaymobSecurity.verifySubscriptionWebhook(body, secretKey);

      if (!isVerified && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
      }

      const { trigger_type, subscription_data } = body;
      console.log(`[Paymob Webhook] Subscription event: ${trigger_type} for ID: ${subscription_data.id}`);

      // Subscription event handling
      // In production, updates Subscription entity in PostgreSQL and grants monthly credits
      return NextResponse.json({
        received: true,
        type: 'SUBSCRIPTION',
        event: trigger_type,
        subscriptionId: subscription_data.id,
      });
    }

    // Case 2: Standard Transaction Webhook (One-off credit top-ups)
    const receivedHmac = request.headers.get('paymob-hmac') || body.hmac;

    if (receivedHmac) {
      const isVerified = PaymobSecurity.verifyTransactionWebhook(receivedHmac, body, secretKey);

      if (!isVerified && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
      }

      console.log(`[Paymob Webhook] Transaction processed for Order: ${body.order?.id || body.id}`);

      return NextResponse.json({
        received: true,
        type: 'TRANSACTION',
        success: body.success,
      });
    }

    return NextResponse.json({ received: true, note: 'Processed payload' }, { status: 200 });
  } catch (error: any) {
    console.error('[Paymob Webhook Error]:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
