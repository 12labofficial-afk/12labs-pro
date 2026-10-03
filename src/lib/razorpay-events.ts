import 'server-only';

import { after } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { initializeFirebase } from '@/firebase/server';
import { FieldValue } from 'firebase-admin/firestore';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import type * as admin from 'firebase-admin';
import { escapeHtml, getISTDateString } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';
import { handleAffiliateCommission, handleCreditPurchase } from '@/lib/credit-purchase';
import { handleMusicTrackPurchase } from '@/lib/music-purchase';

/**
 * Razorpay event handling, shared by the webhook route and the recovery
 * paths. Every grant below is idempotent (processedPayments / order
 * status), so an event can safely be processed more than once.
 */

export async function handleProductPurchase(
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

    let granted = false;
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

        granted = true;
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
        after(() => sendToTelegram(`🚨 <b>STORE SYNC FAILED</b>\n<b>Payment:</b> <code>${paymentId}</code>\n<b>Error:</b> ${escapeHtml(e.message)}`).catch((e2: any) => { reportServerError('src/app/api/webhook/razorpay/route.ts:telegram2', e2); return null; }));
        // The order wasn't recorded — fail so the event is retried.
        if (!granted) throw e;
    }
}

export /** Order (with its notes) for a payment, or undefined if Razorpay can't be reached. */
async function fetchRazorpayOrder(orderId: string): Promise<any | undefined> {
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return undefined;
    try {
        return await new Razorpay({ key_id: keyId, key_secret: keySecret }).orders.fetch(orderId);
    } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:fetchOrder', e, { orderId });
        return undefined;
    }
}


/** Runs one verified Razorpay event. Throws if the grant did not happen. */
export async function processRazorpayEvent(event: any): Promise<void> {
    const { firestore, database } = initializeFirebase();
    const entity = event?.payload?.payment?.entity || event?.payload?.subscription?.entity;
    const subscriptionEntity = event?.payload?.subscription?.entity;
    // payment.captured carries only the payment — our notes (userId, plan,
    // credits, order type) live on the ORDER. Without them a captured
    // payment used to be granted 0 credits (user found by email) and marked
    // processed, so the order.paid that followed was skipped as a duplicate.
    let orderEntity = event?.payload?.order?.entity;
    if (!orderEntity && entity?.order_id && (event.event === 'payment.captured' || event.event === 'order.paid')) {
        orderEntity = await fetchRazorpayOrder(entity.order_id);
    }
    const notes = { ...(orderEntity?.notes || {}), ...(entity?.notes || {}) };

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
        if (notes.type === 'music_track_purchase') await handleMusicTrackPurchase(firestore, database, entity, orderEntity);
        else if (notes.type === 'product_order' || notes.pendingOrderId) await handleProductPurchase(firestore, database, entity, orderEntity);
        else await handleCreditPurchase(firestore, database, entity, orderEntity);
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
}

// ── Durable inbox ─────────────────────────────────────────────────────
// The webhook stores each verified event here BEFORE answering Razorpay,
// then processes it. A failure leaves the event as 'failed' and it is
// retried later — nothing depends on the webhook request staying alive.

const INBOX = 'webhookEvents';
const MAX_EVENT_ATTEMPTS = 6;

export function webhookEventId(headerId: string | null, rawBody: string): string {
    return (headerId && /^[\w-]{4,128}$/.test(headerId))
        ? headerId
        : `sha_${crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 40)}`;
}

/** Saves the event; returns false if it was already fully processed. */
export async function storeWebhookEvent(eventId: string, rawBody: string, eventName: string): Promise<boolean> {
    const { firestore } = initializeFirebase();
    const ref = firestore.collection(INBOX).doc(eventId);
    return firestore.runTransaction(async (tx: any) => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data()?.status === 'processed') return false;
        if (!snap.exists) {
            tx.set(ref, { eventId, event: eventName, body: rawBody, status: 'received', attempts: 0, receivedAt: new Date().toISOString() });
        }
        return true;
    });
}

/** Processes a stored event once; marks it processed or failed. */
export async function processStoredWebhookEvent(eventId: string): Promise<void> {
    const { firestore } = initializeFirebase();
    const ref = firestore.collection(INBOX).doc(eventId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (data.status === 'processed') return;
    const attempts = Number(data.attempts || 0) + 1;
    try {
        await processRazorpayEvent(JSON.parse(data.body));
        await ref.update({ status: 'processed', attempts, processedAt: new Date().toISOString(), lastError: FieldValue.delete() });
    } catch (e: any) {
        reportServerError('src/lib/razorpay-events.ts:process', e, { eventId });
        const giveUp = attempts >= MAX_EVENT_ATTEMPTS;
        await ref.update({ status: giveUp ? 'dead' : 'failed', attempts, lastError: String(e?.message || e), lastAttemptAt: new Date().toISOString() }).catch(() => null);
        if (attempts === 1 || giveUp) {
            await sendToTelegram(
                `🚨 <b>WEBHOOK EVENT ${giveUp ? 'GAVE UP' : 'FAILED — WILL RETRY'}</b>\n` +
                `<b>Event:</b> ${escapeHtml(data.event || 'unknown')} (<code>${escapeHtml(eventId)}</code>)\n` +
                `<b>Attempt:</b> ${attempts}/${MAX_EVENT_ATTEMPTS}\n` +
                `<b>Error:</b> ${escapeHtml(e?.message || 'unknown')}` +
                (giveUp ? `\n\nGrant manually from Admin → Payments.` : `\n\nIt is retried automatically; the user's payment is also re-checked when they open the app.`)
            ).catch(() => null);
        }
    }
}

/** Retries a few failed events (oldest first). Safe to call often. */
export async function retryFailedWebhookEvents(limit = 3): Promise<void> {
    const { firestore } = initializeFirebase();
    const snap = await firestore.collection(INBOX).where('status', '==', 'failed').limit(limit).get().catch(() => null);
    if (!snap || snap.empty) return;
    const cutoff = Date.now() - 60 * 1000; // give the first attempt a minute
    for (const d of snap.docs) {
        const last = new Date(d.data()?.lastAttemptAt || 0).getTime();
        if (last > cutoff) continue;
        await processStoredWebhookEvent(d.id);
    }
}
