import { NextRequest, NextResponse, after } from 'next/server';
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
import { handleMusicTrackPurchase } from '@/lib/music-purchase';

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

        // 🔴 FIX: was a sequential for-loop — one get() then one update()
        // per item, one item at a time. For a multi-item cart this is N
        // round trips stacked in series for no reason (each item's RTDB
        // sync is independent of every other item's), which is exactly
        // the kind of avoidable latency that pushes the webhook's response
        // toward Razorpay's own delivery timeout. Running them in parallel
        // makes this scale with the SLOWEST single item instead of the SUM
        // of all of them.
        await Promise.all(items.map(async (item: any) => {
            const productSnap = await database.ref(`storeProducts/${item.productId}`).get().catch((e: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:249', e); return null; });
            if (productSnap && productSnap.exists() && productSnap.val()?.title) {
                await database.ref(`storeProducts/${item.productId}`).update({ status: 'sold', isSold: true, buyerUid: userId }).catch((e: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:251', e); return null; });
            }
        }));

        // Cart cleanup is a pure side-effect of a completed purchase —
        // nothing reads its result, so it doesn't need to block the
        // response. Scheduled via after() (not naked fire-and-forget) so
        // Vercel keeps the function alive until it actually finishes,
        // instead of risking it getting cut off the instant the response
        // is sent.
        after(() => database.ref(`carts/${userId}`).remove().catch((e: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:255', e); return null; }));

        // 🔴 FIX: the revenue transaction and the Telegram alert it fed
        // were both awaited in series — an RTDB transaction on a SHARED
        // counter node (every store sale that day writes the same
        // dailySummaries/{today}/revenue node) internally retries on write
        // conflicts, so this can get genuinely slow under concurrent
        // traffic. Neither step gates the actual sale (already fully
        // committed above). Moved into after(): the webhook's response no
        // longer waits for it, but — unlike a bare un-awaited promise —
        // Vercel guarantees this still runs to completion, so the
        // Telegram alert is never silently dropped.
        after(async () => {
            const todayStr = getISTDateString();
            const revenueRef = database.ref(`dailySummaries/${todayStr}/revenue`);
            const storeTotalInvestFormatted = tr.totalInvestment !== undefined
                ? `₹${Math.round(tr.totalInvestment).toLocaleString('en-IN')}`
                : `₹${amountInInr}`;
            try {
                const result = await revenueRef.transaction((currentValue) => (currentValue || 0) + amountInInr);
                const newRevenue = result.snapshot.val() || amountInInr;
                const previousRevenue = newRevenue - amountInInr;
                const todayEarningsText = `🤑 <b>Today:</b> ₹${Math.round(previousRevenue).toLocaleString('en-IN')} + ₹${Math.round(amountInInr).toLocaleString('en-IN')} = ₹${Math.round(newRevenue).toLocaleString('en-IN')}`;
                await sendToTelegram(`🛍️ <b>STORE ASSET PURCHASED</b>\n\n<b>User:</b> ${paymentEmail}\n<b>Amount:</b> ₹${amountInInr}\n<b>Total Investment:</b> ${storeTotalInvestFormatted}\n\n${itemDetails}\n\n<b>Status:</b> UNLOCKED\n\n${todayEarningsText}`);
            } catch (e: any) {
                reportServerError('src/app/api/webhook/razorpay/route.ts:telegram1', e);
            }
        });

    } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:267', e);
        console.error("Store purchase sync failed:", e.message);
        after(() => sendToTelegram(`🚨 <b>STORE SYNC FAILED</b>\n<b>Payment:</b> <code>${paymentId}</code>\n<b>Error:</b> ${e.message}`).catch((e2: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:telegram2', e2); return null; }));
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
      // 🔴 FIX: was `await`ed — held the 400 response hostage to Telegram's
      // own round-trip for no reason (this alert doesn't change the
      // response). A slow/degraded Telegram API call here adds pure dead
      // time to every single rejected delivery, which is exactly the kind
      // of thing that pushes a response past Razorpay's own webhook
      // timeout and counts as a failed delivery — repeated failures over
      // 24h are what gets a webhook auto-disabled. Fire-and-forget instead.
      after(() => sendToTelegram(`🚨 <b>RAZORPAY WEBHOOK REJECTED</b>\nNo webhook secret is configured on the server — paid purchases are NOT being credited.`).catch(() => null));
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
      // Same fire-and-forget fix as above.
      after(() => sendToTelegram(`🚨 <b>RAZORPAY WEBHOOK REJECTED — BAD SIGNATURE</b>\n<b>Event:</b> ${escapeHtml(eventName)}\nRAZORPAY_WEBHOOK_SECRET on the server doesn't match the Razorpay dashboard webhook secret — paid purchases are NOT being credited.`).catch(() => null));
      return NextResponse.json({ status: 'error', message: 'Invalid signature' }, { status: 400 });
    }
    
    const event = JSON.parse(text);
    const work = (async () => {
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
                 after(() => sendToTelegram(
                     `📡 <b>SUBSCRIPTION ${escapeHtml(eventLabel[event.event])}</b>\n\n` +
                     `<b>By:</b> Razorpay\n` +
                     `<b>User:</b> ${escapeHtml(u.name || 'N/A')} (${escapeHtml(u.email || 'N/A')})\n` +
                     `<b>Plan:</b> ${escapeHtml(u.subscription?.planId || 'N/A')}\n` +
                     `<b>Grants given:</b> ${Number(u.subscription?.weeklyGrantCount || 0)}\n` +
                     `<b>App status now:</b> ${nextStatus}\n` +
                     `<b>Subscription ID:</b> <code>${escapeHtml(subscriptionId)}</code>`
                 ).catch((e: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:telegram3', e); return null; }));
             } else {
                 after(() => sendToTelegram(
                     `📡 <b>SUBSCRIPTION ${escapeHtml(eventLabel[event.event])}</b>\n\n` +
                     `⚠️ No user in the app has this subscription ID, so nothing was updated.\n` +
                     `<b>Subscription ID:</b> <code>${escapeHtml(subscriptionId)}</code>`
                 ).catch((e: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:telegram4', e); return null; }));
             }
         }
    }
    })();

    // Razorpay counts a delivery as failed if it doesn't get a 2xx within
    // ~5s, and repeated failures auto-disable the webhook. A cold start plus
    // the grant (Razorpay API lookups + Firestore transaction) can get close
    // to that, so past this budget we ack now and let the grant finish in
    // after(). Errors thrown inside the budget still reach the catch below.
    let budgetTimer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
        work.then(() => 'done' as const),
        new Promise<'slow'>((resolve) => { budgetTimer = setTimeout(() => resolve('slow'), WEBHOOK_RESPONSE_BUDGET_MS); }),
    ]);
    clearTimeout(budgetTimer);
    if (outcome === 'slow') {
        const tail = work.catch(async (err: any) => {
            reportServerError('src/app/api/webhook/razorpay/route.ts:slowWork', err);
            await sendToTelegram(`🚨 <b>WEBHOOK BACKGROUND PROCESSING FAILED</b>\n<b>Event:</b> ${escapeHtml(event?.event || 'unknown')}\n<b>Error:</b> ${escapeHtml(err?.message || 'unknown')}\n\nAlready acked to Razorpay (no retry). Grant manually from Admin → Payments → Razorpay Ground Truth.`).catch(() => null);
        });
        after(() => tail);
        return NextResponse.json({ status: 'accepted' });
    }
    return NextResponse.json({ status: 'processed' });
  } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:556', e);
    console.error('[Razorpay Webhook Exception]:', e);
    // A permanent failure (e.g. payer's email matches no account) used to
    // answer 500 on every redelivery; Razorpay retries for ~24h and then
    // auto-disables the whole webhook. Allow a couple of retries for
    // transient errors, then ack with 200 — the failure stays recorded for
    // manual recovery from Admin → Payments.
    const eventId = req.headers.get('x-razorpay-event-id') || `noid_${Date.now()}`;
    let attempts = MAX_WEBHOOK_RETRIES;
    try {
        const { firestore } = initializeFirebase();
        const failRef = firestore.collection('webhookFailures').doc(eventId);
        attempts = await firestore.runTransaction(async (t: any) => {
            const snap = await t.get(failRef);
            const next = Number(snap.exists ? snap.data()?.attempts || 0 : 0) + 1;
            t.set(failRef, { eventId, attempts: next, lastError: String(e?.message || e), lastAttemptAt: new Date().toISOString() }, { merge: true });
            return next;
        });
    } catch (logErr: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:failLog', logErr);
    }
    if (attempts < MAX_WEBHOOK_RETRIES) {
        return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
    }
    after(() => sendToTelegram(`🚨 <b>WEBHOOK EVENT GAVE UP</b>\n<b>Event ID:</b> <code>${escapeHtml(eventId)}</code>\n<b>Error:</b> ${escapeHtml(e?.message || 'unknown')}\n\nAcked to Razorpay so the webhook stays enabled. Grant manually from Admin → Payments.`).catch(() => null));
    return NextResponse.json({ status: 'failed_acknowledged' });
  }
}

const MAX_WEBHOOK_RETRIES = 3;
const WEBHOOK_RESPONSE_BUDGET_MS = 3500;
export const maxDuration = 60;
