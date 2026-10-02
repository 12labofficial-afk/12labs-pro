import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

/**
 * Thin scheduler. All the real work (weekly credits, tickets, queued plans,
 * Telegram logs) lives in the website: GET {SITE_URL}/api/cron/subscription-grants
 * (src/app/api/cron/subscription-grants/route.ts). This function only knocks
 * on that URL every hour, so changing grant logic = deploy the website only;
 * this file never needs redeploying.
 *
 * functions/.env:
 *   SITE_URL=https://www.12labs.in      (no trailing slash)
 *   CRON_SECRET=...                     (same value as the website's CRON_SECRET)
 */
async function callWebsite(): Promise<{ ok: boolean; status: number; body: string }> {
  const siteUrl = (process.env.SITE_URL || '').replace(/\/+$/, '');
  if (!siteUrl) throw new Error('SITE_URL is not set in functions/.env');

  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${siteUrl}/api/cron/subscription-grants`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const body = (await res.text()).slice(0, 500);
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export const grantWeeklySubscriptionCredits = onSchedule(
  { schedule: 'every 1 hours', timeoutSeconds: 180, retryCount: 1 },
  async () => {
    const r = await callWebsite();
    if (!r.ok) {
      logger.error(`Website cron answered ${r.status}`, r.body);
      throw new Error(`Website cron failed with ${r.status}`); // shows up in Firebase logs, triggers the retry
    }
    logger.info('Website cron ok', r.body);
  },
);

/** Same call on demand (browser/curl). Protected by CRON_SECRET as a Bearer token. */
export const grantWeeklySubscriptionCreditsManual = onRequest(async (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (expected && req.get('authorization') !== `Bearer ${expected}`) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  try {
    const r = await callWebsite();
    res.status(r.ok ? 200 : 502).json({ success: r.ok, status: r.status, body: r.body });
  } catch (e: any) {
    logger.error('Manual trigger failed', e);
    res.status(500).json({ success: false, error: e.message || 'Failed' });
  }
});
