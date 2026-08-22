'use server';

import Razorpay from 'razorpay';
import { FieldValue } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import { applyPromoCode } from './promo-actions';
import { plans } from '@/lib/plans';

interface RazorpayOrderOutput {
  id: string;
  amount: number;
  currency: string;
  key_id: string;
  type: 'order' | 'subscription';
}

/**
 * Creates a secure Razorpay order on the server.
 * The amount is never trusted from the client.
 */
async function createRazorpayOrder(
    razorpayPublicKeyId: string,
    amountInPaise: number, 
    currency: 'INR' | 'USD',
    notes: { [key: string]: string; }
): Promise<RazorpayOrderOutput> {
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret || !razorpayPublicKeyId) {
        console.error('FATAL: Razorpay keys are not configured.');
        throw new Error('The payment system is not configured correctly on the server.');
    }
    
    const razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret,
    });

    // --- SUBSCRIPTION LOGIC ---
    if (notes.productId === 'autopay_pro') {
        const subscription = await razorpay.subscriptions.create({
            plan_id: 'plan_T27TO5CdU4m985',
            total_count: 12, // 1 year of recurring billing
            quantity: 1,
            customer_notify: 1,
            notes: notes,
        });

        return {
            id: subscription.id,
            amount: amountInPaise,
            currency: 'INR',
            key_id: razorpayPublicKeyId,
            type: 'subscription'
        };
    }

    // --- STANDARD ORDER LOGIC ---
    const options = {
        amount: amountInPaise,
        currency: currency,
        receipt: `receipt_order_${new Date().getTime()}`,
        notes: notes,
    };

    try {
        const order = await razorpay.orders.create(options);
        if (!order) {
            throw new Error('Razorpay order creation returned a null or empty response.');
        }
        return {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: razorpayPublicKeyId,
            type: 'order'
        };
    } catch (error: any) {
        console.error('Razorpay API order creation failed:', {
            message: error.message,
            statusCode: error.statusCode,
            error: error.error,
        });
        const errorMessage = error?.error?.description || error.message || 'An unknown error occurred.';
        throw new Error(`Failed to create payment order. Reason: ${errorMessage}`);
    }
}


export async function handlePurchaseAction(
    planId: string, 
    user: { uid: string, name: string | null, email: string | null },
    currency: 'INR' | 'USD',
    promoCode?: string
): Promise<{ success: true; order?: RazorpayOrderOutput; free_purchase?: boolean } | { success: false; error: string }> {
  
  // 🛡️ IDENTITY SYNC CHECK
  if (!user || !user.uid || !user.email) {
    return { success: false, error: 'Identity node missing. Please sign in again.' };
  }
  
  // SECURITY: Never trust client-side price or credits. Look up the plan from server-side source of truth.
  const plan = plans.find(p => p.id === planId);
  if (!plan) {
    return { success: false, error: 'Invalid plan selected. Security protocol triggered.' };
  }

  try {
    const { firestore, database } = initializeFirebase();

    if (!firestore) {
        throw new Error("Firebase Admin / Firestore not available. Please verify server environment variables.");
    }

    const razorpayPublicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '';

    let finalPrice = currency === 'USD' 
        ? plan.priceInUSD 
        : plan.priceInRupees;
    
    // START: Calculate final credits based on bonus (if applicable)
    let finalCredits = plan.credits;
    let bonusCredits = 0;
    
    // SECURITY: Re-verify the promo code on the server before creating any order
    // Note: Consistent Creator (isAutopay) plan has fixed pricing and credits. Promo codes do NOT apply to consistent plans.
    if (promoCode && promoCode.toLowerCase() !== 'yxsh' && !plan.isAutopay) {
        const promoResult = await applyPromoCode(promoCode, user.uid, user.email || '');
        if (!promoResult.success) {
            return { success: false, error: `Promo Code Error: ${promoResult.message}` };
        }
        
        // Handle Price Discount
        if (promoResult.type === 'discount' && promoResult.value) {
            if (promoResult.discountType === 'percentage') {
                finalPrice *= (1 - promoResult.value / 100);
            } else if (promoResult.discountType === 'fixed') {
                const priceInInr = currency === 'USD' ? finalPrice * 85 : finalPrice;
                const newPriceInInr = Math.max(0, priceInInr - promoResult.value);
                finalPrice = currency === 'USD' ? newPriceInInr / 85 : newPriceInInr;
            }
        }

        // Handle Extra Credits Bonus (Affiliate / Special Promos like EXTRA10)
        if (promoResult.type === 'credit_bonus' && promoResult.value) {
            const extraFlat = (promoResult as any).extraFlatCredits || (promoCode.toUpperCase() === 'EXTRA10' ? 2000 : 0);
            bonusCredits = Math.floor(plan.credits * (promoResult.value / 100)) + extraFlat;
            finalCredits += bonusCredits;
        }
    }
    
    const finalAmountInPaise = Math.round(finalPrice * 100);

    // CASE 1: ZERO-COST ACTIVATION
    if (finalAmountInPaise <= 0) {
        await sendToTelegram(`🎁 <b>Zero-Cost Activation (Verified)</b>\n<b>User:</b> ${user.email}\n<b>Plan:</b> ${plan.name}${promoCode ? ` (Code: ${promoCode})` : ''}\n<b>Credits:</b> ${finalCredits.toLocaleString()}`);

        const userRef = firestore.collection('users').doc(user.uid);
        
        if (promoCode && promoCode.toLowerCase() !== 'yxsh') {
            await applyPromoCode(promoCode, user.uid, user.email, true);
        }

        const historyEntry = {
            amount: finalCredits,
            reason: `Purchase - ${plan.name}${promoCode ? ` (Code: ${promoCode})` : ' (Free)'}`,
            timestamp: new Date().toISOString(),
            paymentId: `free_auth_${new Date().getTime()}`,
            orderId: `free_auth_${new Date().getTime()}`,
            amountPaid: 0,
            currency: currency,
            promoCode: promoCode,
            bonusCredits: bonusCredits
        };

        await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("Identity node not found in database.");
            
            transaction.update(userRef, { 
                credits: FieldValue.increment(finalCredits),
                hasMadeFirstPurchase: true 
            });
        });

        await logSummaryEvent('creditsPurchased', finalCredits);
        return { success: true, free_purchase: true };

    } else {
        // CASE 2: RAZORPAY DISPATCH
        const pendingPaymentRef = firestore.collection('pendingPayments').doc();
        const pendingPaymentId = pendingPaymentRef.id;
        
        const notes: { [key: string]: string; } = {
          pendingPaymentId: pendingPaymentId,
          userId: user.uid,
          planName: plan.name,
          productId: plan.id,
          type: plan.isAutopay ? 'subscription_payment' : 'credit_purchase',
          planPrice: String(plan.priceInRupees),
          currency: currency,
          credits: String(finalCredits),
          bonusCredits: String(bonusCredits)
        };
        
        if (promoCode) notes.promoCode = promoCode;
        
        const order = await createRazorpayOrder(razorpayPublicKeyId, finalAmountInPaise, currency, notes);
        
        await pendingPaymentRef.set({ 
            status: 'pending' as const,
            amount: finalAmountInPaise,
            currency: currency,
            userId: user.uid,
            userName: user.name || 'N/A',
            userEmail: user.email || '',
            planName: plan.name,
            credits: finalCredits,
            bonusCredits: bonusCredits,
            createdAt: new Date().toISOString(),
            orderId: order.id,
            promoCode: promoCode || '',
        });
        
        return { success: true, order: order };
    }

  } catch (error: any) {
    console.error("Critical error in handlePurchaseAction:", error);
    return { success: false, error: error.message || "An unknown security error occurred." };
  }
}

export async function cancelSubscriptionAction(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { firestore } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database sync failure.' };

    const userRef = firestore.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        return { success: false, error: 'User profile not found.' };
    }

    const userData = userDoc.data();
    const sub = userData?.subscription;

    if (!sub || sub.status !== 'active') {
        return { success: false, error: 'No active subscription found to cancel.' };
    }

    // 1. Cancel on Razorpay if subscription ID exists and is not test
    const subscriptionId = sub.subscriptionId;
    if (subscriptionId && !subscriptionId.startsWith('test_sub_')) {
        try {
            const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
            const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

            if (razorpayKeyId && razorpayKeySecret) {
                const razorpay = new Razorpay({
                    key_id: razorpayKeyId,
                    key_secret: razorpayKeySecret,
                });
                await razorpay.subscriptions.cancel(subscriptionId);
            }
        } catch (rzpErr: any) {
            console.error('Razorpay-side subscription cancellation error (non-blocking):', rzpErr);
        }
    }

    // 2. Update DB status to 'cancelled' so we prevent further billing / sync
    await userRef.update({
        'subscription.status': 'cancelled'
    });

    await sendToTelegram(`❌ <b>SUBSCRIPTION CANCELLED</b>\n<b>User:</b> ${userData?.email || 'N/A'}\n<b>Plan ID:</b> ${sub.planId}\n<b>Subscription ID:</b> ${subscriptionId || 'None'}`);

    return { success: true };
  } catch (err: any) {
    console.error('Error in cancelSubscriptionAction:', err);
    return { success: false, error: err.message || 'An unknown error occurred during cancellation.' };
  }
}
