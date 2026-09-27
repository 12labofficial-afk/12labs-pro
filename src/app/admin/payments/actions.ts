
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
import { handleCreditPurchase } from '@/lib/credit-purchase';

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

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { success: false, message: 'Razorpay keys are not configured on the server.' };

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const result: any = await razorpay.orders.all({ count: Math.min(Math.max(count, 1), 100), 'expand[]': 'payments' } as any);
    const { firestore } = initializeFirebase();

    const candidates: any[] = [];
    for (const order of result.items || []) {
      const notes = order.notes || {};
      // Not credit purchases — these are tracked/handled elsewhere, skip them here.
      if (notes.type === 'music_track_purchase' || notes.type === 'product_order' || notes.type === 'ad_budget_topup' || notes.pendingOrderId) continue;

      const paymentItems = (order as any).payments?.items || [];
      for (const payment of paymentItems) {
        if (payment.status !== 'captured' && payment.status !== 'authorized') continue;
        const paymentNotes = { ...notes, ...(payment.notes || {}) };
        candidates.push({
          paymentId: payment.id,
          orderId: order.id,
          status: payment.status,
          amount: Number(payment.amount || order.amount || 0) / 100,
          currency: payment.currency || order.currency,
          email: payment.email || paymentNotes.userEmail || '',
          userId: paymentNotes.userId || null,
          planName: paymentNotes.planName || paymentNotes.productId || (paymentNotes.type === 'subscription_payment' ? 'Subscription' : null),
          createdAt: new Date((payment.created_at || order.created_at || 0) * 1000).toISOString(),
        });
      }
    }

    const checks = await Promise.all(
      candidates.map((c) => firestore.collection('processedPayments').doc(c.paymentId).get())
    );
    const withStatus = candidates.map((c, i) => ({ ...c, credited: checks[i].exists }));

    // Uncredited ones surface first — that's what an admin actually needs to act on.
    withStatus.sort((a, b) => {
      if (a.credited !== b.credited) return a.credited ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return { success: true, payments: withStatus };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts:getRecentRazorpayPayments', error);
    return { success: false, message: error?.error?.description || error.message || 'Could not fetch Razorpay payments.' };
  }
}

/**
 * One-click recovery: re-runs the exact same capture+credit flow
 * (confirmRazorpayCreditPayment in buy-credits/actions.ts) for a payment
 * that Razorpay shows as paid but which never got credited on our side —
 * regardless of WHY it was missed (client tab lost, webhook down, etc).
 * Idempotent via handleCreditPurchase's own processedPayments check, so
 * clicking this on an already-credited payment is a safe no-op.
 */
export async function manualGrantRazorpayPaymentAction(
  idToken: string,
  paymentId: string
): Promise<{ success: boolean; message: string }> {
  const guard = await requireAdmin(idToken);
  if (!guard.ok) return { success: false, message: guard.message };

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { success: false, message: 'Razorpay keys are not configured on the server.' };

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    let payment: any = await razorpay.payments.fetch(paymentId);

    if (payment.status === 'authorized') {
      payment = await razorpay.payments.capture(paymentId, payment.amount, payment.currency);
    }
    if (payment.status !== 'captured') {
      return { success: false, message: `Payment is ${payment.status}, not captured — cannot grant credits.` };
    }

    const order: any = await razorpay.orders.fetch(payment.order_id);
    const { firestore, database } = initializeFirebase();
    await handleCreditPurchase(firestore, database, payment, order);

    await sendToTelegram(
      `🛠️ <b>Manual Payment Recovery</b>\n<b>Admin:</b> ${escapeHtml(guard.email || guard.uid)}\n<b>Payment:</b> <code>${escapeHtml(paymentId)}</code>\nGranted via Admin → Payments (Razorpay was showing this as paid but it had not been credited).`
    ).catch(() => null);

    return { success: true, message: 'Credits granted (or already had been — safe either way).' };
  } catch (error: any) {
    reportServerError('src/app/admin/payments/actions.ts:manualGrantRazorpayPaymentAction', error, { paymentId });
    return { success: false, message: error?.error?.description || error.message || 'Could not grant credits for this payment.' };
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

      const creditsToAdd = paymentData.credits;
      const amountPaidInInr = (paymentData.amount || 0) / 100;
      newCredits = (userDoc.data()?.credits || 0) + creditsToAdd;

      // 1. Update payment status
      transaction.update(paymentRef, { status: 'approved' });

      // 2. Update user credits & financial metrics
      const isAutopay = paymentData.planName?.toLowerCase().includes('consistent creator');
      const userUpdates: any = {
        credits: FieldValue.increment(creditsToAdd),
        totalInvestment: FieldValue.increment(amountPaidInInr),
        hasMadeFirstPurchase: true
      };

      if (isAutopay) {
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
        reason: `Purchase - ${paymentData.planName} (Manual Approval)`,
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
        message: `Your purchase of ${creditsToAdd.toLocaleString()} credits was approved!`,
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
