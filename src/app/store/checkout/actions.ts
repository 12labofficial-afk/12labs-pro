'use server';

import { requireSelfOrAdmin, requireUser } from '@/lib/auth-guard';

import Razorpay from 'razorpay';
import { after } from 'next/server';
import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import type { UserProfile, Product, SellerProfile } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { logSummaryEvent } from '@/lib/summary-logger';
import { escapeHtml, formatCredits, wholeCredits } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

import { rateLimit, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
// This will be passed from the client
interface ActionCartItem {
    id: string;
    title: string;
    price: number;
    quantity: number;
    sellerId: string;
    isOneTimePurchase?: boolean;
}

interface RazorpayOrderOutput {
  id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export async function createOrderForCart(idToken: string, 
    cartItems: ActionCartItem[],
    user: UserProfile
): Promise<{ success: true; order: RazorpayOrderOutput } | { success: false; error: string }> {
    const guard = await requireSelfOrAdmin(idToken, user.uid);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!(await rateLimit('order', guard.uid, 15, 600))) return { success: false, error: RATE_LIMIT_MESSAGE };

    if (!user) {
        return { success: false, error: "User not authenticated." };
    }
    if (cartItems.length === 0) {
        return { success: false, error: 'Cart is empty.' };
    }

    const { firestore } = initializeFirebase();

  try {
    const subtotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    // BUYER FEE REVISION: 18% GST + 2% Platform/Handling Fee = 20% total addition
    const GST_RATE = 0.18;
    const PLATFORM_FEE_RATE = 0.02;

    const gstAmount = subtotal * GST_RATE;
    const platformFee = subtotal * PLATFORM_FEE_RATE;
    const totalAmount = subtotal + gstAmount + platformFee;
    const totalAmountInPaise = Math.round(totalAmount * 100);

    const pendingOrderRef = firestore.collection('pendingOrders').doc();
    
    await pendingOrderRef.set({
        buyerId: user.uid,
        buyerEmail: user.email,
        items: cartItems.map(item => ({ 
            productId: item.id, 
            quantity: item.quantity, 
            price: item.price, 
            sellerId: item.sellerId, 
            title: item.title 
        })),
        subtotal: Math.round(subtotal * 100),
        gstAmount: Math.round(gstAmount * 100),
        platformFee: Math.round(platformFee * 100),
        totalAmount: totalAmountInPaise,
        status: 'pending',
        createdAt: new Date().toISOString(),
    });

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const razorpayPublicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;

    if (!razorpayKeyId || !razorpayKeySecret || !razorpayPublicKeyId) {
        throw new Error('Razorpay keys are not configured.');
    }
    
    const razorpay = new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });

    const order = await razorpay.orders.create({
        amount: totalAmountInPaise,
        currency: 'INR',
        receipt: `receipt_${pendingOrderRef.id}`,
        notes: {
            type: 'product_order',
            pendingOrderId: pendingOrderRef.id,
            userId: user.uid,
            productIds: cartItems.map(item => item.id).join(','),
        },
    });

    await pendingOrderRef.update({ razorpayOrderId: order.id });

    return {
        success: true,
        order: {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: razorpayPublicKeyId,
        }
    };
    
  } catch (error: any) {
    reportServerError('src/app/store/checkout/actions.ts#1', error);
    console.error("Error creating order for cart:", error);
    await sendToTelegram(`🚨 **Cart Checkout FAILED**\n*User:* ${user.email}\n*Error:* ${error.message}`);
    return { success: false, error: error.message || "An unknown error occurred." };
  }
}


export async function processFreeOrder(idToken: string, 
    cartItems: ActionCartItem[],
    user: UserProfile
): Promise<{ success: boolean; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, user.uid);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!(await rateLimit('free-order', guard.uid, 10, 600))) return { success: false, error: RATE_LIMIT_MESSAGE };
    if (!user) {
        return { success: false, error: "User not authenticated." };
    }
    if (cartItems.length === 0) {
        return { success: false, error: 'Cart is empty.' };
    }

    const nonFreeItem = cartItems.find(item => item.price > 0);
    if (nonFreeItem) {
        return { success: false, error: 'This flow is only for free products.' };
    }

    const { firestore, database } = initializeFirebase();

    try {
        const productIds = cartItems.map(item => item.id);
        const productRefs = productIds.length > 0 ? productIds.map(id => firestore.collection('products').doc(id)) : [];
        const productDocs = productIds.length > 0 ? await firestore.getAll(...productRefs) : [];
        const productsById = new Map<string, Product | undefined>(productDocs.map((doc: any) => [doc.id, doc.data() as Product]));

        const batch = firestore.batch();
        const createdAt = new Date().toISOString();

        for (const item of cartItems) {
            const orderRef = firestore.collection('storeHistory').doc();
            batch.set(orderRef, {
                userId: user.uid,
                userEmail: user.email,
                productId: item.id,
                productTitle: item.title,
                sellerId: item.sellerId,
                amount: 0,
                currency: 'INR',
                status: 'paid', // Free items are considered paid immediately
                paymentMethod: 'free',
                paymentId: `free_order_${orderRef.id}`, // A unique identifier
                createdAt: createdAt,
                productSnapshot: productsById.get(item.id) || null,
            });

            const productData = productsById.get(item.id);
            if (productData && productData.isOneTimePurchase) {
                const productRef = firestore.collection('products').doc(item.id);
                batch.update(productRef, { status: 'sold', isSold: true, buyerUid: user.uid });
            }
        }

        await batch.commit();

        // Update RTDB for one-time purchases with sold status
        for (const doc of productDocs) {
            if (doc.exists) {
                const productData = doc.data() as Product;
                if (productData.isOneTimePurchase) {
                    const snap = await database.ref(`storeProducts/${doc.id}`).get().catch((e: any) => { reportServerError('src/app/store/checkout/actions.ts:176', e); return null; });
                    if (snap && snap.exists() && snap.val()?.title) {
                        await database.ref(`storeProducts/${doc.id}`).update({ status: 'sold', isSold: true, buyerUid: user.uid });
                    }
                }
            }
        }

        // Clear User Cart
        await database.ref(`carts/${user.uid}`).remove();

        const productTitles = cartItems.map((item: any) => item.title).join(', ');
        await sendToTelegram(`🎁
*Free Product Order Successful!*
*User:* ${user.email}
*Products:* ${productTitles}`);

        return { success: true };

    } catch (error: any) {
    reportServerError('src/app/store/checkout/actions.ts#2', error);
        console.error("Error processing free order:", error);
        await sendToTelegram(`🚨 **Free Order Checkout FAILED**\n*User:* ${user.email}\n*Error:* ${error.message}`);
        return { success: false, error: error.message || "An unknown error occurred." };
    }
}

export async function processCreditOrder(idToken: string, 
    cartItems: ActionCartItem[],
    user: UserProfile
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, user.uid);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!(await rateLimit('credit-order', guard.uid, 15, 600))) return { success: false, error: RATE_LIMIT_MESSAGE };
    if (!user) return { success: false, error: "User not authenticated." };
    if (cartItems.length === 0) return { success: false, error: 'Cart is empty.' };

    const { firestore, database } = initializeFirebase();

    try {
        const subtotalInRupees = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        // Conversion rate: 1rs = 100 credits
        const totalCreditCost = Math.round(subtotalInRupees * 100);

        // Security Check: Credits are ONLY accepted for Verified Partners
        const sellerProfiles: Record<string, SellerProfile> = {};
        for (const item of cartItems) {
            const sellerSnap = await database.ref(`sellerProfiles/${item.sellerId}`).get();
            if (!sellerSnap.exists() || !sellerSnap.val().isVerified) {
                return { success: false, error: "Credits are only accepted for Verified Partner sellers." };
            }
            sellerProfiles[item.sellerId] = sellerSnap.val();
        }

        
        const productIds = cartItems.map(item => item.id);
        const productRefs = productIds.length > 0 ? productIds.map(id => firestore.collection('products').doc(id)) : [];
        const productDocs = productIds.length > 0 ? await firestore.getAll(...productRefs) : [];
        const productsById = new Map<string, any>(productDocs.map((doc: any) => [doc.id, doc.data()]));
        
        const userRef = firestore.collection('users').doc(user.uid);
        let updatedBalance = 0;
        let lastOrderId = '';

        await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User profile not found.");
            
            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < totalCreditCost) {
                throw new Error(`Insufficient credits. You need ${totalCreditCost.toLocaleString()}, but have ${formatCredits(currentCredits)}.`);
            }

            updatedBalance = wholeCredits(Math.max(0, currentCredits - totalCreditCost));
            const createdAt = new Date().toISOString();

            // 1. Deduct Credits
            transaction.update(userRef, { credits: updatedBalance });

            // 3. Process each item using Service Key privileges
            for (const item of cartItems) {
                const orderRef = firestore.collection('storeHistory').doc();
                lastOrderId = `credit_pay_${orderRef.id}`;
                transaction.set(orderRef, {
                    userId: user.uid,
                    userEmail: user.email,
                    productId: item.id,
                    productTitle: item.title,
                    sellerId: item.sellerId,
                    amount: Math.round(item.price * 100),
                    currency: 'INR',
                    status: 'paid',
                    paymentMethod: 'credits',
                    paymentId: lastOrderId,
                    createdAt: createdAt,
                    productSnapshot: productsById.get(item.id) || null,
                });

                if (item.isOneTimePurchase) {
                    transaction.update(firestore.collection('products').doc(item.id), { status: 'sold', isSold: true, buyerUid: user.uid });
                }
            }
        });

        // Written after the transaction commits; inside it, a retried
        // transaction pushed a duplicate entry.
        if (database) {
            await database.ref(`creditHistory/${user.uid}`).push({
                amount: -totalCreditCost,
                reason: `Store Purchase: ${cartItems.map(i => i.title).join(', ')}`,
                timestamp: new Date().toISOString(),
                type: 'usage',
            }).catch((err: any) => { reportServerError('src/app/store/checkout/actions.ts:history', err); return null; });
        }

        // Update RTDB for one-time purchases
        for (const item of cartItems) {
            if (item.isOneTimePurchase) {
                const snap = await database.ref(`storeProducts/${item.id}`).get().catch((e: any) => { reportServerError('src/app/store/checkout/actions.ts:288', e); return null; });
                if (snap && snap.exists() && snap.val()?.title) {
                    await database.ref(`storeProducts/${item.id}`).update({ status: 'sold', isSold: true, buyerUid: user.uid });
                }
            }
        }

        // Clear User Cart
        await database.ref(`carts/${user.uid}`).remove();

        await logSummaryEvent('creditsSpent', totalCreditCost);

        // --- ENHANCED TELEGRAM NOTIFICATION (UNIFIED FORMAT) ---
        const telegramLogLines: string[] = [];
        for (const item of cartItems) {
            const sellerInfo = sellerProfiles[item.sellerId];
            telegramLogLines.push(
                `📦 <b>${escapeHtml(item.title)}</b>\n` +
                `💰 <b>Price:</b> 💎 ${item.price * 100} credits\n` +
                `🏪 <b>Store:</b> ${escapeHtml(sellerInfo?.storeName || 'N/A')}\n`
            );
        }

        const finalTelegramMessage = 
            `🛍️ <b>NEW MARKETPLACE SALE!</b>\n\n` +
            `👤 <b>Buyer:</b> ${escapeHtml(user.email)}\n` +
            `💳 <b>Paid via Credits:</b> 💎 ${totalCreditCost.toLocaleString()} Credits\n\n` +
            telegramLogLines.join('\n') +
            `🆔 <b>Order:</b> <code>${lastOrderId}</code>\n` +
            `📉 <b>New Balance:</b> ${formatCredits(updatedBalance)}`;

        await sendToTelegram(finalTelegramMessage);

        return { success: true, newBalance: updatedBalance };

    } catch (error: any) {
    reportServerError('src/app/store/checkout/actions.ts#3', error);
        console.error("Credit order failed:", error);
        return { success: false, error: error.message || "An unknown error occurred." };
    }
}

/**
 * Spend ONE Store Ticket on ONE Verified Partner asset — free for the buyer,
 * whatever the price. Price, seller and verification are all read here on
 * the server; nothing about the product is trusted from the client. The
 * seller is still credited the full (discounted) price in storeHistory.
 */
export async function redeemTicketForProduct(
    idToken: string,
    productId: string,
    opts: { tier?: string; youtubeChannelLink?: string } = {},
): Promise<{ success: boolean; savedAmount?: number; ticketsLeft?: number; error?: string }> {
    const guard = await requireUser(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    const uid = guard.uid;
    if (!(await rateLimit('ticket-order', uid, 10, 600))) return { success: false, error: RATE_LIMIT_MESSAGE };
    if (!productId || typeof productId !== 'string') return { success: false, error: 'Invalid product.' };

    const { firestore, database } = initializeFirebase();

    try {
        const [productSnap, pricingSnap] = await Promise.all([
            database.ref(`storeProducts/${productId}`).get(),
            database.ref('settings/pricing').get(),
        ]);
        const product = productSnap.exists() ? productSnap.val() : null;
        if (!product?.title || !product?.sellerId) return { success: false, error: 'This item is no longer available.' };
        if (product.status === 'sold' || product.isSold || product.buyerUid) {
            return { success: false, error: 'This item has already been sold.' };
        }
        if (product.sellerId === uid) return { success: false, error: 'You cannot buy your own item.' };

        const sellerSnap = await database.ref(`sellerProfiles/${product.sellerId}`).get();
        const seller = sellerSnap.exists() ? sellerSnap.val() : null;
        if (!seller?.isVerified) {
            return { success: false, error: 'Tickets work only on Verified Partner items.' };
        }

        const tierPrice = opts.tier && product.tieredPricing ? Number(product.tieredPricing[opts.tier]) : NaN;
        const basePrice = Number.isFinite(tierPrice) && tierPrice > 0 ? tierPrice : Number(product.price || 0);
        if (product.requiresYoutubeLink && !String(opts.youtubeChannelLink || '').trim()) {
            return { success: false, error: 'Please add your YouTube channel link first.' };
        }
        const globalDiscount = Number(pricingSnap.val()?.verifiedSellerGlobalDiscount || 0);
        const effectivePrice = globalDiscount > 0 ? Math.floor(basePrice * (1 - globalDiscount / 100)) : basePrice;
        if (effectivePrice <= 0) return { success: false, error: 'This item is already free — no ticket needed.' };

        const owned = await firestore.collection('storeHistory')
            .where('userId', '==', uid).where('productId', '==', productId).where('status', '==', 'paid')
            .limit(1).get();
        if (!owned.empty) return { success: false, error: 'You already own this item.' };

        const userRef = firestore.collection('users').doc(uid);
        const productRef = firestore.collection('products').doc(productId);
        // One fixed order id per (buyer, product): a double click can't spend two tickets on the same item.
        const orderRef = firestore.collection('storeHistory').doc(`ticket_${uid}_${productId}`);
        let ticketsLeft = 0;
        let buyerEmail = '';

        await firestore.runTransaction(async (tx: any) => {
            const [userDoc, productDoc, existingOrder] = await Promise.all([tx.get(userRef), tx.get(productRef), tx.get(orderRef)]);
            if (existingOrder.exists) throw new Error('You already own this item.');
            if (!userDoc.exists) throw new Error('User profile not found.');
            const tickets = Number(userDoc.data()?.storeTickets || 0);
            if (tickets < 1) throw new Error("You don't have any Store Tickets left.");
            const pData = productDoc.exists ? productDoc.data() : null;
            if (pData && (pData.isSold || pData.status === 'sold')) throw new Error('This item has already been sold.');

            ticketsLeft = tickets - 1;
            buyerEmail = userDoc.data()?.email || '';
            const now = new Date().toISOString();

            tx.update(userRef, {
                storeTickets: FieldValue.increment(-1),
                ticketsUsed: FieldValue.increment(1),
                ticketSavings: FieldValue.increment(effectivePrice),
            });
            tx.set(orderRef, {
                userId: uid,
                userEmail: buyerEmail,
                productId,
                productTitle: product.title,
                sellerId: product.sellerId,
                // Seller is paid the normal price; the buyer paid with a ticket.
                amount: Math.round(effectivePrice * 100),
                currency: 'INR',
                status: 'paid',
                paymentMethod: 'ticket',
                paymentId: `ticket_${orderRef.id}`,
                savedAmount: effectivePrice,
                ...(opts.tier ? { selectedTier: String(opts.tier).slice(0, 40) } : {}),
                ...(opts.youtubeChannelLink ? { youtubeChannelLink: String(opts.youtubeChannelLink).slice(0, 300) } : {}),
                createdAt: now,
                productSnapshot: pData || null,
            });
            if (product.isOneTimePurchase && productDoc.exists) {
                tx.update(productRef, { status: 'sold', isSold: true, buyerUid: uid });
            }
        });

        if (product.isOneTimePurchase) {
            await database.ref(`storeProducts/${productId}`)
                .update({ status: 'sold', isSold: true, buyerUid: uid })
                .catch((e: any) => { reportServerError('src/app/store/checkout/actions.ts:ticket-sold', e); return null; });
        }
        await database.ref(`carts/${uid}/${productId}`).remove().catch(() => null);

        after(async () => {
            try {
                const [buyerDoc, sellerUserDoc] = await Promise.all([
                    firestore.collection('users').doc(uid).get(),
                    firestore.collection('users').doc(product.sellerId).get(),
                ]);
                const b = buyerDoc.data() || {};
                const sellerEmail = seller.email || sellerUserDoc.data()?.email || 'N/A';
                const totalSaved = Number(b.ticketSavings || effectivePrice);
                const totalUsed = Number(b.ticketsUsed || 1);
                await sendToTelegram(
                    `🎟️ <b>STORE PURCHASE VIA TICKET</b>\n\n` +
                    `📦 <b>Item:</b> ${escapeHtml(product.title)}\n` +
                    `🏷️ <b>Type:</b> ${escapeHtml(String(product.productType || 'N/A'))}${opts.tier ? ` (${escapeHtml(String(opts.tier))})` : ''}${product.isOneTimePurchase ? ' · Exclusive (now sold)' : ''}\n` +
                    `🆔 <b>Product:</b> <code>${escapeHtml(productId)}</code>\n\n` +
                    `👤 <b>Buyer:</b> ${escapeHtml(buyerEmail)}\n` +
                    `🎫 <b>Tickets:</b> used 1 · ${ticketsLeft} left · ${totalUsed} used in total\n` +
                    `💸 <b>Buyer saved:</b> ₹${effectivePrice} (₹${Math.round(totalSaved).toLocaleString('en-IN')} total with tickets)\n\n` +
                    `🏪 <b>Seller:</b> ${escapeHtml(seller.storeName || 'N/A')} ✅ Verified\n` +
                    `📧 <b>Seller email:</b> ${escapeHtml(sellerEmail)}\n` +
                    `💰 <b>Seller credited:</b> ₹${effectivePrice}${globalDiscount > 0 ? ` (list ₹${basePrice}, ${globalDiscount}% partner discount)` : ''} — paid by 12Labs\n` +
                    `🧾 <b>Order:</b> <code>ticket_${orderRef.id}</code>`
                );
            } catch (e: any) {
                reportServerError('src/app/store/checkout/actions.ts:ticket-telegram', e);
            }
        });

        return { success: true, savedAmount: effectivePrice, ticketsLeft };
    } catch (error: any) {
        reportServerError('src/app/store/checkout/actions.ts#ticket', error);
        const msg = String(error?.message || '');
        const safe = /ticket|sold|profile|own/i.test(msg) ? msg : 'Could not use the ticket. Please try again.';
        return { success: false, error: safe };
    }
}
