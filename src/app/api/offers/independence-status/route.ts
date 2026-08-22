import { NextRequest, NextResponse } from 'next/server';
import { getIndependenceOfferStatus } from '@/app/actions/independence-offer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || undefined;
    const status = await getIndependenceOfferStatus(userId);
    return NextResponse.json(status);
  } catch (error: any) {
    console.error('[API /offers/independence-status] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch independence offer status' },
      { status: 500 }
    );
  }
}
