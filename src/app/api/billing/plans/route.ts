import { SUBSCRIPTION_PLANS, TOP_UP_PACKS } from '../../../../lib/pricing/plans.ts';
import type { Country } from '../../../../lib/types/index.ts';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get('country') || 'SA').toUpperCase() as Country;

  return Response.json({
    country,
    currency: country === 'SA' ? 'SAR' : 'EGP',
    plans: SUBSCRIPTION_PLANS,
    topUpPacks: TOP_UP_PACKS,
  });
}
