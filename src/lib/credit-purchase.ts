import { FieldValue } from 'firebase-admin/firestore';
import type * as admin from 'firebase-admin';
import { after } from 'next/server';
import Razorpay from 'razorpay';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { UserProfile, AffiliateCode } from '@/lib/types';
import { logSummaryEvent } from '@/lib/summary-logger';
import { escapeHtml, getISTDateString } from '@/lib/utils';
import { ticketsForWeek } from '@/lib/tickets';
import { carryOverTickets } from '@/lib/autopay-sync';
import { plans } from '@/lib/plans';
import { reportServerError } from '@/lib/report-error';

/**
 * Credit-pack / top-up / autopay grant, shared by the Razorpay webhook
 * (src/app/api/webhook/razorpay/route.ts) and the post-checkout confirm
 * action (confirmRazorpayCreditPayment in src/app/buy-credits/actions.ts).
 * Idempotent via processedPayments, so whichever of the two arrives first
 * grants the credits and the other is a no-op.
 */

export async function handleAffiliateCommission(
    database: admin.database.Database,
    promoCode: string,
    buyerEmail: string,
    amountInInr: number,
    paymentId: string
) {
    if (!promoCode) return;
    
    try {
        const affiliateRef = database.ref(`affiliateCodes/${promoCode.toUpperCase()}`);
        const snapshot = await affiliateRef.get();
        
        if (!snapshot.exists()) return;
        
        const data = snapshot.val() as AffiliateCode;
        if (!data.isEnabled || !data.commissionRate) return;

        const commission = Math.round(amountInInr * (data.commissionRate / 100));
        if (commission <= 0) return;

        const earningsRef = database.ref(`affiliateEarnings/${data.code}`);
        const txRef = database.ref(`affiliateTransactions/${data.code}`).push();

        await earningsRef.transaction((current) => {
            if (!current) return { totalEarnings: commission, totalWithdrawn: 0 };
            return {
                ...current,
                totalEarnings: (current.totalEarnings || 0) + commission
            };
        });

        await txRef.set({
            buyerEmail,
            purchaseAmount: amountInInr,
            commissionEarned: commission,
            timestamp: new Date().toISOString(),
            paymentId
        });

        // 🔴 FIX: was awaited — pure notification, nothing downstream
        // depends on it. Blocking the webhook's response on Telegram's own
        // round-trip is exactly the kind of latency that pushes a delivery
        // past Razorpay's timeout, which Razorpay counts as a failure —
        // repeated failures over 24h get the webhook auto-disabled.
        after(() => sendToTelegram(`💸 <b>Affiliate Commission Logged</b>\n<b>Creator:</b> ${data.code}\n<b>Buyer:</b> ${buyerEmail}\n<b>Earned:</b> ₹${commission}`).catch((e: any) => { reportServerError('src/lib/credit-purchase.ts:telegram1', e); return null; }));

    } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:123', e);
        console.error("Affiliate sync failed:", e.message);
    }
}

/**
 * A new autopay purchase while the user's current plan still has
 * installments left must not stack credits now or reset that plan's
 * progress — it's queued and starts right after the current one finishes
 * (see the catch-up loop in src/app/actions.ts).
 */
export function hasRunningAutopayCycle(sub: any): boolean {
    // 'cancelled' still pays out its pre-paid cycle (catch-up loop handles both).
    if (!sub || (sub.status !== 'active' && sub.status !== 'cancelled')) return false;
    const maxGrants = plans.find(p => p.id === sub.planId)?.maxGrants ?? 4;
    return Number(sub.weeklyGrantCount || 0) < maxGrants;
}

/**
 * Autopay checkout puts userId/plan notes on the Razorpay SUBSCRIPTION, not
 * on the order/payment Razorpay creates for each charge. Without this a
 * subscription payment looked like a plain purchase with no plan and got
 * 0 credits (or no user at all).
 */
async function fetchSubscriptionNotes(entity: any): Promise<Record<string, string>> {
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return {};
    try {
        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
        let subscriptionId: string | null = entity?.subscription_id || null;
        if (!subscriptionId && entity?.invoice_id) {
            const invoice: any = await razorpay.invoices.fetch(entity.invoice_id);
            subscriptionId = invoice?.subscription_id || null;
        }
        if (!subscriptionId) return {};
        const subscription: any = await razorpay.subscriptions.fetch(subscriptionId);
        return { ...(subscription?.notes || {}), subscriptionId };
    } catch (e: any) {
        reportServerError('src/lib/credit-purchase.ts:fetchSubscriptionNotes', e, { paymentId: entity?.id || 'unknown' });
        return {};
    }
}

export async function handleCreditPurchase(
    firestore: admin.firestore.Firestore,
    database: admin.database.Database,
    paymentEntity: any,
    orderEntity?: any,
    isRecurring = false
) {
  const entity = paymentEntity || {};
  const subscriptionNotes = (entity.invoice_id || entity.subscription_id) ? await fetchSubscriptionNotes(entity) : {};
  const notes = { ...subscriptionNotes, ...(orderEntity?.notes || {}), ...(entity?.notes || {}) };
  const paymentId = entity.id || orderEntity?.id || `pay_${Date.now()}`;
  const orderId = entity.order_id || orderEntity?.id || notes.orderId;
  const paymentEmail = entity.email || orderEntity?.email || '';
  const subscriptionId = entity.subscription_id || notes.subscriptionId || null;
  const amountInOriginalCurrency = (entity.amount || orderEntity?.amount || 0) / 100;
  const currency = entity.currency || orderEntity?.currency || 'INR';
  // Identified from the order's own notes/subscription, never from the amount:
  // a ₹700 custom top-up used to be misread as the ₹700 autopay plan and got
  // 20,000 credits instead of what it paid for.
  const isAutopay = !!subscriptionId || notes.type === 'subscription_payment' || notes.productId === 'autopay_pro' || notes.productId === 'test_sub' || isRecurring;
  const currencySymbol = currency === 'USD' ? '$' : '₹';

  const paymentInInr = currency === 'USD' ? amountInOriginalCurrency * 85 : amountInOriginalCurrency;

  // Set once the grant transaction commits (or finds the payment already
  // processed). Anything failing before that means the user has NOT been
  // credited, so the error must reach Razorpay as a non-2xx and get retried.
  let grantSettled = false;

  try {
    let userId = notes.userId;
     if (!userId && paymentEmail) {
        const userSearch = await firestore.collection('users').where('email', '==', paymentEmail).limit(1).get();
        if (!userSearch.empty) userId = userSearch.docs[0].id;
    }
     // Recurring Razorpay payments may not carry the original notes/email.
     // Resolve the account by the subscription ID before processing the grant.
     if (!userId && subscriptionId) {
         const subscriptionSearch = await firestore.collection('users')
             .where('subscription.subscriptionId', '==', subscriptionId).limit(1).get();
         if (!subscriptionSearch.empty) userId = subscriptionSearch.docs[0].id;
     }

    if (!userId) throw new Error("Could not resolve User Identity.");

    let pendingPaymentId = notes.pendingPaymentId;
    if (!pendingPaymentId) {
        const lookupId = entity.order_id || subscriptionId;
        if (lookupId) {
            const ppSearch = await firestore.collection('pendingPayments').where('orderId', '==', lookupId).limit(1).get();
            if (!ppSearch.empty) pendingPaymentId = ppSearch.docs[0].id;
        }
    }

    // Nothing to grant (no plan, no credits in the notes) means we don't know
    // what this payment bought — never consume it as "processed" with 0
    // credits. Fall back to the pending payment we created for the order,
    // and if even that is missing, fail loudly so it gets retried/alerted.
    if (!isAutopay && !plans.some(p => p.id === notes.productId) && !notes.credits && pendingPaymentId) {
        const ppSnap = await firestore.collection('pendingPayments').doc(pendingPaymentId).get().catch(() => null);
        const pp = ppSnap?.exists ? ppSnap.data() : null;
        if (pp && Number(pp.credits) > 0) {
            notes.credits = String(pp.credits);
            if (pp.bonusCredits) notes.bonusCredits = String(pp.bonusCredits);
            if (pp.planName) notes.planName = pp.planName;
        }
    }
    if (!isAutopay && !plans.some(p => p.id === notes.productId) && !(parseInt(notes.credits || '0', 10) > 0)) {
        throw new Error('Could not tell which credit pack this payment was for (order notes missing).');
    }

    const processedRef = firestore.collection('processedPayments').doc(paymentId);
    const processedOrderRef = orderId ? firestore.collection('processedPayments').doc(orderId) : null;
    const processedSubRef = subscriptionId ? firestore.collection('processedPayments').doc(subscriptionId) : null;
    const userRef = firestore.collection('users').doc(userId);
    const ppRef = pendingPaymentId ? firestore.collection('pendingPayments').doc(pendingPaymentId) : null;

    const transactionResult = await firestore.runTransaction(async (transaction: any) => {
        const [processedDoc, processedOrderDoc, processedSubDoc, userDoc, ppDoc] = await Promise.all([
            transaction.get(processedRef),
            processedOrderRef ? transaction.get(processedOrderRef) : Promise.resolve(null),
            processedSubRef && !isRecurring ? transaction.get(processedSubRef) : Promise.resolve(null),
            transaction.get(userRef),
            ppRef ? transaction.get(ppRef) : Promise.resolve(null)
        ]);

        if (processedDoc.exists || (processedOrderDoc && processedOrderDoc.exists)) {
            return { stopProcessing: true };
        }

        // processedPayments/{subscriptionId} marks the subscription's FIRST
        // charge. A different payment on the same subscription is a later
        // monthly charge (its order.paid, or a Ground Truth recovery of a
        // missed subscription.charged) — that must still be granted, not
        // silently skipped. processedRef above dedupes it per payment.
        const isRecurringCharge = isRecurring || !!(processedSubDoc?.exists && processedSubDoc.data()?.paymentId !== paymentId);
        if (processedSubDoc?.exists && !isRecurringCharge) {
            return { stopProcessing: true };
        }

        if (ppDoc?.exists && ppDoc.data()?.status === 'approved') {
            return { stopProcessing: true };
        }

        const userData = userDoc.exists ? userDoc.data() as UserProfile : null;

        // A late recurring webhook must not resurrect a subscription that the
        // customer already cancelled in Razorpay. Only applies to that same
        // subscription — a brand-new one after cancelling must still grant.
        if (isRecurringCharge && userData?.subscription && userData.subscription.status !== 'active'
            && (!subscriptionId || userData.subscription.subscriptionId === subscriptionId)) {
            return { stopProcessing: true };
        }

        // Each autopay charge (first purchase OR monthly renewal) is one full
        // cycle of weekly grants. If the current cycle still has grants left
        // (user hasn't opened the app to collect them, or bought again), the
        // new cycle is queued behind it instead of overwriting its progress.
        const queueForNextCycle = isAutopay && hasRunningAutopayCycle(userData?.subscription);

        const now = new Date();
         let creditsToAdd = 0;
        let planName = notes.planName || 'AI Credit Pack';
        const planSource = plans.find(p => p.id === notes.productId);
         const previousSubscription = userData?.subscription;
         const effectivePlan = planSource || plans.find(p => p.id === previousSubscription?.planId);
         const grantCycle = isAutopay ? 1 : 0;

        const bonusFromNotes = parseInt(notes.bonusCredits || '0', 10);

        if (queueForNextCycle) {
             creditsToAdd = 0;
             planName = `${effectivePlan?.name || 'Consistent Creator'} (Queued — starts after current plan)`;
        } else if (isAutopay) {
             creditsToAdd = effectivePlan?.weeklyCredits || 20000;
             planName = `${effectivePlan?.name || 'Consistent Creator'} (Week ${grantCycle} Grant)`;
        } else if (planSource) {
            creditsToAdd = planSource.credits + bonusFromNotes;
            planName = planSource.name + (bonusFromNotes > 0 ? ' (+Bonus)' : '');
        } else if (notes.credits) {
            // Custom top-ups (no matching fixed `plans` entry) land here. The gift/bonus
            // credits are tracked separately in notes.bonusCredits so the client can show
            // them as a distinct "Gift Credits" line, but they still need to be granted.
            creditsToAdd = (parseInt(notes.credits, 10) || 0) + bonusFromNotes;
            planName = (notes.planName || 'AI Credit Pack') + (bonusFromNotes > 0 ? ` (+${bonusFromNotes.toLocaleString()} Gift Credits)` : '');
        }

        const userUpdates: any = {
            credits: FieldValue.increment(creditsToAdd), 
            hasMadeFirstPurchase: true, 
            totalInvestment: FieldValue.increment(paymentInInr) 
        };

        // One-off packs: tickets now. Consistent Creator: ticket for week 1 now
        // (a queued cycle gets it from the weekly catch-up when it starts).
        const ticketsToAdd = isAutopay
            ? (queueForNextCycle ? 0 : ticketsForWeek(effectivePlan?.id, grantCycle) + carryOverTickets(userData))
            : (planSource?.storeTickets || 0);
        if (ticketsToAdd > 0) {
            userUpdates.storeTickets = FieldValue.increment(ticketsToAdd);
        }

        if (planSource) {
            const priceKey = String(planSource.priceInRupees);
            userUpdates[`purchasedPlans.${priceKey}`] = FieldValue.increment(1);
        } else if (isAutopay) {
            userUpdates[`purchasedPlans.700`] = FieldValue.increment(1);
        }

         if (queueForNextCycle) {
            // Kept on the user (not inside `subscription`): the hourly Firebase
            // function deletes `subscription` when a plan finishes and would
            // take the queued cycle with it.
            userUpdates['autopayQueue.count'] = FieldValue.increment(1);
            if (subscriptionId) userUpdates['autopayQueue.subscriptionId'] = subscriptionId;
            if (subscriptionId && subscriptionId !== previousSubscription?.subscriptionId) {
                // A new paying subscription: future renewals/cancellations
                // for it must find this user, and a cancelled old one must
                // not block them.
                userUpdates['subscription.subscriptionId'] = subscriptionId;
                userUpdates['subscription.status'] = 'active';
            }
         } else if (isAutopay) {
            const intervalDays = effectivePlan?.grantIntervalDays ?? 7;
            const nextWeek = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
             userUpdates.autopayLedger = { week: grantCycle }; // week-1 ticket is settled with this grant
             userUpdates.subscription = {
                 ...(previousSubscription || {}),
                 planId: previousSubscription?.planId || effectivePlan?.id || 'autopay_pro',
                 status: 'active',
                 subscriptionId: subscriptionId || previousSubscription?.subscriptionId || `test_sub_${Date.now()}`,
                 startDate: previousSubscription?.startDate || now.toISOString(),
                 nextWeeklyGrantDate: nextWeek.toISOString(),
                 weeklyGrantCount: grantCycle,
                 currentCycleMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
             };
        }

        if (!userDoc.exists) {
            const newUserProfile: any = {
                uid: userId,
                email: paymentEmail || '',
                name: (paymentEmail || 'User').split('@')[0],
                credits: 2000, 
                role: 'user',
                status: 'active',
                createdAt: now.toISOString(),
                totalInvestment: 0,
                photoURL: '',
            };
            transaction.set(userRef, newUserProfile);
        }

        if (ppRef && ppDoc?.exists) {
            transaction.update(ppRef, { status: 'approved', paymentId: paymentId, updatedAt: now.toISOString() });
        }

        transaction.update(userRef, userUpdates);

        const notificationRef = userRef.collection('notifications').doc('user_notifications');
        transaction.set(notificationRef, { 
            entries: FieldValue.arrayUnion({ 
                id: `pay-${paymentId}`, 
                message: queueForNextCycle
                    ? `Payment successful! Your current plan is still running — this plan's credits will start right after it finishes.`
                    : `Payment successful! ${creditsToAdd.toLocaleString()} credits added.${ticketsToAdd ? ` 🎟️ +${ticketsToAdd} Store Ticket${ticketsToAdd > 1 ? 's' : ''} — get any Verified Partner asset free.` : ''}`,
                timestamp: now.toISOString(), 
                read: false, 
                type: 'credits' 
            }) 
        }, { merge: true });

        const processedPayload = { 
            processedAt: now.toISOString(), 
            type: isAutopay ? 'subscription' : 'credits', 
            userId, 
            email: paymentEmail, 
            amount: entity.amount,
            paymentId,
            orderId: orderId || null
        };

        transaction.set(processedRef, processedPayload);
        if (processedOrderRef) {
            transaction.set(processedOrderRef, processedPayload);
        }
        if (processedSubRef && !isRecurringCharge) {
            transaction.set(processedSubRef, processedPayload);
        }

        const prevInvestment = Number(userDoc.data()?.totalInvestment || 0);
        const newTotalInvestment = prevInvestment + paymentInInr;

        return { 
            stopProcessing: false, 
            userId, 
            userName: userDoc.data()?.name || 'User', 
            userEmail: paymentEmail, 
            creditsToAdd,
            planName,
            grantedAt: now.toISOString(),
             grantCycle,
             isRecurring: isRecurringCharge,
            queued: queueForNextCycle,
            ticketsToAdd,
            totalInvestment: newTotalInvestment
        };
    });

    grantSettled = true;
    if (!transactionResult || (transactionResult as any).stopProcessing) return;
    const tr = transactionResult as any;

    // The credits ledger (CreditHistoryDialog) reads creditHistory/{uid};
    // purchases were never written there, so a paid pack never showed up in
    // the user's history. Runs only after a fresh grant (never on the
    // duplicate webhook/confirm call), so there is exactly one entry.
    await database.ref(`creditHistory/${tr.userId}`).push({
        amount: tr.creditsToAdd,
        reason: `Purchase - ${tr.planName}`,
        timestamp: tr.grantedAt,
        type: 'purchase',
        paymentId,
        orderId: orderId || null,
        amountPaid: amountInOriginalCurrency,
        currency,
    });

    if (notes.promoCode) {
        await handleAffiliateCommission(database, notes.promoCode, tr.userEmail, paymentInInr, paymentId);
    }

    // 🔴 FIX: logSummaryEvent and the revenue transaction below were both
    // awaited, sequentially, before the webhook could respond — an RTDB
    // transaction on a SHARED counter node (every payment that day writes
    // the same dailySummaries/{today}/revenue node) internally retries on
    // write conflicts, so under concurrent traffic this specific step can
    // get genuinely slow. None of it gates the actual grant (already fully
    // committed above), so none of it needs to block the response — Razorpay
    // times a slow delivery out and counts it as failed regardless of
    // whether our server eventually finishes; repeated failures over 24h
    // are what gets a webhook auto-disabled. Chained via .then() instead so
    // the Telegram summary still carries today's real revenue total
    // without making the webhook wait for any of this.
    after(() => logSummaryEvent('creditsPurchased', tr.creditsToAdd).catch((e: any) => { reportServerError('src/lib/credit-purchase.ts:summary', e); return null; }));

    after(async () => {
        const todayStr = getISTDateString();
        const revenueRef = database.ref(`dailySummaries/${todayStr}/revenue`);
        const creditTotalInvestFormatted = tr.totalInvestment !== undefined
            ? `₹${Math.round(tr.totalInvestment).toLocaleString('en-IN')}`
            : `${currencySymbol}${amountInOriginalCurrency}`;
        const recurringGrantText = tr.queued
            ? `\n<b>Consistent Plan:</b> already active — queued as next cycle (no credits now)`
            : tr.isRecurring
            ? `\n<b>Consistent Plan:</b> Week ${tr.grantCycle} credit grant`
            : '';
        try {
            const result = await revenueRef.transaction((currentValue) => (currentValue || 0) + paymentInInr);
            const newRevenue = result.snapshot.val() || paymentInInr;
            const previousRevenue = newRevenue - paymentInInr;
            const todayEarningsText = `🤑 <b>Today:</b> ₹${Math.round(previousRevenue).toLocaleString('en-IN')} + ₹${Math.round(paymentInInr).toLocaleString('en-IN')} = ₹${Math.round(newRevenue).toLocaleString('en-IN')}`;
            await sendToTelegram(`<b>💎 CREDIT PURCHASE SUCCESSFUL</b>\n\n<b>User:</b> ${tr.userEmail}\n<b>Amount:</b> ${currencySymbol}${amountInOriginalCurrency}\n<b>Credit Grant:</b> +${tr.creditsToAdd.toLocaleString()}${tr.ticketsToAdd ? `\n<b>Store Tickets:</b> +${tr.ticketsToAdd} 🎟️` : ''}${recurringGrantText}\n<b>Total Investment:</b> ${creditTotalInvestFormatted}\n\n${todayEarningsText}`);
        } catch (e: any) {
            reportServerError('src/lib/credit-purchase.ts:telegram2', e);
        }
    });
  } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:501', e);
      if (!grantSettled) {
          // Credits were NOT added. Re-throw so POST answers 500 and Razorpay
          // redelivers the webhook; processedPayments keeps the retry from
          // double-crediting once it does go through.
          //
          // Deliberately still AWAITED, unlike every other Telegram send in
          // this file: this is the one alert that MUST reach the admin
          // before the function exits via the throw right below it — a
          // fire-and-forget call here could get cut off by the platform
          // once the throw unwinds, silently losing the one message that
          // says money was taken but credits were NOT granted.
          await sendToTelegram(`🚨 <b>PAYMENT SYNC FAILED — CREDITS NOT ADDED</b>\n<b>Payment:</b> <code>${paymentId}</code>\n<b>Email:</b> ${escapeHtml(paymentEmail || 'N/A')}\n<b>Error:</b> ${escapeHtml(e.message)}\n\nIt is re-checked automatically when the user opens the app. If it still fails, approve it from Admin → Payments.`).catch((e2: any) => { reportServerError('src/lib/credit-purchase.ts:telegram3', e2); return null; });
          throw e;
      }
      // Credits already added — only a post-grant step (affiliate/revenue log/Telegram) failed.
      // Deferred via after() — credits are already safely granted regardless,
      // but the alert itself is still guaranteed to complete, not just fired blind.
      after(() => sendToTelegram(`⚠️ <b>Payment credited, post-step failed</b>\n<b>Payment:</b> <code>${paymentId}</code>\n<b>Error:</b> ${escapeHtml(e.message)}`).catch((e2: any) => { reportServerError('src/lib/credit-purchase.ts:telegram4', e2); return null; }));
  }
}
