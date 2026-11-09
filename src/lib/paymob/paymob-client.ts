import crypto from 'node:crypto';
import type { Country, Currency } from '../types/index.ts';
import { getPaymobConfig, validatePaymobEnvironment, type PaymobRegionConfig } from './paymob-config.ts';
import { isMockFallbackAllowed } from '../config/env.ts';

export interface BillingDataInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  apartment?: string;
  floor?: string;
  street?: string;
  building?: string;
  city?: string;
  country?: string;
  state?: string;
  postalCode?: string;
}

export interface IntentionItemInput {
  name: string;
  amount: number;
  description?: string;
  quantity?: number;
}

export interface CreatePaymentIntentionParams {
  country: Country;
  amountCents: number;
  currency: Exclude<Currency, 'USD'>;
  items: IntentionItemInput[];
  billingData: BillingDataInput;
  specialReference: string;
  paymentMethod?: string;
  notificationUrl?: string;
  redirectionUrl?: string;
  extras?: Record<string, unknown>;
}

export interface PaymentIntentionResult {
  intentionId: string;
  orderId: string;
  clientSecret: string;
  unifiedCheckoutUrl: string;
  isMock: boolean;
}

export class PaymobClient {
  private configEG: PaymobRegionConfig;
  private configSA: PaymobRegionConfig;

  constructor() {
    this.configEG = getPaymobConfig('EG');
    this.configSA = getPaymobConfig('SA');
  }

  getConfig(country: Country): PaymobRegionConfig {
    return country === 'SA' ? this.configSA : this.configEG;
  }

  async createPaymentIntention(
    params: CreatePaymentIntentionParams
  ): Promise<PaymentIntentionResult> {
    const config = this.getConfig(params.country);

    // Guard: Prevent live credentials in non-production environments
    const envCheck = validatePaymobEnvironment(params.country);
    if (!envCheck.valid) {
      throw new Error(envCheck.error);
    }

    // Determine target payment method integration IDs
    const integrationIds: Array<number | string> = [];
    if (params.paymentMethod && config.integrationIds[params.paymentMethod]) {
      integrationIds.push(config.integrationIds[params.paymentMethod]);
    } else {
      for (const id of Object.values(config.integrationIds)) {
        if (!integrationIds.includes(id)) {
          integrationIds.push(id);
        }
      }
    }

    // Fallback to mock intention in test environment (unless real network is enabled) or when credentials are unconfigured
    const isMockMode =
      (process.env.NODE_ENV === 'test' && process.env.PAYMOB_ENABLE_LIVE_NETWORK !== '1') ||
      !config.isConfigured ||
      !config.secretKey;

    if (isMockMode) {
      if (isMockFallbackAllowed() || process.env.NODE_ENV === 'test') {
        const mockIntentionId = `mock_int_${crypto.randomUUID()}`;
        const mockOrderId = `ord-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const mockClientSecret = `cs_sandbox_${crypto.randomBytes(16).toString('hex')}`;
        const mockPublicKey = config.publicKey || 'pk_test_shotistry_sandbox';
        const mockUrl = `${config.baseUrl}/unifiedcheckout/?publicKey=${mockPublicKey}&clientSecret=${mockClientSecret}`;

        return {
          intentionId: mockIntentionId,
          orderId: mockOrderId,
          clientSecret: mockClientSecret,
          unifiedCheckoutUrl: mockUrl,
          isMock: true,
        };
      }

      throw new Error(
        `PAYMOB_CONFIG_ERROR: Paymob credentials are not configured for ${params.country}. Intention creation failed closed.`
      );
    }

    const payload = {
      amount: params.amountCents,
      currency: params.currency,
      payment_methods: integrationIds,
      items: params.items.map((item) => ({
        name: item.name,
        amount: item.amount,
        description: item.description || item.name,
        quantity: item.quantity ?? 1,
      })),
      billing_data: {
        first_name: params.billingData.firstName || 'Merchant',
        last_name: params.billingData.lastName || 'User',
        email: params.billingData.email,
        phone_number: params.billingData.phoneNumber || '+201000000000',
        apartment: params.billingData.apartment || 'NA',
        floor: params.billingData.floor || 'NA',
        street: params.billingData.street || 'NA',
        building: params.billingData.building || 'NA',
        shipping_method: 'PKG',
        postal_code: params.billingData.postalCode || '11511',
        city: params.billingData.city || (params.country === 'SA' ? 'Riyadh' : 'Cairo'),
        country: params.country,
        state: params.billingData.state || (params.country === 'SA' ? 'Riyadh' : 'Cairo'),
      },
      customer: {
        first_name: params.billingData.firstName || 'Merchant',
        last_name: params.billingData.lastName || 'User',
        email: params.billingData.email,
      },
      special_reference: params.specialReference,
      notification_url: params.notificationUrl,
      redirection_url: params.redirectionUrl,
      extras: params.extras ?? {},
    };

    const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/v1/intention/`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${config.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Paymob Intention API error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as Record<string, any>;
    const clientSecret = String(data.client_secret || '');
    const intentionId = String(data.id || data.intention_id || '');
    const orderId = String(data.order_id || data.order?.id || params.specialReference);
    const publicKey = config.publicKey || '';
    const unifiedCheckoutUrl = `${config.baseUrl.replace(/\/+$/, '')}/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`;

    return {
      intentionId,
      orderId,
      clientSecret,
      unifiedCheckoutUrl,
      isMock: false,
    };
  }
}
