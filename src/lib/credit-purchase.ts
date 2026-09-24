import { FieldValue } from 'firebase-admin/firestore';
import type * as admin from 'firebase-admin';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { UserProfile, AffiliateCode } from '@/lib/types';
import { logSummaryEvent } from '@/lib/summary-logger';
import { escapeHtml, getISTDateString } from '@/lib/utils';
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

        await sendToTelegram(`💸 <b>Affiliate Commission Logged</b>\n<b>Creator:</b> ${data.code}\n<b>Buyer:</b> ${buyerEmail}\n<b>Earned:</b> ₹${commission}`);

    } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:123', e);
        console.error("Affiliate sync failed:", e.message);
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
  const notes = { ...(orderEntity?.notes || {}), ...(entity?.notes || {}) };
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

        if (processedDoc.exists || (processedOrderDoc && processedOrderDoc.exists) || (processedSubDoc && processedSubDoc.exists)) {
            return { stopProcessing: true };
        }

        if (ppDoc?.exists && ppDoc.data()?.status === 'approved') {
            return { stopProcessing: true };
        }

        const userData = userDoc.exists ? userDoc.data() as UserProfile : null;

        // A late recurring webhook must not resurrect a subscription that the
        // customer already cancelled in Razorpay.
        if (isRecurring && userData?.subscription && userData.subscription.status !== 'active') {
            return { stopProcessing: true };
        }
        
        // Safety guard for Autopay Pro: If user already has an active subscription started within last 1 hour, prevent duplicate grant
        if (isAutopay && !isRecurring && userData?.subscription?.status === 'active') {
            const subStartDate = userData.subscription.startDate ? new Date(userData.subscription.startDate).getTime() : 0;
            const isRecentDuplicate = (Date.now() - subStartDate) < (60 * 60 * 1000); // 1 hour window
            if (isRecentDuplicate && userData.subscription.weeklyGrantCount === 1) {
                return { stopProcessing: true };
            }
        }

        const now = new Date();
         let creditsToAdd = 0;
        let planName = notes.planName || 'AI Credit Pack';
        const planSource = plans.find(p => p.id === notes.productId);
         const previousSubscription = userData?.subscription;
         const effectivePlan = planSource || plans.find(p => p.id === previousSubscription?.planId);
         const previousGrantCount = Number(previousSubscription?.weeklyGrantCount || 0);
         const grantCycle = isAutopay ? (isRecurring ? previousGrantCount + 1 : 1) : 0;

        const bonusFromNotes = parseInt(notes.bonusCredits || '0', 10);

        if (isAutopay) {
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

        if (planSource) {
            const priceKey = String(planSource.priceInRupees);
            userUpdates[`purchasedPlans.${priceKey}`] = FieldValue.increment(1);
        } else if (isAutopay) {
            userUpdates[`purchasedPlans.700`] = FieldValue.increment(1);
        }

         if (isAutopay) {
            const intervalDays = effectivePlan?.grantIntervalDays ?? 7;
            const nextWeek = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
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
                message: `Payment successful! ${creditsToAdd.toLocaleString()} credits added.`, 
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
        if (processedSubRef && !isRecurring) {
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
             isRecurring,
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

    await logSummaryEvent('creditsPurchased', tr.creditsToAdd);

    const todayStr = getISTDateString();
    const revenueRef = database.ref(`dailySummaries/${todayStr}/revenue`);
    let previousRevenue = 0;
    await revenueRef.transaction((currentValue) => {
        previousRevenue = currentValue || 0;
        return previousRevenue + paymentInInr;
    });
    const todayEarningsText = `🤑 <b>Today:</b> ₹${Math.round(previousRevenue).toLocaleString('en-IN')} + ₹${Math.round(paymentInInr).toLocaleString('en-IN')} = ₹${Math.round(previousRevenue + paymentInInr).toLocaleString('en-IN')}`;

    const creditTotalInvestFormatted = tr.totalInvestment !== undefined 
        ? `₹${Math.round(tr.totalInvestment).toLocaleString('en-IN')}` 
        : `${currencySymbol}${amountInOriginalCurrency}`;
     const recurringGrantText = tr.isRecurring
         ? `\n<b>Consistent Plan:</b> Week ${tr.grantCycle} credit grant`
         : '';
     await sendToTelegram(`<b>💎 CREDIT PURCHASE SUCCESSFUL</b>\n\n<b>User:</b> ${tr.userEmail}\n<b>Amount:</b> ${currencySymbol}${amountInOriginalCurrency}\n<b>Credit Grant:</b> +${tr.creditsToAdd.toLocaleString()}${recurringGrantText}\n<b>Total Investment:</b> ${creditTotalInvestFormatted}\n\n${todayEarningsText}`);
  } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:501', e);
      if (!grantSettled) {
          // Credits were NOT added. Re-throw so POST answers 500 and Razorpay
          // redelivers the webhook; processedPayments keeps the retry from
          // double-crediting once it does go through.
          await sendToTelegram(`🚨 <b>PAYMENT SYNC FAILED — CREDITS NOT ADDED</b>\n<b>Payment:</b> <code>${paymentId}</code>\n<b>Email:</b> ${escapeHtml(paymentEmail || 'N/A')}\n<b>Error:</b> ${escapeHtml(e.message)}\n\nRazorpay will retry automatically. If it keeps failing, approve it from Admin → Payments.`);
          throw e;
      }
      // Credits already added — only a post-grant step (affiliate/revenue log/Telegram) failed.
      await sendToTelegram(`⚠️ <b>Payment credited, post-step failed</b>\n<b>Payment:</b> <code>${paymentId}</code>\n<b>Error:</b> ${escapeHtml(e.message)}`);
  }
}
