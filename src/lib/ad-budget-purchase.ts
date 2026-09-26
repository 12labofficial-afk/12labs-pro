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
const FALLBACK_RUPEE_TO_CREDITS = 50; // credits funded into an ad's pool per ₹1 of budget

export interface AdsEarnSettings {
  ratePerMinute: number;
  dailyCap: number;
  rupeeToCreditsRate: number;
}

export async function getAdsEarnSettings(database: any): Promise<AdsEarnSettings> {
  try {
    const snap = await database.ref('settings/app').get();
    const v = snap.val() || {};
    const rate = Number(v.adsEarnRatePerMinute);
    const cap = Number(v.adsEarnDailyCapPerUser);
    const conv = Number(v.adsRupeeToCreditsRate);
    return {
      ratePerMinute: Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_RATE_PER_MINUTE,
      dailyCap: Number.isFinite(cap) && cap > 0 ? cap : FALLBACK_DAILY_CAP,
      rupeeToCreditsRate: Number.isFinite(conv) && conv > 0 ? conv : FALLBACK_RUPEE_TO_CREDITS,
    };
  } catch (e) {
    reportServerError('src/lib/ad-budget-purchase.ts:getAdsEarnSettings', e);
    return { ratePerMinute: FALLBACK_RATE_PER_MINUTE, dailyCap: FALLBACK_DAILY_CAP, rupeeToCreditsRate: FALLBACK_RUPEE_TO_CREDITS };
  }
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
  const { rupeeToCreditsRate } = await getAdsEarnSettings(database);
  const budgetCredits = Math.floor(amountInr * rupeeToCreditsRate);

  await adRef.set({
    advertiserId: userId,
    advertiserName: notes.userName || 'Unknown',
    advertiserEmail: notes.userEmail || 'unknown',
    status: 'pending_link',
    videoUrl: null,
    budgetInr: amountInr,
    budgetCredits,
    spentCredits: 0,
    viewCount: 0,
    totalWatchSeconds: 0,
    paymentId,
    orderId,
    createdAt: new Date().toISOString(),
  });

  await sendToTelegram(
    `📢 <b>New Ad Budget Funded</b>\n<b>Advertiser:</b> ${escapeHtml(notes.userEmail || 'unknown')}\n<b>Budget:</b> ₹${amountInr}\n<b>Credits Pool:</b> ${budgetCredits.toLocaleString()}\n<b>Order:</b> <code>${escapeHtml(orderId)}</code>\nWaiting for them to submit a video link.`
  ).catch((e: any) => { reportServerError('src/lib/ad-budget-purchase.ts:telegram', e); return null; });
}
