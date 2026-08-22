import { NextRequest, NextResponse } from 'next/server';
import { syncAllPendingSubscriptions } from '@/app/actions';

export const dynamic = 'force-dynamic';

/**
 * Automated Cron Endpoint for Weekly Consistency Grants
 * Can be called via cron scheduler (e.g. Vercel Cron, Google Cloud Scheduler, GitHub Actions, or internal pings)
 * GET or POST /api/cron/subscription-grants
 */
export async function GET(req: NextRequest) {
  try {
    const result = await syncAllPendingSubscriptions();
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Cron execution failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
