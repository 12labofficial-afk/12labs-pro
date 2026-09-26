import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

/**
 * 📢 Ads & Earn — shared settings + the one place a paid ad-budget top-up
 * actually turns into an `ads/{id}` record. Used by BOTH the client-side
 * confirm action (src/app/ads-earn/actions.ts, called right after Razorpay
 * checkout) AND the Razorpay webhook (src/app/api/webhook/razorpay/route.ts,
 * the resilient fallback if the client-side call never lands) — same
 * pattern as credit-purchase.ts for regular credit purchases.
 *
 * Idempotency: the Razorpay order id IS the ads/{id} key, so calling this
 * twice for the same order (client confirm + webhook, in either order) just
 * no-ops the second time instead of creating a duplicate ad or double
 * counting anything.
 */

export const ADS_EARN_MIN_BUDGET_INR = 50;
export const ADS_EARN_MAX_BUDGET_INR = 20000;

const FALLBACK_RATE_PER_MINUTE = 10; // credits a viewer earns per minute watched
const FALLBACK_DAILY_CAP = 150; // max credits/day a single viewer can earn from ads, total
const FALLBACK_INR_PER_MINUTE = 5; // ₹ an advertiser pays to fund one minute of viewer watch-time

export interface AdsEarnSettings {
  ratePerMinute: number;
  dailyCap: number;
  inrPerMinute: number;
}

/**
 * 🔢 The advertiser's budget is priced in ₹/minute of funded watch-time
 * (adsInrPerMinute — this is what the budget slider divides by to show
 * "₹50 → 10 min"), completely independent from what a viewer actually
 * earns per minute watched (adsEarnRatePerMinute, in credits). The ad's
 * credits pool is derived from BOTH: fundedMinutes * ratePerMinute — so
 * changing either setting in the admin panel immediately changes what a
 * given budget buys, without the two rates needing to move together.
 */
export async function getAdsEarnSettings(database: any): Promise<AdsEarnSettings> {
  try {
    const snap = await database.ref('settings/app').get();
    const v = snap.val() || {};
    const rate = Number(v.adsEarnRatePerMinute);
    const cap = Number(v.adsEarnDailyCapPerUser);
    const inrPerMin = Number(v.adsInrPerMinute);
    return {
      ratePerMinute: Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_RATE_PER_MINUTE,
      dailyCap: Number.isFinite(cap) && cap > 0 ? cap : FALLBACK_DAILY_CAP,
      inrPerMinute: Number.isFinite(inrPerMin) && inrPerMin > 0 ? inrPerMin : FALLBACK_INR_PER_MINUTE,
    };
  } catch (e) {
    reportServerError('src/lib/ad-budget-purchase.ts:getAdsEarnSettings', e);
    return { ratePerMinute: FALLBACK_RATE_PER_MINUTE, dailyCap: FALLBACK_DAILY_CAP, inrPerMinute: FALLBACK_INR_PER_MINUTE };
  }
}

export function computeFundedMinutes(budgetInr: number, inrPerMinute: number): number {
  if (!Number.isFinite(budgetInr) || !Number.isFinite(inrPerMinute) || inrPerMinute <= 0) return 0;
  return budgetInr / inrPerMinute;
}

export async function createAdFromRazorpayPayment(
  database: any,
  payment: any,
  order: any
): Promise<void> {
  const notes = { ...(order?.notes || {}), ...(payment?.notes || {}) };
  if (notes.type !== 'ad_budget_topup') return;

  const orderId: string | undefined = payment?.order_id || order?.id;
  const paymentId: string | undefined = payment?.id;
  const userId: string | undefined = notes.userId;
  if (!orderId || !paymentId || !userId) {
    reportServerError('src/lib/ad-budget-purchase.ts:createAdFromRazorpayPayment', new Error('Missing orderId/paymentId/userId on ad_budget_topup payment'));
    return;
  }

  const adRef = database.ref(`ads/${orderId}`);
  const existing = await adRef.get();
  if (existing.exists()) return; // already created by the other path (client confirm vs webhook)

  const amountInr = Math.round((payment.amount || order?.amount || 0)) / 100;
  const { ratePerMinute, inrPerMinute } = await getAdsEarnSettings(database);
  const budgetMinutes = computeFundedMinutes(amountInr, inrPerMinute);
  const budgetCredits = Math.floor(budgetMinutes * ratePerMinute);

  await adRef.set({
    advertiserId: userId,
    advertiserName: notes.userName || 'Unknown',
    advertiserEmail: notes.userEmail || 'unknown',
    status: 'pending_link',
    videoUrl: null,
    budgetInr: amountInr,
    budgetMinutes,
    budgetCredits,
    spentCredits: 0,
    viewCount: 0,
    totalWatchSeconds: 0,
    paymentId,
    orderId,
    createdAt: new Date().toISOString(),
  });

  await sendToTelegram(
    `📢 <b>New Ad Budget Funded</b>\n<b>Advertiser:</b> ${escapeHtml(notes.userEmail || 'unknown')}\n<b>Budget:</b> ₹${amountInr} (${budgetMinutes.toFixed(1)} min)\n<b>Credits Pool:</b> ${budgetCredits.toLocaleString()}\n<b>Order:</b> <code>${escapeHtml(orderId)}</code>\nWaiting for them to submit a video link.`
  ).catch((e: any) => { reportServerError('src/lib/ad-budget-purchase.ts:telegram', e); return null; });
}
