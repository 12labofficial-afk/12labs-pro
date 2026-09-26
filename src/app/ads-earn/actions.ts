'use server';

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml, wholeCredits, getISTDateString } from '@/lib/utils';
import {
  getAdsEarnSettings,
  createAdFromRazorpayPayment,
  ADS_EARN_MIN_BUDGET_INR,
  ADS_EARN_MAX_BUDGET_INR,
} from '@/lib/ad-budget-purchase';
import type { AdCampaign } from '@/lib/types';

// A single watch session can't earn credits for more than this many minutes
// regardless of what the client reports — a sanity ceiling independent of
// the ad's own length, since watchedSeconds is client-reported input.
const MAX_SINGLE_WATCH_MINUTES = 20;

// ============================================================
// ADVERTISER — fund a budget, submit a video, see stats
// ============================================================

export async function createAdBudgetOrder(
  userId: string,
  userName: string | null,
  userEmail: string | null,
  amountInr: number
): Promise<
  | { success: true; order: { id: string; amount: number; currency: string; key_id: string } }
  | { success: false; error: string }
> {
  if (!userId || !userEmail) {
    return { success: false, error: 'Please sign in to continue.' };
  }
  const amount = Math.round(amountInr);
  if (!Number.isFinite(amount) || amount < ADS_EARN_MIN_BUDGET_INR || amount > ADS_EARN_MAX_BUDGET_INR) {
    return { success: false, error: `Budget must be between ₹${ADS_EARN_MIN_BUDGET_INR} and ₹${ADS_EARN_MAX_BUDGET_INR}.` };
  }

  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const publicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || keyId;
  if (!keyId || !keySecret || !publicKeyId) {
    return { success: false, error: 'The payment system is not configured on the server.' };
  }

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: `ad_budget_${Date.now()}`,
      notes: {
        type: 'ad_budget_topup',
        userId,
        userName: userName || '',
        userEmail,
      },
    });
    return {
      success: true,
      order: { id: order.id, amount: Number(order.amount), currency: order.currency, key_id: publicKeyId },
    };
  } catch (error: any) {
    reportServerError('src/app/ads-earn/actions.ts:createAdBudgetOrder', error, { userId });
    const message = error?.error?.description || error.message || 'Could not create payment order.';
    return { success: false, error: message };
  }
}

/**
 * Client-driven confirm, called from the Razorpay checkout `handler`
 * callback — same shape/verification as confirmRazorpayCreditPayment in
 * buy-credits/actions.ts. The webhook (src/app/api/webhook/razorpay/route.ts)
 * calls the SAME underlying createAdFromRazorpayPayment as a resilient
 * fallback if this call never lands; the order id as the ads/{id} key makes
 * both paths idempotent.
 */
export async function confirmAdBudgetPayment(params: {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}): Promise<{ success: true; adId: string } | { success: false; error: string }> {
  const { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature } = params || ({} as any);
  try {
    if (!paymentId || !orderId || !signature) {
      return { success: false, error: 'Missing payment details.' };
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error('Razorpay keys are not configured on the server.');

    const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const sigBuf = Buffer.from(String(signature), 'utf8');
    if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
      return { success: false, error: 'Payment signature could not be verified.' };
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    let payment: any = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId) {
      return { success: false, error: 'Payment does not belong to this order.' };
    }

    if (payment.status === 'authorized') {
      payment = await razorpay.payments.capture(paymentId, payment.amount, payment.currency);
    }
    if (payment.status !== 'captured') {
      return { success: false, error: `Payment is ${payment.status}, not completed.` };
    }

    const order: any = await razorpay.orders.fetch(orderId);
    const notes = { ...(order?.notes || {}), ...(payment?.notes || {}) };
    if (notes.type !== 'ad_budget_topup') {
      return { success: false, error: 'Not an ad budget payment.' };
    }

    const { database } = initializeFirebase();
    await createAdFromRazorpayPayment(database, payment, order);

    return { success: true, adId: orderId };
  } catch (error: any) {
    reportServerError('src/app/ads-earn/actions.ts:confirmAdBudgetPayment', error, { paymentId: paymentId || 'unknown', orderId: orderId || 'unknown' });
    return { success: false, error: error?.error?.description || error.message || 'Could not confirm payment.' };
  }
}

export async function submitAdVideoLink(
  adId: string,
  advertiserId: string,
  videoUrl: string
): Promise<{ success: boolean; error?: string }> {
  if (!adId || !advertiserId) return { success: false, error: 'Missing ad or user id.' };
  const url = (videoUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { success: false, error: 'Please enter a valid video link (must start with http:// or https://).' };
  }

  const { database } = initializeFirebase();
  try {
    const adRef = database.ref(`ads/${adId}`);
    const snap = await adRef.get();
    if (!snap.exists()) return { success: false, error: 'Ad not found.' };
    const ad = snap.val();
    if (ad.advertiserId !== advertiserId) return { success: false, error: 'You do not own this ad.' };
    if (ad.status !== 'pending_link' && ad.status !== 'rejected') {
      return { success: false, error: 'This ad already has a video link submitted.' };
    }

    await adRef.update({
      videoUrl: url,
      status: 'pending_review',
      submittedAt: new Date().toISOString(),
      rejectionReason: null,
    });

    await sendToTelegram(
      `📢 <b>Ad Awaiting Review</b>\n<b>Advertiser:</b> ${escapeHtml(ad.advertiserEmail || 'unknown')}\n<b>Video:</b> ${escapeHtml(url)}\n<b>Budget:</b> ₹${ad.budgetInr}\nReview it in Admin → Ads Review.`
    ).catch((e: any) => { reportServerError('src/app/ads-earn/actions.ts:submitLinkTelegram', e); return null; });

    return { success: true };
  } catch (error: any) {
    reportServerError('src/app/ads-earn/actions.ts:submitAdVideoLink', error, { adId });
    return { success: false, error: error.message || 'Could not submit video link.' };
  }
}

export async function getMyAds(advertiserId: string): Promise<AdCampaign[]> {
  if (!advertiserId) return [];
  const { database } = initializeFirebase();
  try {
    const snap = await database.ref('ads').orderByChild('advertiserId').equalTo(advertiserId).get();
    const val = snap.val() || {};
    return Object.entries(val)
      .map(([id, data]: [string, any]) => ({ id, ...data } as AdCampaign))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error: any) {
    reportServerError('src/app/ads-earn/actions.ts:getMyAds', error, { advertiserId });
    return [];
  }
}

// ============================================================
// VIEWER — watch a video, earn credits
// ============================================================

export async function getActiveAdForViewer(
  userId: string
): Promise<{ ad: AdCampaign | null; ratePerMinute: number }> {
  const { database } = initializeFirebase();
  const { ratePerMinute } = await getAdsEarnSettings(database);
  if (!userId) return { ad: null, ratePerMinute };

  try {
    const snap = await database.ref('ads').orderByChild('status').equalTo('active').get();
    const val = snap.val() || {};
    const candidates = Object.entries(val).map(([id, data]: [string, any]) => ({ id, ...data } as AdCampaign));
    const eligible = candidates.filter((ad) => ad.spentCredits < ad.budgetCredits);
    if (eligible.length === 0) return { ad: null, ratePerMinute };

    // A viewer earns from a given ad only once — skip anything already claimed.
    const alreadyWatched = await Promise.all(
      eligible.map((ad) => database.ref(`adViews/${ad.id}/${userId}`).get().then((s: any) => s.exists()))
    );
    const fresh = eligible.filter((_, i) => !alreadyWatched[i]);
    if (fresh.length === 0) return { ad: null, ratePerMinute };

    const picked = fresh[Math.floor(Math.random() * fresh.length)];
    return { ad: picked, ratePerMinute };
  } catch (error: any) {
    reportServerError('src/app/ads-earn/actions.ts:getActiveAdForViewer', error, { userId });
    return { ad: null, ratePerMinute };
  }
}

export async function recordAdWatch(
  userId: string,
  adId: string,
  watchedSeconds: number
): Promise<{ success: boolean; creditsEarned: number; newCredits?: number; error?: string }> {
  if (!userId || !adId) return { success: false, creditsEarned: 0, error: 'Missing user or ad id.' };
  const seconds = Math.max(0, Math.min(Math.floor(watchedSeconds || 0), MAX_SINGLE_WATCH_MINUTES * 60));
  if (seconds < 5) return { success: false, creditsEarned: 0, error: 'Watch time too short to count.' };

  const { firestore, database } = initializeFirebase();

  try {
    // 1. Claim this (ad, viewer) pair atomically — a viewer earns from a
    // given ad only once, ever. Placeholder written now, finalized in
    // step 4 once the actual payout is known.
    const viewRef = database.ref(`adViews/${adId}/${userId}`);
    const claim = await viewRef.transaction((current: any) => {
      if (current !== null) return; // abort — already claimed
      return { claimedAt: new Date().toISOString(), watchedSeconds: seconds, creditsEarned: 0 };
    });
    if (!claim.committed) {
      return { success: false, creditsEarned: 0, error: 'You have already earned credits from this ad.' };
    }

    const { ratePerMinute, dailyCap } = await getAdsEarnSettings(database);
    const desiredCredits = Math.floor((seconds / 60) * ratePerMinute);

    // 2. Cap against this viewer's daily earning limit (every ad combined).
    const today = getISTDateString();
    const dailyRef = database.ref(`adDailyEarnings/${userId}/${today}`);
    let award1 = 0;
    await dailyRef.transaction((current: any) => {
      const currentVal = Number(current) || 0;
      const allowed = Math.max(0, dailyCap - currentVal);
      award1 = Math.min(desiredCredits, allowed);
      return currentVal + award1;
    });

    // 3. Cap against the ad's own remaining budget, and update its stats
    // (this is what the advertiser's dashboard reads).
    const adRef = database.ref(`ads/${adId}`);
    let award2 = 0;
    let adGone = false;
    await adRef.transaction((current: any) => {
      if (!current || current.status !== 'active') { adGone = true; return; } // abort
      const remaining = Math.max(0, (current.budgetCredits || 0) - (current.spentCredits || 0));
      award2 = Math.min(award1, remaining);
      const newSpent = (current.spentCredits || 0) + award2;
      return {
        ...current,
        spentCredits: newSpent,
        viewCount: (current.viewCount || 0) + 1,
        totalWatchSeconds: (current.totalWatchSeconds || 0) + seconds,
        status: newSpent >= (current.budgetCredits || 0) ? 'exhausted' : current.status,
      };
    });

    const finalAwarded = adGone ? 0 : award2;

    // 4. Finalize the view claim with the real numbers.
    await viewRef.set({ claimedAt: new Date().toISOString(), watchedSeconds: seconds, creditsEarned: finalAwarded });

    if (finalAwarded <= 0) {
      return { success: true, creditsEarned: 0 };
    }

    // 5. Pay out — the user's balance lives in Firestore, the ledger
    // entry (same as every other credit-earning path) in RTDB.
    let newCredits = 0;
    const userRef = firestore.collection('users').doc(userId);
    await firestore.runTransaction(async (transaction: any) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('User profile not found.');
      const current = userDoc.data()?.credits || 0;
      newCredits = wholeCredits(current + finalAwarded);
      transaction.update(userRef, { credits: newCredits });
    });

    await database.ref(`creditHistory/${userId}`).push({
      amount: finalAwarded,
      reason: 'Ads & Earn: watched ad video',
      timestamp: new Date().toISOString(),
    }).catch((e: any) => { reportServerError('src/app/ads-earn/actions.ts:creditHistory', e); return null; });

    return { success: true, creditsEarned: finalAwarded, newCredits };
  } catch (error: any) {
    reportServerError('src/app/ads-earn/actions.ts:recordAdWatch', error, { userId, adId });
    return { success: false, creditsEarned: 0, error: error.message || 'Could not record ad watch.' };
  }
}
