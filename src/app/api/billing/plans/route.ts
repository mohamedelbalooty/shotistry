import { NextResponse } from 'next/server';
import { SUBSCRIPTION_PLANS, TOP_UP_PACKS } from '../../../../lib/pricing/plans';
import { Country } from '../../../../lib/types';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get('country') || 'SA').toUpperCase() as Country;

  return NextResponse.json({
    country,
    currency: country === 'SA' ? 'SAR' : 'EGP',
    plans: SUBSCRIPTION_PLANS,
    topUpPacks: TOP_UP_PACKS,
  });
}

