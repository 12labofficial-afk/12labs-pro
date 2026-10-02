
'use server';

import { requireSelfOrAdmin, requireAdmin, SERVER_INTERNAL, type AuthToken } from '@/lib/auth-guard';

import { initializeFirebase } from '@/firebase/server';
import type { UserProfile, UserSubscription } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import { escapeHtml } from '@/lib/utils';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { memoryLimit, clientIp } from '@/lib/rate-limit';
import { reportServerError } from '@/lib/report-error';
import { needsAutopaySync, computeAutopaySync } from '@/lib/autopay-sync';
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
    const guard = await requireSelfOrAdmin(idToken, user?.uid);
    if (!guard.ok) return { success: false, error: guard.message };
  if (!user?.uid) {
    return { success: false, error: 'User ID and email are required.' };
  }

  const { firestore, auth: adminAuth, database } = initializeFirebase();
  if (!firestore || !adminAuth) {
    console.error("CRITICAL: Firebase Admin Firestore is null in createNewUserProfileOnServer.");
    return { success: false, error: 'Firebase Admin is not initialized on the server.' };
  }

  // The email (and whether it's verified) comes from Firebase Auth itself —
  // never from the request body. A body-supplied admin email used to get
  // the caller an admin claim.
  let emailVerified = false;
  try {
    const authRecord = await adminAuth.getUser(user.uid);
    user = { ...user, email: authRecord.email || null };
    emailVerified = authRecord.emailVerified === true;
  } catch (e: any) {
    reportServerError('src/app/actions.ts:createProfileAuthLookup', e);
    return { success: false, error: 'Could not verify your account. Please sign in again.' };
  }
  if (!user.email) {
    return { success: false, error: 'User ID and email are required.' };
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
    const isAdmin = emailVerified && adminEmails.map((e) => e.toLowerCase()).includes(user.email.toLowerCase());
    
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

            const out = computeAutopaySync(
                userDoc.data(), userId,
                { increment: (n: number) => FieldValue.increment(n), del: () => FieldValue.delete() },
                new Date(),
            );
            if (!out) return null;

            transaction.update(userRef, out.updateData);
            if (out.history.length) {
                transaction.set(userRef.collection('creditHistory').doc('history_log'), { entries: FieldValue.arrayUnion(...out.history) }, { merge: true });
                committedHistoryEntries = out.history;
            }
            if (out.notifications.length) {
                transaction.set(userRef.collection('notifications').doc('user_notifications'), { entries: FieldValue.arrayUnion(...out.notifications) }, { merge: true });
            }
            grantLog = out.grantLog;
            return out.silent ? null : (out.updatedProfile as UserProfile);
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
export async function syncAllPendingSubscriptions(idToken: AuthToken): Promise<{
    success: boolean;
    syncedCount: number;
    syncedUsers: string[];
    error?: string;
}> {
    // Cron / admin only — it walks every plan holder.
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, syncedCount: 0, syncedUsers: [], error: guard.message };
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
        // Callable from the browser — cap how often one visitor can post.
        if (!memoryLimit(`bot-event:${clientIp(await headers())}`, 20, 60)) return;
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
