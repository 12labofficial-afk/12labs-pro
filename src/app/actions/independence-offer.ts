'use server';

import { initializeFirebase } from '@/firebase/server';
import { 
  INDEPENDENCE_OFFER_CONFIG, 
  EARNING_START_MS, 
  EARNING_END_MS, 
  CLAIM_START_MS, 
  CLAIM_END_MS, 
  getOfferPhase 
} from '@/lib/independence-offer';
import { getISTDateString, escapeHtml } from '@/lib/utils';
import { sendToTelegram } from '@/lib/telegram-logger';

export interface IndependenceOfferStatus {
  serverNow: number;
  serverISTString: string;
  phase: 'upcoming' | 'earning_active' | 'claim_locked' | 'claim_unlocked' | 'expired';
  earningStart: number;
  earningEnd: number;
  claimStart: number;
  claimEnd: number;
  userData: {
    accumulatedCredits: number;
    claimed: boolean;
    claimedAt: string | null;
    claimedAmount: number;
    history: Array<{
      id: string;
      amount: number;
      reason: string;
      timestamp: number;
      istDate?: string;
    }>;
  } | null;
}

export async function getIndependenceOfferStatus(userId?: string): Promise<IndependenceOfferStatus> {
  const serverNow = Date.now();
  const phase = getOfferPhase(serverNow);
  const serverISTString = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  let userData: IndependenceOfferStatus['userData'] = null;

  if (userId) {
    try {
      const { database, firestore } = initializeFirebase();
      let rawData: any = null;

      if (database) {
        const snapshot = await database.ref(`${INDEPENDENCE_OFFER_CONFIG.RTDB_PATH}/${userId}`).once('value');
        if (snapshot.exists()) {
          rawData = snapshot.val();
        }
      }

      if (!rawData && firestore) {
        const doc = await firestore.collection(INDEPENDENCE_OFFER_CONFIG.FIRESTORE_COLLECTION).doc(userId).get();
        if (doc.exists) {
          rawData = doc.data();
        }
      }

      if (rawData) {
        const historyArray: any[] = [];
        if (rawData.history && typeof rawData.history === 'object') {
          Object.keys(rawData.history).forEach(key => {
            historyArray.push({
              id: key,
              ...rawData.history[key]
            });
          });
          historyArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }

        userData = {
          accumulatedCredits: Number(rawData.accumulatedCredits || 0),
          claimed: Boolean(rawData.claimed),
          claimedAt: rawData.claimedAt || null,
          claimedAmount: Number(rawData.claimedAmount || 0),
          history: historyArray
        };
      }
    } catch (e) {
      console.error('[getIndependenceOfferStatus] Error fetching user data:', e);
    }
  }

  return {
    serverNow,
    serverISTString,
    phase,
    earningStart: EARNING_START_MS,
    earningEnd: EARNING_END_MS,
    claimStart: CLAIM_START_MS,
    claimEnd: CLAIM_END_MS,
    userData
  };
}

/**
 * 🔒 SECURE SERVER-SIDE CLAIM ACTION
 * Prevents client-time cheating:
 * 1. Checks strict server timestamp
 * 2. Checks claim lock status (Unlocks 16 Aug 12:00 AM IST)
 * 3. Atomic Firestore transaction adds credits and marks claimed
 * 4. Updates RTDB and credit history
 */
export async function claimIndependenceCashback(userId: string): Promise<{
  success: boolean;
  claimedCredits?: number;
  newBalance?: number;
  error?: string;
}> {
  if (!userId) return { success: false, error: 'User is not authenticated.' };

  const serverNow = Date.now();
  const phase = getOfferPhase(serverNow);

  if (phase === 'upcoming' || phase === 'earning_active' || phase === 'claim_locked') {
    return {
      success: false,
      error: 'Claiming will unlock on 16th August at 12:00 AM IST. Please wait until then.'
    };
  }

  if (phase === 'expired') {
    return {
      success: false,
      error: 'The 3-day claim window has ended.'
    };
  }

  const { database, firestore } = initializeFirebase();
  if (!firestore) {
    return { success: false, error: 'Database service unavailable.' };
  }

  try {
    const userRef = firestore.collection('users').doc(userId);
    const offerDocRef = firestore.collection(INDEPENDENCE_OFFER_CONFIG.FIRESTORE_COLLECTION).doc(userId);

    // Fetch user's current accumulated cashback from RTDB/Firestore
    let accumulatedCredits = 0;
    let isAlreadyClaimed = false;

    if (database) {
      const rtdbSnap = await database.ref(`${INDEPENDENCE_OFFER_CONFIG.RTDB_PATH}/${userId}`).once('value');
      if (rtdbSnap.exists()) {
        const val = rtdbSnap.val();
        accumulatedCredits = Number(val.accumulatedCredits || 0);
        isAlreadyClaimed = Boolean(val.claimed);
      }
    }

    if (accumulatedCredits === 0 && !isAlreadyClaimed) {
      const docSnap = await offerDocRef.get();
      if (docSnap.exists) {
        const val = docSnap.data();
        accumulatedCredits = Number(val?.accumulatedCredits || 0);
        isAlreadyClaimed = Boolean(val?.claimed);
      }
    }

    if (isAlreadyClaimed) {
      return { success: false, error: 'You have already claimed your Independence Day Cashback!' };
    }

    if (accumulatedCredits <= 0) {
      return { 
        success: false, 
        error: 'You do not have any accumulated cashback credits from 14-15 August.' 
      };
    }

    const claimedAtIso = new Date().toISOString();
    let userEmail = 'Unknown User';

    // Run Atomic Transaction in Firestore
    const updatedBalance = await firestore.runTransaction(async (transaction: any) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('User profile not found.');

      const offerDoc = await transaction.get(offerDocRef);
      if (offerDoc.exists && offerDoc.data()?.claimed === true) {
        throw new Error('Cashback has already been claimed.');
      }

      userEmail = userDoc.data()?.email || 'Unknown User';
      const currentCredits = Number(userDoc.data()?.credits || 0);
      const newCredits = currentCredits + accumulatedCredits;

      transaction.update(userRef, {
        credits: newCredits,
        hasMadeFirstPurchase: true,
        notifications: [
          ...(userDoc.data()?.notifications || []),
          {
            id: `notif_claim_${serverNow}`,
            message: `🎉 100% Independence Day Cashback Claimed: +${accumulatedCredits.toLocaleString()} Credits added to your balance!`,
            timestamp: claimedAtIso,
            read: false,
            type: 'credits'
          }
        ]
      });

      transaction.set(offerDocRef, {
        userId,
        claimed: true,
        claimedAt: claimedAtIso,
        claimedAmount: accumulatedCredits,
        accumulatedCredits,
        claimedTimestamp: serverNow
      }, { merge: true });

      // Record in Firestore creditHistory subcollection
      const firestoreHistoryRef = firestore.collection('users').doc(userId).collection('creditHistory').doc(`hist_${serverNow}_claim`);
      transaction.set(firestoreHistoryRef, {
        amount: accumulatedCredits,
        reason: '🇮🇳 100% Independence Day Cashback Claim',
        timestamp: claimedAtIso,
        type: 'cashback_claim'
      });

      return newCredits;
    });

    // Update Realtime Database
    if (database) {
      await database.ref(`${INDEPENDENCE_OFFER_CONFIG.RTDB_PATH}/${userId}`).update({
        claimed: true,
        claimedAt: claimedAtIso,
        claimedAmount: accumulatedCredits,
        lastUpdated: serverNow
      });

      const historyId = `hist_${serverNow}_claim`;
      await database.ref(`creditHistory/${userId}/${historyId}`).set({
        amount: accumulatedCredits,
        reason: '🇮🇳 100% Independence Day Cashback Claim',
        timestamp: claimedAtIso,
        type: 'cashback_claim'
      });
    }

    // Comprehensive Server Log
    console.log(`\x1b[32m[INDEPENDENCE_CLAIM_SUCCESS]\x1b[0m User: ${userEmail} (${userId}) claimed +${accumulatedCredits} credits. New Balance: ${updatedBalance}`);

    // Send Telegram Notification Log
    try {
      await sendToTelegram(
        `🇮🇳 <b>Independence Day Cashback Claimed!</b>\n` +
        `<b>User:</b> ${escapeHtml(userEmail)}\n` +
        `<b>ID:</b> <code>${userId}</code>\n` +
        `<b>Claimed:</b> <code>+${accumulatedCredits.toLocaleString()} Credits</code>\n` +
        `<b>New Balance:</b> <code>${updatedBalance.toLocaleString()} Credits</code>\n` +
        `<b>Time:</b> <code>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</code>`
      );
    } catch (telegramErr: any) {
      console.error('[claimIndependenceCashback] Failed to send Telegram log:', telegramErr);
    }

    return {
      success: true,
      claimedCredits: accumulatedCredits,
      newBalance: updatedBalance
    };
  } catch (error: any) {
    console.error('[claimIndependenceCashback] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to claim cashback. Please try again.'
    };
  }
}

/**
 * 🛡️ SERVER-SIDE AUTOMATIC CASHBACK TRACKER
 * Checks strict server timestamp (preventing client-time tampering).
 * If within 14-15 Aug window, credits spent are 100% matched into user's cashback pool.
 */
export async function recordIndependenceCashback(
  userId: string,
  creditsSpent: number,
  reason: string,
  userEmail?: string
): Promise<boolean> {
  if (!userId || typeof creditsSpent !== 'number' || creditsSpent <= 0) return false;

  const serverNow = Date.now();
  const phase = getOfferPhase(serverNow);

  // 🔒 STRICT SERVER TIME CHECK: Strictly only accumulate during the active earning window (14-15 August IST)
  // Even if a user changes local device date/time to 15 August, the server timestamp will reject it after 15th Aug 23:59:59 IST.
  if (phase !== 'earning_active') {
    console.log(`\x1b[33m[IndependenceOffer]\x1b[0m Earning inactive (Phase: ${phase}, Server Time: ${new Date(serverNow).toISOString()}). Skipping cashback for user ${userId}.`);
    return false;
  }

  try {
    const { database, firestore } = initializeFirebase();
    const istDate = getISTDateString();
    const istTimeString = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const recordId = `spend_${serverNow}_${Math.random().toString(36).substring(2, 7)}`;

    let resolvedEmail = userEmail || '';
    if (!resolvedEmail && firestore) {
      try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (userDoc.exists) {
          resolvedEmail = userDoc.data()?.email || userDoc.data()?.displayName || '';
        }
      } catch (e) {
        // ignore email fetch error
      }
    }

    let prevCredits = 0;
    let newTotalCredits = creditsSpent;

    // 1. Atomically increment in RTDB for real-time live UI updates
    if (database) {
      const userOfferRef = database.ref(`${INDEPENDENCE_OFFER_CONFIG.RTDB_PATH}/${userId}`);
      
      const txResult = await userOfferRef.transaction((current: any) => {
        if (!current) {
          prevCredits = 0;
          newTotalCredits = creditsSpent;
          return {
            userId,
            userEmail: resolvedEmail,
            accumulatedCredits: creditsSpent,
            claimed: false,
            claimedAt: null,
            claimedAmount: 0,
            lastUpdated: serverNow,
            history: {
              [recordId]: {
                amount: creditsSpent,
                reason,
                timestamp: serverNow,
                istDate
              }
            }
          };
        }

        prevCredits = Number(current.accumulatedCredits || 0);
        newTotalCredits = prevCredits + creditsSpent;

        const newHistory = current.history || {};
        newHistory[recordId] = {
          amount: creditsSpent,
          reason,
          timestamp: serverNow,
          istDate
        };

        return {
          ...current,
          userId,
          userEmail: resolvedEmail || current.userEmail || '',
          accumulatedCredits: newTotalCredits,
          claimed: current.claimed || false,
          lastUpdated: serverNow,
          history: newHistory
        };
      });

      if (txResult.committed && txResult.snapshot.exists()) {
        const val = txResult.snapshot.val();
        newTotalCredits = Number(val.accumulatedCredits || newTotalCredits);
      }
    }

    // 2. Backup in Firestore for permanent record
    if (firestore) {
      const firestoreDocRef = firestore.collection(INDEPENDENCE_OFFER_CONFIG.FIRESTORE_COLLECTION).doc(userId);
      const doc = await firestoreDocRef.get();
      if (!doc.exists) {
        await firestoreDocRef.set({
          userId,
          userEmail: resolvedEmail,
          accumulatedCredits: creditsSpent,
          claimed: false,
          claimedAt: null,
          claimedAmount: 0,
          lastUpdated: serverNow,
          createdAt: serverNow
        });
      } else {
        const prev = doc.data()?.accumulatedCredits || 0;
        await firestoreDocRef.update({
          accumulatedCredits: prev + creditsSpent,
          userEmail: resolvedEmail || doc.data()?.userEmail || '',
          lastUpdated: serverNow
        });
      }
    }

    // 3. Log to Admin RTDB audit trail
    if (database) {
      database.ref(`independence_cashback_2026/admin_logs`).push({
        userId,
        userEmail: resolvedEmail,
        reason,
        creditsSpent,
        prevCredits,
        newTotalCredits,
        timestamp: serverNow,
        istTimeString,
        istDate
      }).catch(() => null);
    }

    // 4. Server Console Log with Detailed Tracking
    console.log(
      `\x1b[36m[INDEPENDENCE_CASHBACK_LOG]\x1b[0m User: ${resolvedEmail || 'Unknown'} (${userId}) | Activity: ${reason} | Added: +${creditsSpent.toLocaleString()} | Previous: ${prevCredits.toLocaleString()} -> New Total: ${newTotalCredits.toLocaleString()} Credits`
    );

    // 5. Send Telegram Notification to Admin
    try {
      await sendToTelegram(
        `🇮🇳 <b>Independence Day Cashback Accumulated!</b>\n\n` +
        `👤 <b>User:</b> ${escapeHtml(resolvedEmail || 'Unknown User')}\n` +
        `🆔 <b>ID:</b> <code>${userId}</code>\n` +
        `🎬 <b>Activity:</b> ${escapeHtml(reason)}\n` +
        `➕ <b>Added Cashback:</b> <code>+${creditsSpent.toLocaleString()} Credits</code>\n` +
        `📊 <b>Previous Total:</b> <code>${prevCredits.toLocaleString()} Credits</code>\n` +
        `💰 <b>New Total To Claim:</b> <code>${newTotalCredits.toLocaleString()} Credits</code>\n` +
        `⏰ <b>Server Time:</b> <code>${istTimeString} IST</code>`
      );
    } catch (telegramErr: any) {
      console.error('[IndependenceOffer] Failed to send Telegram log:', telegramErr);
    }

    return true;
  } catch (error) {
    console.error('[IndependenceOffer] Failed to record cashback:', error);
    return false;
  }
}
