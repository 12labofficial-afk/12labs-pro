'use server';

import crypto from 'crypto';
import Razorpay from 'razorpay';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';
import { handleMusicTrackPurchase } from '@/lib/music-purchase';

interface RazorpayOrderOutput {
  id: string;
  amount: number;
  currency: string;
  key_id: string;
}

/**
 * 🔒 MUSIC TRACK UNLOCK — ORDER CREATION
 * ---------------------------------------
 * Mirrors the pattern in src/app/buy-credits/actions.ts — a Razorpay order
 * is created server-side (price is read from RTDB `publicMusicLibrary`,
 * NEVER trusted from the client) with the purchase details stamped into
 * `notes`. The webhook (src/app/api/webhook/razorpay/route.ts) reads those
 * same notes to know which user unlocked which track once payment clears.
 */
export async function createOrderForMusicTrack(
  trackId: string,
  user: { uid: string; email: string; name?: string }
): Promise<{ success: true; order: RazorpayOrderOutput } | { success: false; error: string }> {
  try {
    if (!user?.uid || !user?.email) {
      return { success: false, error: 'Sign in required to purchase a track.' };
    }
    if (!trackId) {
      return { success: false, error: 'Missing track.' };
    }

    const { database } = initializeFirebase();
    const trackSnap = await database.ref(`publicMusicLibrary/${trackId}`).get();
    if (!trackSnap.exists()) {
      return { success: false, error: 'Track not found.' };
    }
    const track = trackSnap.val() || {};
    const price = Number(track.price) || 0;
    if (price <= 0) {
      return { success: false, error: 'This track is free — no purchase needed.' };
    }

    // Already owns it? Don't let them pay twice.
    const purchasedSnap = await database.ref(`musicPurchases/${user.uid}/${trackId}`).get();
    if (purchasedSnap.exists()) {
      return { success: false, error: 'You already own this track.' };
    }

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const razorpayPublicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;

    if (!razorpayKeyId || !razorpayKeySecret || !razorpayPublicKeyId) {
      return { success: false, error: 'Payment system is not configured.' };
    }

    const razorpay = new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });
    const amountInPaise = Math.round(price * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `music_${trackId}_${Date.now()}`.slice(0, 40),
      notes: {
        type: 'music_track_purchase',
        trackId,
        userId: user.uid,
        userEmail: user.email,
        trackTitle: (track.prompt || 'Untitled Track').toString().slice(0, 200),
      },
    });

    if (!order) throw new Error('Razorpay order creation returned empty.');

    return {
      success: true,
      order: {
        id: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        key_id: razorpayPublicKeyId,
      },
    };
  } catch (e: any) {
    reportServerError('src/app/music-library/actions.ts#1', e);
    return { success: false, error: e.message || 'Order creation failed.' };
  }
}

/**
 * 🔒 MUSIC TRACK UNLOCK — POST-CHECKOUT CLIENT CONFIRM
 * ---------------------------------------------
 * 🔴 FIX: unlocking a purchased track used to rely SOLELY on the Razorpay
 * webhook (src/app/api/webhook/razorpay/route.ts) — every other purchase
 * type in this app (credits, store products) has BOTH a webhook path AND
 * this kind of client-side confirm as a fast, redundant path, but music
 * purchases had no fallback at all. If the webhook delivery got missed —
 * the single most common cause being a mobile tab getting backgrounded/
 * suspended while the user is off in their UPI app approving payment —
 * the track never unlocked: money charged, "Payment Secured!" shown to
 * the user, nothing after that, with no self-healing path.
 *
 * Called from music-library/page.tsx's Razorpay checkout `handler`
 * callback right after a successful payment. Mirrors
 * confirmRazorpayCreditPayment in src/app/buy-credits/actions.ts exactly:
 * nothing from the browser is trusted beyond the IDs — the signature is
 * checked with the key secret, and status/notes are re-read from
 * Razorpay's own API. Safe to call even if the webhook ALSO fires for the
 * same payment — handleMusicTrackPurchase is idempotent via
 * processedPayments, so whichever arrives first grants the unlock and the
 * other is a no-op.
 */
export async function confirmMusicTrackPurchaseAction(params: {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}): Promise<{ success: boolean; error?: string }> {
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

    // With auto-capture off in the Razorpay dashboard a successful payment
    // stays "authorized" and is auto-refunded after a few days, and no
    // payment.captured / order.paid webhook is ever sent. Capture it here.
    if (payment.status === 'authorized') {
      payment = await razorpay.payments.capture(paymentId, payment.amount, payment.currency);
    }
    if (payment.status !== 'captured') {
      return { success: false, error: `Payment is ${payment.status}, not completed.` };
    }

    const order: any = await razorpay.orders.fetch(orderId);
    const notes = { ...(order?.notes || {}), ...(payment?.notes || {}) };
    if (notes.type !== 'music_track_purchase') {
      return { success: false, error: 'Not a music track purchase.' };
    }

    const { firestore, database } = initializeFirebase();
    await handleMusicTrackPurchase(firestore, database, payment, order);
    return { success: true };
  } catch (error: any) {
    reportServerError('src/app/music-library/actions.ts#confirmPurchase', error, { paymentId: paymentId || 'unknown', orderId: orderId || 'unknown' });
    return { success: false, error: error?.error?.description || error.message || 'Could not confirm payment.' };
  }
}
