import { SUBSCRIPTION_PLANS, TOP_UP_PACKS } from '../../../../lib/pricing/plans.ts';
import {
  getAllModelResolutionCosts,
  getCreditWeightForGeneration,
} from '../../../../lib/pricing/model-costs.ts';
import type { Country } from '../../../../lib/types/index.ts';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = (searchParams.get('country') || 'SA').toUpperCase() as Country;
  const standardModelCosts = getAllModelResolutionCosts('standard').map((item) => ({
    ...item,
    creditWeight: getCreditWeightForGeneration(item.modelId, item.imageSize),
  }));

  return Response.json({
    country,
    currency: country === 'SA' ? 'SAR' : 'EGP',
    plans: SUBSCRIPTION_PLANS,
    topUpPacks: TOP_UP_PACKS,
    modelCosts: standardModelCosts,
  });
}
