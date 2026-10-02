
'use server';

import Razorpay from 'razorpay';
import { formatCredits, escapeHtml } from '@/lib/utils';
import { initializeFirebase } from '@/firebase/server';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { PendingPayment } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { reportServerError } from '@/lib/report-error';
import { requireAdmin } from '@/lib/auth-guard';
import { handleCreditPurchase, hasRunningAutopayCycle } from '@/lib/credit-purchase';
import { ticketsForPlan, ticketsForWeek } from '@/lib/tickets';
import { plans } from '@/lib/plans';
import { handleMusicTrackPurchase } from '@/lib/music-purchase';

/**
 * 🛰️ RAZORPAY GROUND TRUTH — recent orders pulled directly from Razorpay's
 * own API (not our own side-effect collections), cross-checked against
 * processedPayments to flag which ones never actually got credited.
 *
 * This exists because a paid Razorpay purchase can fail to credit through
 * BOTH of the normal paths at once: the client-side confirm call never
 * fires if the tab/app gets suspended while the user is away in their UPI
 * app to approve payment (common on mobile, and more aggressive for an
 * installed PWA under memory pressure), and if the webhook is also
 * misconfigured/down for that delivery, nothing on our side ever runs —
 * the payment is real on Razorpay's side, but invisible everywhere in our
 * own app. Reading Razorpay directly sidesteps that: it can never miss a
 * payment that Razorpay itself has a record of.
 */
export async function getRecentRazorpayPayments(
  idToken: string,
  count: number = 50
): Promise<{ success: boolean; payments?: any[]; message?: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };

  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { success: false, message: 'Razorpay keys are not configured on the server.' };

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const result: any = await razorpay.orders.all({ count: Math.min(Math.max(count, 1), 100), 'expand[]': 'payments' } as any);
    const { firestore } = initializeFirebase();

    const candidates: any[] = [];
    for (const order of result.items || []) {
      const notes = order.notes || {};
      // Store product orders and ad-budget top-ups are tracked/handled
      // elsewhere — skip those here. 🔴 FIX: music track purchases used to
      // be excluded too, on the same "handled elsewhere" assumption — but
      // unlike credits and store products, music purchases had NO
      // client-side confirm fallback at all (only the webhook), so a
      // missed webhook left a paid-but-unlocked track completely
      // invisible to any recovery path, admin included. Now included,
      // tagged so the panel/manual-grant can tell them apart.
      if (notes.type === 'product_order' || notes.type === 'ad_budget_topup' || notes.pendingOrderId) continue;

      const paymentItems = (order as any).payments?.items || [];
      for (const payment of paymentItems) {
        if (payment.status !== 'captured' && payment.status !== 'authorized') continue;
        const paymentNotes = { ...notes, ...(payment.notes || {}) };
        const isMusicPurchase = paymentNotes.type === 'music_track_purchase';
        candidates.push({
          paymentId: payment.id,
          orderId: order.id,
          status: payment.status,
          amount: Number(payment.amount || order.amount || 0) / 100,
          currency: payment.currency || order.currency,
          email: payment.email || paymentNotes.userEmail || '',
          userId: paymentNotes.userId || null,
          planName: isMusicPurchase
            ? `Music: ${paymentNotes.trackTitle || 'Untitled Track'}`
            : (paymentNotes.planName || paymentNotes.productId || (paymentNotes.type === 'subscription_payment' ? 'Subscription' : null)),
          purchaseType: isMusicPurchase ? 'music_track_purchase' : 'credit_purchase',
          createdAt: new Date((payment.created_at || order.created_at || 0) * 1000).toISOString(),
        });
      }
    }

    const [processedChecks, rejectedChecks] = await Promise.all([
      Promise.all(candidates.map((c) => firestore.collection('processedPayments').doc(c.paymentId).get())),
      // 🔴 NEW: some "not credited" entries are genuinely not meant to be
      // granted (an admin already handled it another way, a test payment,
      // a since-refunded one) — without a way to say "reviewed, leave
      // this alone" an admin had to either grant it anyway or stare at
      // the same red flag on every refresh forever. A separate
      // collection (not processedPayments — that one means "credited",
      // and conflating the two would make a dismissed payment show as
      // wrongly "Credited") tracks these.
      Promise.all(candidates.map((c) => firestore.collection('rejectedPaymentFlags').doc(c.paymentId).get())),
    ]);
    const withStatus = candidates.map((c, i) => ({
      ...c,
      credited: processedChecks[i].exists,
      dismissed: rejectedChecks[i].exists,
    }));

    // Needs-action ones (uncredited, not dismissed) surface first; dismissed
    // ones last, since there's nothing left to do about them either way.
    withStatus.sort((a, b) => {
      const priority = (p: any) => (p.credited ? 2 : p.dismissed ? 1 : 0);
      const pa = priority(a), pb = priority(b);
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return { success: true, payments: withStatus };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts:getRecentRazorpayPayments', error);
    return { success: false, message: error?.error?.description || error.message || 'Could not fetch Razorpay payments.' };
  }
}

/**
 * One-click recovery for a payment that Razorpay shows as paid but which
 * never got credited/unlocked on our side — regardless of WHY it was
 * missed (client tab lost, webhook down, etc). Branches on the order's
 * own notes to re-run the correct grant flow: handleCreditPurchase for a
 * normal credit purchase, or handleMusicTrackPurchase for a music track
 * unlock (🔴 FIX: this used to only ever handle credits — music
 * purchases were excluded from this whole panel, see
 * getRecentRazorpayPayments above, so there was previously no recovery
 * path for a stuck music unlock at all). Both grant functions are
 * idempotent via their own processedPayments check, so clicking this on
 * an already-granted payment is a safe no-op either way.
 */
export async function manualGrantRazorpayPaymentAction(
  idToken: string,
  paymentId: string
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };

  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { success: false, message: 'Razorpay keys are not configured on the server.' };

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    let payment: any = await razorpay.payments.fetch(paymentId);

    if (payment.status === 'authorized') {
      payment = await razorpay.payments.capture(paymentId, payment.amount, payment.currency);
    }
    if (payment.status !== 'captured') {
      return { success: false, message: `Payment is ${payment.status}, not captured — cannot grant.` };
    }

    const order: any = await razorpay.orders.fetch(payment.order_id);
    const notes = { ...(order?.notes || {}), ...(payment?.notes || {}) };
    const isMusicPurchase = notes.type === 'music_track_purchase';

    const { firestore, database } = initializeFirebase();
    if (isMusicPurchase) {
      await handleMusicTrackPurchase(firestore, database, payment, order);
    } else {
      await handleCreditPurchase(firestore, database, payment, order);
    }

    await sendToTelegram(
      `🛠️ <b>Manual Payment Recovery</b>\n<b>Admin:</b> ${escapeHtml(guard.email || guard.uid)}\n<b>Type:</b> ${isMusicPurchase ? 'Music Track Unlock' : 'Credits'}\n<b>Payment:</b> <code>${escapeHtml(paymentId)}</code>\nGranted via Admin → Payments (Razorpay was showing this as paid but it had not been ${isMusicPurchase ? 'unlocked' : 'credited'}).`
    ).catch(() => null);

    return { success: true, message: isMusicPurchase ? 'Track unlocked (or already was — safe either way).' : 'Credits granted (or already had been — safe either way).' };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts:manualGrantRazorpayPaymentAction', error, { paymentId });
    return { success: false, message: error?.error?.description || error.message || 'Could not grant this payment.' };
  }
}

/**
 * 🚫 Dismiss a "not credited" Razorpay Ground Truth entry that shouldn't
 * actually be granted (already handled another way, a test payment, a
 * since-refunded one, etc.) — marks it reviewed so it stops showing as a
 * red flag needing action, without touching credits/unlocks at all. Only
 * meaningful for a payment that ISN'T credited yet; dismissing an
 * already-credited one is a harmless no-op (nothing reads the flag for
 * those).
 */
export async function rejectRazorpayPaymentFlagAction(
  idToken: string,
  paymentId: string
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };

  try {
    const { firestore } = initializeFirebase();
    await firestore.collection('rejectedPaymentFlags').doc(paymentId).set({
      paymentId,
      dismissedBy: guard.email || guard.uid,
      dismissedAt: new Date().toISOString(),
    });

    await sendToTelegram(
      `🚫 <b>Payment Flag Dismissed</b>\n<b>Admin:</b> ${escapeHtml(guard.email || guard.uid)}\n<b>Payment:</b> <code>${escapeHtml(paymentId)}</code>\nMarked as reviewed on the Razorpay Ground Truth panel — not granted, won't show as a flag again.`
    ).catch(() => null);

    return { success: true, message: 'Dismissed — this payment will no longer show as needing action.' };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts:rejectRazorpayPaymentFlagAction', error, { paymentId });
    return { success: false, message: error.message || 'Could not dismiss this flag.' };
  }
}

export async function manuallyApprovePayment(
  idToken: string,
  paymentId: string
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  const { firestore, database } = initializeFirebase();

  try {
    const paymentRef = firestore.collection('pendingPayments').doc(paymentId);
    let newCredits = 0;
    let historyUserId = '';
    let historyEntry: Record<string, any> | null = null;

    await firestore.runTransaction(async (transaction: any) => {
      const paymentDoc = await transaction.get(paymentRef);
      if (!paymentDoc.exists) {
        throw new Error('Payment record not found.');
      }
      const paymentData = paymentDoc.data() as PendingPayment;
      if (paymentData.status !== 'pending') {
        throw new Error('This payment is not in a pending state.');
      }

      const userRef = firestore.collection('users').doc(paymentData.userId);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error(`User with ID ${paymentData.userId} not found.`);
      }

      const isAutopay = paymentData.planName?.toLowerCase().includes('consistent creator');
      const queueForNextCycle = isAutopay && hasRunningAutopayCycle(userDoc.data()?.subscription);
      // The pending record stores the whole plan (80,000), but autopay pays
      // out weekly: only Week 1 now, the rest via the catch-up loop. Granting
      // the full amount here on top of that loop over-paid by 60,000.
      const autopayPlan = plans.find(p => p.id === 'autopay_pro');
      const creditsToAdd = queueForNextCycle ? 0 : isAutopay ? (autopayPlan?.weeklyCredits ?? 20000) : paymentData.credits;
      const amountPaidInInr = (paymentData.amount || 0) / 100;
      newCredits = (userDoc.data()?.credits || 0) + creditsToAdd;

      // 1. Update payment status
      transaction.update(paymentRef, { status: 'approved' });

      // 2. Update user credits & financial metrics
      const userUpdates: any = {
        credits: FieldValue.increment(creditsToAdd),
        totalInvestment: FieldValue.increment(amountPaidInInr),
        hasMadeFirstPurchase: true
      };
      const ticketsToAdd = isAutopay ? (queueForNextCycle ? 0 : ticketsForWeek('autopay_pro', 1)) : ticketsForPlan(paymentData.planName);
      if (ticketsToAdd > 0) userUpdates.storeTickets = FieldValue.increment(ticketsToAdd);

      if (queueForNextCycle) {
        userUpdates['subscription.queuedCycles'] = FieldValue.increment(1);
      } else if (isAutopay) {
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        userUpdates.subscription = { 
          planId: 'autopay_pro',
          status: 'active',
          subscriptionId: paymentData.orderId || undefined,
          startDate: now.toISOString(),
          nextWeeklyGrantDate: nextWeek.toISOString(),
          weeklyGrantCount: 1,
          currentCycleMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        };
      }

      transaction.update(userRef, userUpdates);

      // 3. Credit history entry — written after the transaction commits
      // (below). Writing it in here pushed a duplicate on every retry.
      historyUserId = paymentData.userId;
      historyEntry = {
        amount: creditsToAdd,
        reason: queueForNextCycle
          ? `Purchase - ${paymentData.planName} (Queued — starts after current plan)`
          : isAutopay
          ? `Purchase - ${paymentData.planName} (Week 1 Grant)`
          : `Purchase - ${paymentData.planName}`,
        timestamp: new Date().toISOString(),
        paymentId: paymentData.paymentId || `MANUAL_${Date.now()}`,
        orderId: paymentData.orderId,
        amountPaid: amountPaidInInr,
        currency: paymentData.currency || 'INR',
      };

      // 4. Send notification to user
      const notificationRef = userRef.collection('notifications').doc('user_notifications');
      const notificationEntry = {
        id: `notif-${paymentId}-${Date.now()}`,
        message: queueForNextCycle
          ? `Your purchase was approved! Your current plan is still running — this plan's credits will start right after it finishes.`
          : `Your purchase of ${creditsToAdd.toLocaleString()} credits was approved!`,
        timestamp: new Date().toISOString(),
        read: false,
        type: 'credits' as const,
      };
      transaction.set(notificationRef, { entries: FieldValue.arrayUnion(notificationEntry) }, { merge: true });
    });

    if (database && historyEntry && historyUserId) {
      await database.ref(`creditHistory/${historyUserId}`).push(historyEntry)
        .catch((e: any) => { console.error("RTDB history write failed:", e); return null; });
    }

    // Send Telegram log after successful transaction
    await sendToTelegram(
      `✅ *Payment Manually Approved by Admin*\n*Payment ID:* ${paymentId}\n*New Balance:* ${formatCredits(newCredits)}`
    );

    revalidatePath('/admin/payments');
    return { success: true, message: 'Payment approved successfully!' };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts#1', error);
    console.error('Manual approval failed:', error);
    await sendToTelegram(
      `🚨 *Manual Approval FAILED*\n*Payment ID:* ${paymentId}\n*Error:* ${error.message}`
    );
    return {
      success: false,
      message: error.message || 'An unknown error occurred.',
    };
  }
}

export async function deletePendingPayment(
  idToken: string,
  paymentId: string
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  const { firestore } = initializeFirebase();

  try {
    const paymentRef = firestore.collection('pendingPayments').doc(paymentId);
    
    const paymentDoc = await paymentRef.get();
    if (!paymentDoc.exists) {
      return { success: true, message: 'Payment record was already removed.' };
    }
    const paymentData = paymentDoc.data() as PendingPayment;

    if (paymentData.status === 'approved') {
      throw new Error('This payment has already been approved and cannot be deleted.');
    }

    await paymentRef.delete();
    
    await sendToTelegram(
      `🗑️ *Pending Payment Deleted by Admin*\n*Payment ID:* ${paymentId}\n*User:* ${paymentData.userEmail}`
    );

    revalidatePath('/admin/payments');
    return { success: true, message: 'Pending payment record deleted successfully.' };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts#2', error);
    console.error('Pending payment deletion failed:', error);
    return {
      success: false,
      message: error.message || 'An unknown error occurred.',
    };
  }
}

export async function bulkDeletePayments(
  idToken: string,
  paymentIds: string[]
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };
  const { firestore } = initializeFirebase();
  const batch = firestore.batch();
  
  try {
    for (const id of paymentIds) {
      const ref = firestore.collection('pendingPayments').doc(id);
      batch.delete(ref);
    }
    await batch.commit();
    
    await sendToTelegram(`🗑️ *Bulk Deletion of Payments*\n*Count:* ${paymentIds.length} items removed.`);
    
    revalidatePath('/admin/payments');
    return { success: true, message: `${paymentIds.length} records deleted successfully.` };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts#3', error);
    console.error('Bulk deletion failed:', error);
    return { success: false, message: error.message || 'An unknown error occurred during bulk deletion.' };
  }
}
