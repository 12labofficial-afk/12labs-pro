import { NextRequest, NextResponse } from 'next/server';
import { syncAllPendingSubscriptions } from '@/app/actions';
import { SERVER_INTERNAL } from '@/lib/auth-guard';
import { reportServerError } from '@/lib/report-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Automated Cron Endpoint for Weekly Consistency Grants
 * Optional batch trigger for any scheduler. The same sync also runs whenever a
 * user opens the app. If CRON_SECRET is set, send `Authorization: Bearer <CRON_SECRET>`;
 * if it is not set the endpoint is open (it only grants installments that are
 * already due, so repeated calls are harmless).
 * GET or POST /api/cron/subscription-grants
 */
export async function GET(req: NextRequest) {
  // Vercel signs cron-triggered requests with this header. If CRON_SECRET is
  // set in the environment, reject any request that doesn't carry it so this
  // endpoint can't be triggered by outsiders.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await syncAllPendingSubscriptions(SERVER_INTERNAL);
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error: any) {
            reportServerError('src/app/api/cron/subscription-grants/route.ts:29', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Cron execution failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
