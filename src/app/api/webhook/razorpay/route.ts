import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { initializeFirebase } from '@/firebase/server';
import { FieldValue } from 'firebase-admin/firestore';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { UserProfile, UserSubscription, Product, AffiliateCode } from '@/lib/types';
import { logSummaryEvent } from '@/lib/summary-logger';
import type * as admin from 'firebase-admin';
import { escapeHtml, getISTDateString } from '@/lib/utils';
import { plans } from '@/lib/plans';
import { reportServerError } from '@/lib/report-error';
import { handleAffiliateCommission, handleCreditPurchase } from '@/lib/credit-purchase';
import { createAdFromRazorpayPayment } from '@/lib/ad-budget-purchase';

/**
 * 🎵🔒 MUSIC TRACK PURCHASE — WEBHOOK HANDLER
 * ---------------------------------------------
 * Unlocks track's paid preview by writing musicPurchases/{userId}/{trackId}
 * in RTDB (the same store publicMusicLibrary itself lives in — see
 * src/app/music-library/actions.ts). Idempotent via processedPayments,
 * same as every other purchase type in this file.
 */
async function handleMusicTrackPurchase(
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

    // 🔴 FIX: this used to be a plain read-then-later-write check
    // (`get()` now, `set()` after other async work) — not atomic. Razorpay
    // sends BOTH an `order.paid` and a `payment.captured` event for the
    // same successful payment, and the dispatcher below routes both to
    // this same handler. If those two webhook deliveries land close
    // together, both could pass the `.exists` check before either
    // finished writing the marker — a classic TOCTOU race — and the
    // track purchase (and this Telegram message) fired twice for one
    // real payment. `.create()` is atomic: Firestore rejects it outright
    // if the document already exists, so only ONE of two concurrent
    // deliveries can ever win it, no matter how close together they land.
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
        reportServerError('src/app/api/webhook/razorpay/route.ts:58', e);
        // ALREADY_EXISTS (Firestore error code 6) — the other event for
        // this same payment got here first. Nothing left to do.
        if (e?.code === 6 || /already exists/i.test(e?.message || '')) return;
        throw e;
    }

    await database.ref(`musicPurchases/${userId}/${trackId}`).set({
        trackId,
        purchasedAt: new Date().toISOString(),
        amount: amountInInr,
        paymentId,
    });

    await sendToTelegram(
        `<b>💎 MUSIC TRACK PURCHASED</b>\n\n` +
        `<b>Track:</b> ${escapeHtml(trackTitle)}\n` +
        `<b>User:</b> ${escapeHtml(userEmail || userId)}\n` +
        `<b>Amount:</b> ₹${amountInInr}\n` +
        `<b>Payment ID:</b> <code>${escapeHtml(paymentId)}</code>`
    );
}

async function handleProductPurchase(
    firestore: admin.firestore.Firestore,
    database: admin.database.Database,
    paymentEntity: any,
    orderEntity?: any
) {
    const notes = { ...(orderEntity?.notes || {}), ...(paymentEntity?.notes || {}) };
    const userId = notes.userId;
    const pendingOrderId = notes.pendingOrderId;
    const paymentId = paymentEntity?.id || orderEntity?.id || `pay_${Date.now()}`;
    const orderId = paymentEntity?.order_id || orderEntity?.id || notes.orderId;
    const paymentEmail = paymentEntity?.email || orderEntity?.email || '';
    const amountInInr = (paymentEntity?.amount || orderEntity?.amount || 0) / 100;

    if (!userId) throw new Error("Missing UserID in store purchase metadata.");

    try {
        const processedRef = firestore.collection('processedPayments').doc(paymentId);
        const processedOrderRef = orderId ? firestore.collection('processedPayments').doc(orderId) : null;
        const userRef = firestore.collection('users').doc(userId);
        const pendingOrderRef = pendingOrderId ? firestore.collection('pendingOrders').doc(pendingOrderId) : null;

        const transactionResult = await firestore.runTransaction(async (transaction: any) => {
            const [processedDoc, processedOrderDoc, userDoc, pendingOrderDoc] = await Promise.all([
                transaction.get(processedRef),
                processedOrderRef ? transaction.get(processedOrderRef) : Promise.resolve(null),
                transaction.get(userRef),
                pendingOrderRef ? transaction.get(pendingOrderRef) : Promise.resolve(null)
            ]);

            if (processedDoc.exists || (processedOrderDoc && processedOrderDoc.exists)) {
                return { alreadyProcessed: true };
            }

            if (pendingOrderDoc?.exists && pendingOrderDoc.data()?.status === 'completed') {
                return { alreadyProcessed: true };
            }

            const createdAt = new Date().toISOString();
            
            if (!userDoc.exists) {
                const newUserProfile: any = {
                    uid: userId,
                    email: paymentEmail || '',
                    name: (paymentEmail || 'User').split('@')[0],
                    credits: 2000, 
                    role: 'user',
                    status: 'active',
                    createdAt: createdAt,
                    totalInvestment: 0,
                    photoURL: '',
                };
                transaction.set(userRef, newUserProfile);
            }
            
            const orderData = pendingOrderDoc?.exists ? pendingOrderDoc.data() : null;
            const items = orderData?.items || [];
            
            // Pre-fetch products for snapshotting inside history
            const productIds = items.map((i: any) => i.productId);
            let productsById: Record<string, any> = {};
            if (productIds.length > 0) {
                const productDocs = await transaction.getAll(...productIds.map((id: string) => firestore.collection('products').doc(id)));
                productDocs.forEach((doc: any) => {
                    if (doc.exists) {
                        productsById[doc.id] = doc.data();
                    }
                });
            }

            for (const item of items) {
                const historyRef = firestore.collection('storeHistory').doc();
                transaction.set(historyRef, {
                    userId,
                    userEmail: paymentEmail,
                    productId: item.productId,
                    productTitle: item.title,
                    sellerId: item.sellerId,
                    amount: item.price * 100,
                    currency: 'INR',
                    status: 'paid',
                    paymentMethod: 'cash',
                    paymentId,
                    createdAt,
                    productSnapshot: productsById[item.productId] || null,
                });

                const productRef = firestore.collection('products').doc(item.productId);
                transaction.update(productRef, { status: 'sold', isSold: true, buyerUid: userId });
            }

            const prevInvestment = Number(userDoc.data()?.totalInvestment || 0);
            const newTotalInvestment = prevInvestment + amountInInr;

            transaction.update(userRef, { totalInvestment: FieldValue.increment(amountInInr) });

            if (pendingOrderRef) transaction.update(pendingOrderRef, { status: 'completed', paymentId });
            transaction.set(processedRef, { processedAt: createdAt, type: 'store_asset', orderId: orderId || null, paymentId });
            if (processedOrderRef) {
                transaction.set(processedOrderRef, { processedAt: createdAt, type: 'store_asset', paymentId, orderId });
            }

            return { alreadyProcessed: false, items, totalInvestment: newTotalInvestment };
        });

        if (!transactionResult || (transactionResult as any).alreadyProcessed) return;

        const tr = transactionResult as any;
        const items = tr.items || [];
        
        // --- 💸 AFFILIATE HUB SYNC (FOR STORE) ---
        if (notes.promoCode) {
            await handleAffiliateCommission(database, notes.promoCode, paymentEmail, amountInInr, paymentId);
        }

        const itemDetails = items.map((item: any) => `📦 <b>${escapeHtml(item.title)}</b>`).join('\n');

        for (const item of items) {
            const productSnap = await database.ref(`storeProducts/${item.productId}`).get().catch((e: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:249', e); return null; });
            if (productSnap && productSnap.exists() && productSnap.val()?.title) {
                await database.ref(`storeProducts/${item.productId}`).update({ status: 'sold', isSold: true, buyerUid: userId }).catch((e: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:251', e); return null; });
            }
        }

        await database.ref(`carts/${userId}`).remove().catch((e: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:255', e); return null; });
        const todayStr = getISTDateString();
        const revenueRef = database.ref(`dailySummaries/${todayStr}/revenue`);
        let previousRevenue = 0;
        await revenueRef.transaction((currentValue) => {
            previousRevenue = currentValue || 0;
            return previousRevenue + amountInInr;
        });
        const todayEarningsText = `🤑 <b>Today:</b> ₹${Math.round(previousRevenue).toLocaleString('en-IN')} + ₹${Math.round(amountInInr).toLocaleString('en-IN')} = ₹${Math.round(previousRevenue + amountInInr).toLocaleString('en-IN')}`;

        const storeTotalInvestFormatted = tr.totalInvestment !== undefined 
            ? `₹${Math.round(tr.totalInvestment).toLocaleString('en-IN')}` 
            : `₹${amountInInr}`;
        await sendToTelegram(`🛍️ <b>STORE ASSET PURCHASED</b>\n\n<b>User:</b> ${paymentEmail}\n<b>Amount:</b> ₹${amountInInr}\n<b>Total Investment:</b> ${storeTotalInvestFormatted}\n\n${itemDetails}\n\n<b>Status:</b> UNLOCKED\n\n${todayEarningsText}`);

    } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:267', e);
        console.error("Store purchase sync failed:", e.message);
        await sendToTelegram(`🚨 <b>STORE SYNC FAILED</b>\n<b>Payment:</b> <code>${paymentId}</code>\n<b>Error:</b> ${e.message}`);
    }
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const text = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    // These rejections used to be console-only. When the secret is missing or
    // doesn't match the Razorpay dashboard, EVERY paid purchase fails to
    // credit with nothing showing up anywhere — so they alert now.
    if (!secret) {
      console.error('[Razorpay Webhook Error] Neither RAZORPAY_WEBHOOK_SECRET nor RAZORPAY_KEY_SECRET is set.');
      await sendToTelegram(`🚨 <b>RAZORPAY WEBHOOK REJECTED</b>\nNo webhook secret is configured on the server — paid purchases are NOT being credited.`).catch(() => null);
      return NextResponse.json({ status: 'error', message: 'Webhook secret not configured on server' }, { status: 400 });
    }

    if (!signature) {
      console.error('[Razorpay Webhook Error] Missing x-razorpay-signature header.');
      return NextResponse.json({ status: 'error', message: 'Missing x-razorpay-signature header' }, { status: 400 });
    }

    const calculatedHmac = crypto.createHmac('sha256', secret).update(text).digest('hex');
    const hmacBuf = Buffer.from(calculatedHmac, 'utf8');
    const sigBuf = Buffer.from(signature, 'utf8');

    if (hmacBuf.length !== sigBuf.length || !crypto.timingSafeEqual(hmacBuf, sigBuf)) {
      console.error('[Razorpay Webhook Error] Signature verification failed. Ensure RAZORPAY_WEBHOOK_SECRET in environment matches Razorpay dashboard webhook secret.');
      let eventName = 'unknown';
      try { eventName = JSON.parse(text)?.event || 'unknown'; } catch { /* body isn't JSON */ }
      await sendToTelegram(`🚨 <b>RAZORPAY WEBHOOK REJECTED — BAD SIGNATURE</b>\n<b>Event:</b> ${escapeHtml(eventName)}\nRAZORPAY_WEBHOOK_SECRET on the server doesn't match the Razorpay dashboard webhook secret — paid purchases are NOT being credited.`).catch(() => null);
      return NextResponse.json({ status: 'error', message: 'Invalid signature' }, { status: 400 });
    }
    
    const event = JSON.parse(text);
    const { firestore, database } = initializeFirebase();
    const entity = event?.payload?.payment?.entity || event?.payload?.subscription?.entity;
    const subscriptionEntity = event?.payload?.subscription?.entity;
    const notes = { ...(event?.payload?.order?.entity?.notes || {}), ...(entity?.notes || {}) };

    if (event.event === 'payment.authorized' && entity?.id && entity?.order_id) {
        // With auto-capture off, a paid order stays "authorized" (and gets
        // auto-refunded later) and no payment.captured/order.paid ever
        // arrives. Capture it; Razorpay then sends payment.captured, which
        // grants through the branch below.
        const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (keyId && keySecret) {
            try {
                const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
                await razorpay.payments.capture(entity.id, entity.amount, entity.currency);
            } catch (capErr: any) {
                // "already been captured" just means auto-capture is on — fine.
                const msg = capErr?.error?.description || capErr?.message || '';
                if (!/already.*captured/i.test(msg)) reportServerError('src/app/api/webhook/razorpay/route.ts:capture', capErr, { paymentId: entity.id });
            }
        }
    } else if (event.event === 'order.paid' || event.event === 'payment.captured') {
        if (notes.type === 'music_track_purchase') await handleMusicTrackPurchase(firestore, database, entity, event.payload?.order?.entity);
        else if (notes.type === 'product_order' || notes.pendingOrderId) await handleProductPurchase(firestore, database, entity, event.payload?.order?.entity);
        else if (notes.type === 'ad_budget_topup') await createAdFromRazorpayPayment(database, entity, event.payload?.order?.entity);
        else await handleCreditPurchase(firestore, database, entity, event.payload?.order?.entity);
     } else if (event.event === 'subscription.charged') {
        await handleCreditPurchase(firestore, database, entity, undefined, true);
     } else if (['subscription.cancelled', 'subscription.completed', 'subscription.paused', 'subscription.halted'].includes(event.event)) {
         // Cancelled from outside the app too: the user revoking the mandate in
         // their UPI/bank app, a cancel in the Razorpay dashboard, or Razorpay
         // halting it after repeated failed charges.
         const subscriptionId = subscriptionEntity?.id || entity?.subscription_id;
         const eventLabel: Record<string, string> = {
             'subscription.cancelled': 'CANCELLED (mandate revoked / cancelled on Razorpay)',
             'subscription.completed': 'COMPLETED (all billing cycles done)',
             'subscription.paused': 'PAUSED',
             'subscription.halted': 'HALTED (charges kept failing)',
         };
         if (subscriptionId) {
             const matchingUsers = await firestore.collection('users')
                 .where('subscription.subscriptionId', '==', subscriptionId).limit(1).get();
             const nextStatus = event.event === 'subscription.paused' || event.event === 'subscription.halted' ? 'past_due' : 'cancelled';
             if (!matchingUsers.empty) {
                 const userDoc = matchingUsers.docs[0];
                 const u = userDoc.data() || {};
                 await userDoc.ref.update({ 'subscription.status': nextStatus, 'subscription.statusUpdatedAt': new Date().toISOString() });
                 await sendToTelegram(
                     `📡 <b>SUBSCRIPTION ${escapeHtml(eventLabel[event.event])}</b>\n\n` +
                     `<b>By:</b> Razorpay\n` +
                     `<b>User:</b> ${escapeHtml(u.name || 'N/A')} (${escapeHtml(u.email || 'N/A')})\n` +
                     `<b>Plan:</b> ${escapeHtml(u.subscription?.planId || 'N/A')}\n` +
                     `<b>Grants given:</b> ${Number(u.subscription?.weeklyGrantCount || 0)}\n` +
                     `<b>App status now:</b> ${nextStatus}\n` +
                     `<b>Subscription ID:</b> <code>${escapeHtml(subscriptionId)}</code>`
                 );
             } else {
                 await sendToTelegram(
                     `📡 <b>SUBSCRIPTION ${escapeHtml(eventLabel[event.event])}</b>\n\n` +
                     `⚠️ No user in the app has this subscription ID, so nothing was updated.\n` +
                     `<b>Subscription ID:</b> <code>${escapeHtml(subscriptionId)}</code>`
                 );
             }
         }
    }
    return NextResponse.json({ status: 'processed' });
  } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:556', e); 
    console.error('[Razorpay Webhook Exception]:', e);
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 }); 
  }
}
