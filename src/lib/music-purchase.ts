import type * as admin from 'firebase-admin';
import { after } from 'next/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

/**
 * 🎵🔒 MUSIC TRACK PURCHASE — shared grant logic
 * ---------------------------------------------
 * Unlocks a paid track by writing musicPurchases/{userId}/{trackId} in RTDB
 * (the same store publicMusicLibrary itself lives in — see
 * src/app/music-library/actions.ts). Idempotent via processedPayments
 * (atomic .create(), same pattern as handleCreditPurchase in
 * src/lib/credit-purchase.ts), so it's safe to call this from multiple
 * places for the same payment — whichever call arrives first wins, the
 * rest are no-ops.
 *
 * 🔴 FIX: this used to live ONLY inside the webhook route
 * (src/app/api/webhook/razorpay/route.ts) with no client-side confirm
 * fallback at all — unlike every other purchase type in this app (credits,
 * store products), which all have BOTH a webhook path AND a post-checkout
 * client confirm calling this same shared function. A music purchase whose
 * webhook delivery got missed (mobile tab backgrounded while the user is
 * in their UPI app, the single most common cause of this class of bug —
 * see the Razorpay Ground Truth admin panel) had NO recovery path at all:
 * money charged, "Payment Secured!" shown, but the track never unlocked.
 * Extracted here so both the webhook and a new client confirm action
 * (confirmMusicTrackPurchaseAction in src/app/music-library/actions.ts)
 * can call the exact same grant logic.
 */
export async function handleMusicTrackPurchase(
    firestore: admin.firestore.Firestore,
    database: admin.database.Database,
    paymentEntity: any,
    orderEntity?: any
) {
    const notes = { ...(orderEntity?.notes || {}), ...(paymentEntity?.notes || {}) };
    const userId = notes.userId;
    const trackId = notes.trackId;
    const paymentId = paymentEntity?.id || orderEntity?.id || `pay_${Date.now()}`;
    const amountInInr = (paymentEntity?.amount || orderEntity?.amount || 0) / 100;
    const userEmail = notes.userEmail || paymentEntity?.email || '';
    const trackTitle = notes.trackTitle || 'Untitled Track';

    if (!userId || !trackId) {
        throw new Error("Missing userId/trackId in music track purchase metadata.");
    }

    // Atomic .create() — Firestore rejects it outright if the document
    // already exists, so only ONE of several concurrent/duplicate calls
    // for the same payment (webhook retries, client confirm racing the
    // webhook, an admin manual-grant) can ever win it.
    const processedRef = firestore.collection('processedPayments').doc(paymentId);
    try {
        await processedRef.create({
            type: 'music_track_purchase',
            userId,
            trackId,
            amount: amountInInr,
            processedAt: new Date().toISOString(),
        });
    } catch (e: any) {
        reportServerError('src/lib/music-purchase.ts:create', e);
        // ALREADY_EXISTS (Firestore error code 6) — another call for this
        // same payment got here first (already granted). Nothing left to do.
        if (e?.code === 6 || /already exists/i.test(e?.message || '')) return { alreadyProcessed: true };
        throw e;
    }

    await database.ref(`musicPurchases/${userId}/${trackId}`).set({
        trackId,
        purchasedAt: new Date().toISOString(),
        amount: amountInInr,
        paymentId,
    });

    // 🔴 FIX: was awaited — held the webhook's response hostage to
    // Telegram's own round-trip, even though the unlock is already fully
    // committed by this point. Deferred via after() instead of a naked
    // fire-and-forget: the response returns immediately, but Vercel keeps
    // the function alive until this actually finishes, so the alert is
    // never silently dropped mid-flight.
    after(() => sendToTelegram(
        `<b>💎 MUSIC TRACK PURCHASED</b>\n\n` +
        `<b>Track:</b> ${escapeHtml(trackTitle)}\n` +
        `<b>User:</b> ${escapeHtml(userEmail || userId)}\n` +
        `<b>Amount:</b> ₹${amountInInr}\n` +
        `<b>Payment ID:</b> <code>${escapeHtml(paymentId)}</code>`
    ).catch((e: any) => { reportServerError('src/lib/music-purchase.ts:telegram', e); return null; }));

    return { alreadyProcessed: false };
}
