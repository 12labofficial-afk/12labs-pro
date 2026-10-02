
'use server';

import { requireSelfOrAdmin, SERVER_INTERNAL, type AuthToken } from '@/lib/auth-guard';

import { initializeFirebase } from '@/firebase/server';
import type { UserProfile, UserSubscription } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import { escapeHtml } from '@/lib/utils';
import crypto from 'crypto';
import { reportServerError } from '@/lib/report-error';
import { ticketsForWeek, ticketsBetween } from '@/lib/tickets';
import { needsAutopaySync } from '@/lib/autopay-sync';
import { formatGrantLog, formatTicketLog } from '@/lib/subscription-log';
import { plans } from '@/lib/plans';
import { hashEmailForAbuseCheck } from '@/lib/email-hash';

/**
 * Recursively converts Firestore Timestamps to ISO strings to ensure
 * Server Action responses are serializable.
 */
function serializeProfile(data: any): any {
  if (data === null || data === undefined) return data;
  
  // Handle Firestore Timestamps (they have a toDate method)
  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }
  
  // Handle standard Dates
  if (data instanceof Date) {
    return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeProfile);
  }

  if (typeof data === 'object' && data.constructor === Object) {
    const serialized: any = {};
    for (const key in data) {
      serialized[key] = serializeProfile(data[key]);
    }
    return serialized;
  }

  return data;
}

/**
 * Creates a secure, pseudonymized hash of the device identifier using HMAC-SHA256.
 * It uses process.env.GEMINI_API_KEY as the secret salt. Since .env is ignored by Git,
 * the actual salt remains 100% private and is never pushed to GitHub.
 */
function hashDeviceId(rawDeviceId: string): string {
  // Use server-side Gemini API key as salt; fallback to a safe dev placeholder only for local development
  const salt = process.env.GEMINI_API_KEY || 'development_backup_salt';
  return crypto.createHmac('sha256', salt).update(rawDeviceId).digest('hex');
}

// This function will be called from the client when a new user is detected.
export async function createNewUserProfileOnServer(idToken: string, 
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL?: string | null;
  },
  deviceId: string
): Promise<{ success: boolean; profile?: UserProfile; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, user.uid);
    if (!guard.ok) return { success: false, error: guard.message };
  if (!user.uid || !user.email) {
    return { success: false, error: 'User ID and email are required.' };
  }

  const { firestore, auth: adminAuth, database } = initializeFirebase();
  if (!firestore) {
    console.error("CRITICAL: Firebase Admin Firestore is null in createNewUserProfileOnServer.");
    return { success: false, error: 'Firebase Admin is not initialized on the server.' };
  }

  const userDocRef = firestore.collection('users').doc(user.uid);
  
  // Extract deviceId and hardware signature from device payload (DEV_<id>_HW_<hw>)
  let rawDevId = deviceId || '';
  let rawHwSig = '';
  if (rawDevId.includes('_HW_')) {
    const parts = rawDevId.split('_HW_');
    rawDevId = parts[0].replace(/^DEV_/, '');
    rawHwSig = parts[1] || '';
  }

  const cleanDeviceId = rawDevId && rawDevId !== 'unknown' && rawDevId !== 'server-side' 
    ? hashDeviceId(rawDevId.replace(/[^a-zA-Z0-9_-]/g, '')) 
    : null;

  const cleanHwSig = rawHwSig && rawHwSig !== 'hw_fallback' 
    ? hashDeviceId(rawHwSig.replace(/[^a-zA-Z0-9_-]/g, '')) 
    : null;

  try {
    // Check if profile already exists
    const userDoc = await userDocRef.get();
    if (userDoc.exists) {
      console.warn(`User profile for ${user.uid} already exists. Updating potentially changed details.`);
      const existingData = userDoc.data() as UserProfile;
      if (user.photoURL && existingData.photoURL !== user.photoURL) {
          await userDocRef.update({ photoURL: user.photoURL });
      }
      const profileWithPhoto = { ...existingData, photoURL: user.photoURL || existingData.photoURL };
      return { success: true, profile: serializeProfile(profileWithPhoto) };
    }
    
    // An email whose account was deleted (see deleteMyAccountAction) may sign
    // up again, but without the free signup credits — admins included. This
    // also covers signing up again on a different device, which the device
    // check below can't see.
    const deletedDoc = await firestore.collection('deletedAccounts').doc(hashEmailForAbuseCheck(user.email)).get()
      .catch((e: any) => { reportServerError('src/app/actions.ts:deletedAccounts', e); return null; });
    const isRecreatedAccount = !!deletedDoc?.exists;

    const adminEmails = [
        'toonday378@gmail.com',
        'yrathod18495@gmail.com',
        'Yashsharma4638@gmail.com',
        'abcdtoon30@gmail.com',
        '12labofficial@gmail.com'
    ];
    const isAdmin = adminEmails.includes(user.email);
    
    if (isAdmin && adminAuth) {
        await adminAuth.setCustomUserClaims(user.uid, { role: 'admin' }).catch((e: any) => console.error("Admin claim failed:", e));
    }

    const now = new Date();
    let isAltAccount = false;
    // Admins are not exempt: free signup credits follow the same device rule for everyone.
    let initialCredits = cleanDeviceId ? 2000 : 0;

    // --- MULTI-TIER DEVICE & HARDWARE FINGERPRINT CHECK ---
    if (cleanDeviceId) {
      const deviceDocRef = firestore.collection('devices').doc(cleanDeviceId);
      const deviceDoc = await deviceDocRef.get();

      let matchedDeviceDocRef = deviceDocRef;
      let matchedDeviceData = deviceDoc.exists ? deviceDoc.data() : null;

      // If exact deviceId not found, check matching hardware signature across devices
      if (!matchedDeviceData && cleanHwSig) {
        const hwQuery = await firestore.collection('devices')
          .where('hwSignature', '==', cleanHwSig)
          .limit(1)
          .get();
        if (!hwQuery.empty) {
          matchedDeviceData = hwQuery.docs[0].data();
          matchedDeviceDocRef = hwQuery.docs[0].ref;
        }
      }

      if (!matchedDeviceData) {
        // Genuinely First account on this physical device -> Primary Account (Granted promotional credits)
        await deviceDocRef.set({
          deviceId: cleanDeviceId,
          hwSignature: cleanHwSig || null,
          promoClaimedByUid: user.uid,
          associatedUids: [user.uid],
          createdAt: now.toISOString(),
          lastSeenAt: now.toISOString(),
        });
      } else {
        const promoClaimedByUid = matchedDeviceData?.promoClaimedByUid || matchedDeviceData?.primaryUid;

        if (promoClaimedByUid && promoClaimedByUid !== user.uid) {
          // ALT ACCOUNT DETECTED ON SAME DEVICE OR SAME HARDWARE!
          isAltAccount = true;
          initialCredits = 0; // ZERO FREE CREDITS FOR SECONDARY ACCOUNTS

          await matchedDeviceDocRef.update({
            associatedUids: FieldValue.arrayUnion(user.uid),
            lastSeenAt: now.toISOString(),
          }).catch((e: any) => { reportServerError('src/app/actions.ts:167', e); return null; });

          await sendToTelegram(`🚫 <b>ALT ACCOUNT BLOCKED ON DEVICE</b>\n<b>Alt User:</b> ${user.email}\n<b>Device ID:</b> ${cleanDeviceId}\n<b>Granted Credits:</b> 0 Credits`);
        } else {
          await matchedDeviceDocRef.update({
            lastSeenAt: now.toISOString(),
          }).catch((e: any) => { reportServerError('src/app/actions.ts:173', e); return null; });
        }
      }
    }

    if (isRecreatedAccount && initialCredits > 0) {
      initialCredits = 0;
      await sendToTelegram(`🚫 <b>RE-CREATED ACCOUNT — NO FREE CREDITS</b>\n<b>User:</b> ${escapeHtml(user.email)}\n<b>Reason:</b> This email's previous account was deleted.\n<b>Granted Credits:</b> 0 Credits`).catch(() => null);
    }

    const newUserProfile: UserProfile = {
      uid: user.uid,
      email: user.email,
      name: user.displayName || user.email.split('@')[0],
      credits: initialCredits,
      role: isAdmin ? 'admin' : 'user',
      status: 'active',
      createdAt: now.toISOString(),
      totalInvestment: 0,
      hasMadeFirstPurchase: false, // Explicitly false for new users
      photoURL: user.photoURL || '',
      registeredDeviceId: cleanDeviceId || undefined,
    };

    await userDocRef.set(newUserProfile);
    
    if (database) {
      await (database as any).ref(`creditHistory/${user.uid}`).push({
        amount: initialCredits,
        reason: isAltAccount
          ? 'Blocked free credits (Multiple accounts on device)'
          : isRecreatedAccount
            ? 'No free credits (Account re-created after deletion)'
            : 'Initial credits',
        timestamp: now.toISOString(),
      });
    }

    // Log the new user joined event to RTDB for optimized dashboard counters
    await logSummaryEvent('newUserJoined');

    const createdProfile = serializeProfile(newUserProfile);
    return { success: true, profile: createdProfile };
  } catch (error: any) {
    reportServerError('src/app/actions.ts#1', error);
    console.error('Error creating user profile on server:', error);
    return { success: false, error: error.message || 'Failed to create user profile.' };
  }
}

export async function completeUserOnboardingAction(idToken: string, 
    uid: string,
    name: string,
    age: string
): Promise<{ success: boolean; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, uid);
    if (!guard.ok) return { success: false, error: guard.message };
    const { firestore } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Firebase Admin is not initialized.' };
    try {
        const userRef = firestore.collection('users').doc(uid);
        await userRef.update({
            name,
            age,
            termsAcceptedAt: new Date().toISOString()
        });
        return { success: true };
    } catch (e: any) {
    reportServerError('src/app/actions.ts#2', e);
        return { success: false, error: e.message };
    }
}

export async function getUserProfileFromServer(idToken: string, uid: string, deviceId?: string): Promise<UserProfile | null> {
    const guard = await requireSelfOrAdmin(idToken, uid);
    if (!guard.ok) return null;
    try {
        const { firestore } = initializeFirebase();
        if (!firestore) return null;
        const userDocRef = firestore.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        if (!userDoc.exists) return null;

        let profile = userDoc.data() as UserProfile;

        // Auto-grant pending weekly subscription installments if due
        if (needsAutopaySync(profile)) {
            const syncResult = await syncUserSubscriptionInstallments(idToken, uid);
            if (syncResult.success && syncResult.updatedProfile) {
                profile = syncResult.updatedProfile;
            }
        }

        return serializeProfile(profile);
    } catch (error) {
    reportServerError('src/app/actions.ts#3', error);
        console.error(`Error fetching profile for ${uid}:`, error);
        return null;
    }
}

const syncCooldownMap = new Map<string, number>();

function parseSubscriptionDate(value: any): Date {
    if (value?.toDate && typeof value.toDate === 'function') return value.toDate();
    if (value?._seconds || value?.seconds) {
        return new Date(Number(value._seconds ?? value.seconds) * 1000);
    }
    return new Date(value);
}

/**
 * FIXED ANCHOR LOGIC for Autopay Pro (Consistent Creator Plan)
 * Uses STRICT server-time and anchored 7-day gaps.
 * Awards all pending installments and DEACTIVATES the plan after the 4th grant.
 */
export async function syncUserSubscriptionInstallments(idToken: AuthToken, userId: string): Promise<{ success: boolean; updatedProfile?: UserProfile }> {
    const guard = await requireSelfOrAdmin(idToken, userId);
    if (!guard.ok) return { success: false };
    const { firestore, database } = initializeFirebase();
    if (!firestore) return { success: false };

    // Cost Protection: Prevent spamming sync calls within 30 seconds per user
    const lastCheck = syncCooldownMap.get(userId);
    const nowMs = Date.now();
    if (lastCheck && nowMs - lastCheck < 30000) {
        return { success: true };
    }
    syncCooldownMap.set(userId, nowMs);

    const userRef = firestore.collection('users').doc(userId);
    // Filled by the (last) transaction attempt; pushed to RTDB only after it
    // commits, so a retried transaction can't duplicate the ledger entries.
    let committedHistoryEntries: any[] = [];
    let grantLog: any = null;

    try {
        const result = await firestore.runTransaction(async (transaction: any) => {
            committedHistoryEntries = [];
            grantLog = null;
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) return null;

            const userData = userDoc.data() as UserProfile;
            const sub: any = userData.subscription;
            const queueIn = userData.autopayQueue;
            const ledgerIn = userData.autopayLedger;
            const serverNow = new Date();
            const DAY = 24 * 60 * 60 * 1000;
            const autopay = plans.find(p => p.id === 'autopay_pro');
            const autopayMax = autopay?.maxGrants ?? 4;
            const autopayCredits = autopay?.weeklyCredits ?? 20000;

            const subRunnable = !!sub && (sub.planId === 'autopay_pro' || sub.planId === 'test_sub') && (sub.status === 'active' || sub.status === 'cancelled');

            // ---------- A) No subscription on the user ----------
            // The hourly Firebase function closes a finished plan by deleting
            // `subscription`, and it knows nothing about tickets or queued
            // cycles. Settle what it left behind.
            if (!sub) {
                const queuedCount = Number(queueIn?.count || 0);
                const ledgerOpen = typeof ledgerIn?.week === 'number' && ledgerIn.week < autopayMax;
                if (queuedCount <= 0 && !ledgerOpen) return null;

                let tickets = ledgerOpen ? ticketsBetween('autopay_pro', ledgerIn!.week, autopayMax) : 0;
                let credits = 0;
                const updateData: any = {};
                const notifications: any[] = [];
                const history: any[] = [];
                let startedQueued = false;

                if (queuedCount > 0) {
                    startedQueued = true;
                    credits = autopayCredits;
                    tickets += ticketsForWeek('autopay_pro', 1);
                    updateData.subscription = {
                        planId: 'autopay_pro',
                        status: 'active',
                        ...(queueIn?.subscriptionId ? { subscriptionId: queueIn.subscriptionId } : {}),
                        startDate: serverNow.toISOString(),
                        nextWeeklyGrantDate: new Date(serverNow.getTime() + (autopay?.grantIntervalDays ?? 7) * DAY).toISOString(),
                        weeklyGrantCount: 1,
                        currentCycleMonth: `${serverNow.getFullYear()}-${String(serverNow.getMonth() + 1).padStart(2, '0')}`,
                    };
                    updateData.autopayLedger = { week: 1 };
                    updateData.autopayQueue = queuedCount - 1 > 0
                        ? { count: queuedCount - 1, ...(queueIn?.subscriptionId ? { subscriptionId: queueIn.subscriptionId } : {}) }
                        : FieldValue.delete();
                    history.push({ amount: credits, reason: `${autopay?.name || 'Consistent Creator'}: Week 1 Grant (queued plan started)`, timestamp: serverNow.toISOString() });
                    notifications.push({
                        id: `sub-queued-start-${Date.now()}`,
                        message: `Your next Consistency plan has started: +${credits.toLocaleString()} Credits (Week 1/${autopayMax}).${ticketsForWeek('autopay_pro', 1) ? ' 🎟️ +1 Store Ticket.' : ''}`,
                        timestamp: serverNow.toISOString(), read: false, type: 'credits',
                    });
                } else {
                    updateData.autopayLedger = FieldValue.delete();
                }
                if (credits > 0) updateData.credits = FieldValue.increment(credits);
                if (tickets > 0) {
                    updateData.storeTickets = FieldValue.increment(tickets);
                    if (!startedQueued) {
                        notifications.push({
                            id: `sub-ticket-${Date.now()}`,
                            message: `🎟️ +${tickets} Store Ticket from your Consistency plan — get any Verified Partner asset free.`,
                            timestamp: serverNow.toISOString(), read: false, type: 'credits',
                        });
                    }
                }
                if (credits <= 0 && tickets <= 0 && !startedQueued && !ledgerOpen) return null;

                transaction.update(userRef, updateData);
                if (history.length) {
                    transaction.set(userRef.collection('creditHistory').doc('history_log'), { entries: FieldValue.arrayUnion(...history) }, { merge: true });
                    committedHistoryEntries = history;
                }
                if (notifications.length) {
                    transaction.set(userRef.collection('notifications').doc('user_notifications'), { entries: FieldValue.arrayUnion(...notifications) }, { merge: true });
                }
                grantLog = {
                    kind: 'ticketOnly', started: startedQueued,
                    name: userData.name, email: userData.email, userId, credits, tickets,
                    ticketsAfter: Number(userData.storeTickets || 0) + tickets,
                    balanceAfter: Number(userData.credits || 0) + credits,
                    queuedLeft: Math.max(0, queuedCount - (startedQueued ? 1 : 0)),
                };
                const profile: any = { ...userData, credits: Number(userData.credits || 0) + credits, storeTickets: Number(userData.storeTickets || 0) + tickets };
                if (startedQueued) profile.subscription = updateData.subscription;
                return profile as UserProfile;
            }

            // ---------- B) A running plan ----------
            if (!subRunnable) return null;

            const planSource = plans.find(p => p.id === sub.planId);
            const maxGrants = planSource?.maxGrants ?? 4;
            const isAutopayPlan = sub.planId === 'autopay_pro';
            // queue lives on the user now; fold in the old in-subscription counter
            let queuedCycles = Number(queueIn?.count || 0) + Number(sub.queuedCycles || 0);
            const legacyQueueFolded = Number(sub.queuedCycles || 0) > 0;

            let currentNextGrantDate = parseSubscriptionDate(sub.nextWeeklyGrantDate);
            if (Number.isNaN(currentNextGrantDate.getTime())) {
                throw new Error('Invalid nextWeeklyGrantDate on subscription.');
            }
            let currentWeekCount = Number(sub.weeklyGrantCount || 0);
            const startWeekCount = currentWeekCount;
            let installmentsPaid = 0;
            let totalCreditsToGrant = 0;
            let totalTicketsToGrant = 0;
            const newHistoryEntries: any[] = [];
            const newNotifications: any[] = [];

            // Tickets for weeks the hourly function already paid out. A plan
            // from before tickets existed has no ledger: treat it as settled
            // up to where it is now (no retro tickets).
            let ledgerWeek = typeof ledgerIn?.week === 'number' ? ledgerIn.week : (isAutopayPlan ? currentWeekCount : 0);
            if (isAutopayPlan && currentWeekCount > ledgerWeek) {
                totalTicketsToGrant += ticketsBetween(sub.planId, ledgerWeek, currentWeekCount);
                ledgerWeek = currentWeekCount;
            }

            const grantAmount = planSource?.weeklyCredits ?? (sub.planId === 'test_sub' ? 2 : 20000);
            const planName = planSource?.name || 'Consistency Plan';
            const intervalDays = planSource?.grantIntervalDays ?? 7;
            const unitLabel = intervalDays === 1 ? 'Day' : 'Week';

            // Catch-up Loop: awards every installment that became due while the user was away
            while (serverNow >= currentNextGrantDate && (currentWeekCount < maxGrants || queuedCycles > 0)) {
                // A plan bought while this one was running starts right after it.
                if (currentWeekCount >= maxGrants) {
                    currentWeekCount = 0;
                    queuedCycles--;
                    ledgerWeek = 0;
                }
                // CRITICAL: use the EXACT scheduled date for history
                const scheduledTimestamp = currentNextGrantDate.toISOString();

                totalCreditsToGrant += grantAmount;
                installmentsPaid++;
                currentWeekCount++;

                let ticketsThisWeek = 0;
                if (isAutopayPlan && currentWeekCount > ledgerWeek) {
                    ticketsThisWeek = ticketsBetween(sub.planId, ledgerWeek, currentWeekCount);
                    totalTicketsToGrant += ticketsThisWeek;
                    ledgerWeek = currentWeekCount;
                }

                newHistoryEntries.push({
                    amount: grantAmount,
                    reason: `${planName}: ${unitLabel} ${currentWeekCount} Grant`,
                    timestamp: scheduledTimestamp,
                });

                newNotifications.push({
                    id: `sub-grant-${currentWeekCount}-${Date.now()}`,
                    message: `${unitLabel === 'Day' ? 'Daily' : 'Weekly'} Consistency Grant: +${grantAmount.toLocaleString()} Credits added! (${unitLabel} ${currentWeekCount}/${maxGrants})${ticketsThisWeek ? ` 🎟️ +${ticketsThisWeek} Store Ticket — get any Verified Partner asset free.` : ''}`,
                    timestamp: serverNow.toISOString(),
                    read: false,
                    type: 'credits'
                });

                // ADVANCE THE ANCHOR: strictly move forward by exactly `intervalDays` days
                currentNextGrantDate = new Date(currentNextGrantDate.getTime() + intervalDays * DAY);
            }

            if (totalCreditsToGrant <= 0 && totalTicketsToGrant <= 0 && !legacyQueueFolded) return null;

            // If we've hit the last installment, the plan is deactivated after this grant
            const isPlanFinished = currentWeekCount >= maxGrants && queuedCycles <= 0;
            const updateData: any = {};
            if (totalCreditsToGrant > 0) updateData.credits = FieldValue.increment(totalCreditsToGrant);
            if (totalTicketsToGrant > 0) updateData.storeTickets = FieldValue.increment(totalTicketsToGrant);

            if (totalTicketsToGrant > 0 && totalCreditsToGrant <= 0) {
                newNotifications.push({
                    id: `sub-ticket-${Date.now()}`,
                    message: `🎟️ +${totalTicketsToGrant} Store Ticket from your Consistency plan (${unitLabel} ${currentWeekCount}) — get any Verified Partner asset free.`,
                    timestamp: serverNow.toISOString(), read: false, type: 'credits',
                });
            }

            if (isPlanFinished) {
                updateData.subscription = FieldValue.delete(); // AUTO-DEACTIVATE
                updateData.autopayLedger = FieldValue.delete();
                updateData.autopayQueue = FieldValue.delete();
                newNotifications.push({
                    id: `sub-complete-${Date.now()}`,
                    message: `Congratulations! Your ${maxGrants * intervalDays}-day Consistency Plan is complete. Your credits will expire 30 days from the original purchase date.`,
                    timestamp: serverNow.toISOString(),
                    read: false,
                    type: 'system'
                });
            } else {
                const { queuedCycles: _legacyQueued, ...subRest } = sub;
                updateData.subscription = {
                    ...subRest,
                    weeklyGrantCount: currentWeekCount,
                    nextWeeklyGrantDate: currentNextGrantDate.toISOString(),
                };
                if (isAutopayPlan) updateData.autopayLedger = { week: ledgerWeek };
                updateData.autopayQueue = queuedCycles > 0
                    ? { count: queuedCycles, ...(queueIn?.subscriptionId ? { subscriptionId: queueIn.subscriptionId } : {}) }
                    : FieldValue.delete();
            }

            transaction.update(userRef, updateData);

            grantLog = totalCreditsToGrant > 0 ? {
                source: 'App sync',
                name: userData.name,
                email: userData.email,
                userId,
                planName,
                unit: unitLabel,
                fromWeek: startWeekCount >= maxGrants ? 0 : startWeekCount,
                toWeek: currentWeekCount,
                maxGrants,
                credits: totalCreditsToGrant,
                tickets: totalTicketsToGrant,
                balanceAfter: (userData.credits || 0) + totalCreditsToGrant,
                finished: isPlanFinished,
                queuedLeft: queuedCycles,
                nextGrantAt: isPlanFinished ? null : currentNextGrantDate.toISOString(),
                caughtUp: installmentsPaid > 1,
            } : {
                kind: 'ticketOnly', started: false,
                name: userData.name, email: userData.email, userId, credits: 0, tickets: totalTicketsToGrant,
                ticketsAfter: Number(userData.storeTickets || 0) + totalTicketsToGrant,
                balanceAfter: Number(userData.credits || 0),
                queuedLeft: queuedCycles, week: currentWeekCount, planName,
            };

            if (newHistoryEntries.length) {
                transaction.set(userRef.collection('creditHistory').doc('history_log'), { entries: FieldValue.arrayUnion(...newHistoryEntries) }, { merge: true });
                committedHistoryEntries = newHistoryEntries;
            }
            if (newNotifications.length) {
                transaction.set(userRef.collection('notifications').doc('user_notifications'), { entries: FieldValue.arrayUnion(...newNotifications) }, { merge: true });
            }

            // Updated local profile for an immediate UI refresh
            const updatedProfile: any = {
                ...userData,
                credits: (userData.credits || 0) + totalCreditsToGrant,
                storeTickets: Number(userData.storeTickets || 0) + totalTicketsToGrant,
            };
            if (isPlanFinished) delete updatedProfile.subscription;
            else updatedProfile.subscription = updateData.subscription;
            return updatedProfile as UserProfile;
        });

        if (result && database) {
            for (const entry of committedHistoryEntries) {
                await (database as any).ref(`creditHistory/${userId}`).push(entry)
                    .catch((e: any) => { reportServerError('src/app/actions.ts:installmentHistory', e); return null; });
            }
        }

        if (result) {
            if (grantLog) await sendToTelegram(grantLog.kind === 'ticketOnly' ? formatTicketLog(grantLog) : formatGrantLog(grantLog));
            return { success: true, updatedProfile: serializeProfile(result) };
        }

        return { success: true };
    } catch (error) {
    reportServerError('src/app/actions.ts#4', error);
        console.error("Subscription sync failed:", error);
        return { success: false };
    }
}

/**
 * Global Batch Synchronizer: Scans all users in the system and automatically grants
 * all due subscription installments even if users have never logged in or opened the website.
 */
export async function syncAllPendingSubscriptions(): Promise<{
    success: boolean;
    syncedCount: number;
    syncedUsers: string[];
    error?: string;
}> {
    const { firestore } = initializeFirebase();
    if (!firestore) return { success: false, syncedCount: 0, syncedUsers: [], error: 'Database unavailable' };

    try {
        // Only users that can have something to do: a running/cancelled plan,
        // a queued cycle, or an unsettled ticket after the hourly function
        // closed a plan (it deletes `subscription`).
        const [running, queued, unsettled] = await Promise.all([
            firestore.collection('users').where('subscription.status', 'in', ['active', 'cancelled']).get(),
            firestore.collection('users').where('autopayQueue.count', '>', 0).get(),
            firestore.collection('users').where('autopayLedger.week', '<', plans.find(p => p.id === 'autopay_pro')?.maxGrants ?? 4).get(),
        ]);
        const candidates = new Map<string, any>();
        for (const snap of [running, queued, unsettled]) for (const d of snap.docs) candidates.set(d.id, d);
        const syncedUsers: string[] = [];

        for (const doc of candidates.values()) {
            const data = doc.data() as UserProfile;
            if (needsAutopaySync(data)) {
                const syncRes = await syncUserSubscriptionInstallments(SERVER_INTERNAL, doc.id);
                if (syncRes.success && syncRes.updatedProfile) {
                    syncedUsers.push(`${data.email || doc.id} (Grant ${syncRes.updatedProfile.subscription?.weeklyGrantCount ?? 'done'})`);
                }
            }
        }

        return {
            success: true,
            syncedCount: syncedUsers.length,
            syncedUsers
        };
    } catch (err: any) {
    reportServerError('src/app/actions.ts#5', err);
        console.error('Error during global subscription sync:', err);
        return { success: false, syncedCount: 0, syncedUsers: [], error: err.message };
    }
}

/**
 * 🤖 BOT LOG DISPATCHER
 * Dispatches real-time activity and error logs across all app modules to Telegram Bot.
 */
export async function logBotEventAction(input: {
    moduleName: string;
    userEmail?: string;
    eventType: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING';
    actionDetails: string;
    assetUrl?: string;
    pageUrl?: string;
    errorDetails?: string;
}): Promise<void> {
    try {
        const { moduleName, userEmail = 'Anonymous', eventType, actionDetails, assetUrl, pageUrl, errorDetails } = input;
        const icons: Record<string, string> = {
            INFO: 'ℹ️',
            SUCCESS: '✅',
            ERROR: '🚨',
            WARNING: '⚠️',
        };
        const icon = icons[eventType] || '🤖';
        
        let msg = `${icon} <b>[${escapeHtml(moduleName)}] ${eventType} Signal</b>\n`;
        msg += `<b>User:</b> ${escapeHtml(userEmail)}\n`;
        msg += `<b>Action:</b> ${escapeHtml(actionDetails)}\n`;
        
        if (assetUrl) {
            msg += `<b>🎧 Media Asset:</b> <a href="${escapeHtml(assetUrl)}">${escapeHtml(assetUrl)}</a>\n`;
        }
        if (pageUrl) {
            msg += `<b>🔗 Page URL:</b> <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a>\n`;
        }
        if (errorDetails) {
            msg += `<b>Error Details:</b> <pre>${escapeHtml(errorDetails)}</pre>\n`;
        }
        await sendToTelegram(msg);
    } catch (err: any) {
    reportServerError('src/app/actions.ts#6', err);
        console.error("[Bot Log Dispatch Failure]:", err?.message);
    }
}
