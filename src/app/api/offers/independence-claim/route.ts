import { NextRequest, NextResponse } from 'next/server';
import { claimIndependenceCashback } from '@/app/actions/independence-offer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body || {};

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    const result = await claimIndependenceCashback(userId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API /offers/independence-claim] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to claim cashback' },
      { status: 500 }
    );
  }
}
