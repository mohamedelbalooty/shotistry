import { NextResponse } from 'next/server';

export async function GET() {
  const metrics = {
    totalUsers: 1480,
    payingSubscribers: 184,
    mrrUsd: 5880,
    mrrSar: 16250,
    mrrEgp: 76400,
    grossMarginPercent: 76.8,
    aiExpensesUsd: 1360,
    generationSuccessRate: 98.4,
    totalImagesGenerated: 42180,
    systemStatus: {
      geminiEngine: 'HEALTHY',
      paymobGateways: 'OPERATIONAL',
      database: 'HEALTHY',
      storage: 'OPERATIONAL',
    },
  };

  return NextResponse.json(metrics);
}
