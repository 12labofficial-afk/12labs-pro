'use server';

import { requireSelfOrAdmin, type AuthToken } from '@/lib/auth-guard';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import { logSummaryEvent } from '@/lib/summary-logger';
import { getISTDateString, escapeHtml } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

/**
 * 💰 SCRIPT HUB INITIALIZER (pure submission)
 *
 * 🔴 FIX: this used to also fetch pricing, compute the isSponsor/daily-
 * count tier, and run the transaction that ACTUALLY deducted credits —
 * all removed. Not safe for a future native app submitting straight to
 * Firebase (Firestore rules can only pin ownership fields, not a cost
 * field the app also wrote). The charge is now computed
 * (get_script_cost, same settings/pricing script10/20/30 Normal/
 * Discounted keys + tiering as before) and deducted once, server-side,
 * on HF (deduct_script_credits_atomic in server-files/script_generation.py)
 * the moment it picks the job up — including the per-user daily
 * generation count that decides the tier, which moved there too.
 *
 * The SITE-WIDE daily free-generation cap below stays here on purpose:
 * it's a queue-admission gate (should this job even be allowed to be
 * submitted at all, independent of any one user's balance), not a
 * billing amount — same reasoning insufficient-credits handling doesn't
 * need to be, since a bypass here just means slightly more load, never
 * a wrong charge.
 */
export async function deductScriptCreditsAction(idToken: AuthToken, 
    userId: string,
    userEmail: string,
    targetLength: number,
    projectName: string,
    language: string,
    clientTimestamp?: string,
    extraParams?: {
        genre?: string;
        tone?: string;
        audience?: string;
        perspective?: string;
        numberOfCharacters?: string;
        plotSummary?: string;
        additionalInstructions?: string;
        scriptType?: string;
    }
): Promise<{ success: boolean; cost?: number; newCredits?: number; mappingId?: string; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, userId);
    if (!guard.ok) return { success: false, error: guard.message };
    const { firestore, database } = initializeFirebase();
    const today = getISTDateString();

    const mappingId = `STORY_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
    const createdAtIso = clientTimestamp || new Date().toISOString();
    const numericTimestamp = Date.now();

    try {
        // 🚨 CHECK DAILY LIMIT FOR ALL USERS (FREE & PAID)
        if (database) {
            const limitSnap = await database.ref('settings/app/dailyFreeScriptLimit').get();
            const dailyFreeLimit = limitSnap.exists() ? Number(limitSnap.val()) : 40;

            const dailyFreeCountSnap = await database.ref(`dailyFreeScriptGenerations/${today}/count`).get();
            const dailyFreeCount = dailyFreeCountSnap.exists() ? Number(dailyFreeCountSnap.val()) : 0;

            if (dailyFreeCount >= dailyFreeLimit) {
                return {
                    success: false,
                    error: "You can't create more scripts daily script generation limit exceeded come back tomorrow when quota refreshed"
                };
            }
        }

        // Initialize Hub Node in RTDB
        await database.ref(`tempScriptGenerations/${userId}/${mappingId}`).set({
            status: 'pending',
            projectName,
            language,
            createdAt: createdAtIso,
            clientTimestamp: createdAtIso,
            timestamp: numericTimestamp,

            // Added requested fields:
            mappingId,
            userId,
            userEmail: userEmail || 'N/A',
            scriptType: extraParams?.scriptType || projectName || 'story script',
            targetLength,
            type: 'script_generation',
            genre: extraParams?.genre || '',
            tone: extraParams?.tone || '',
            audience: extraParams?.audience || '',
            perspective: extraParams?.perspective || '',
            numberOfCharacters: extraParams?.numberOfCharacters || '',
            plotSummary: extraParams?.plotSummary || '',
            additionalInstructions: extraParams?.additionalInstructions || ''
        });

        // 🚀 SUBMIT SCRIPT PROJECT TO FIRESTORE (`script_projects`)
        const scriptProjectPayload = {
            id: mappingId,
            projectId: mappingId,
            mappingId,
            userId,
            userEmail: userEmail || 'N/A',
            projectName: `AI SCRIPT: ${(projectName || 'Script').slice(0, 32).toUpperCase()}`,
            language,
            targetLength,
            status: 'pending',
            projectType: 'script',
            isScript: true,
            createdAt: createdAtIso,
            clientTimestamp: createdAtIso,
            updatedAt: createdAtIso,
            timestamp: numericTimestamp,

            // Added requested fields:
            scriptType: extraParams?.scriptType || projectName || 'story script',
            type: 'script_generation',
            genre: extraParams?.genre || '',
            tone: extraParams?.tone || '',
            audience: extraParams?.audience || '',
            perspective: extraParams?.perspective || '',
            numberOfCharacters: extraParams?.numberOfCharacters || '',
            plotSummary: extraParams?.plotSummary || '',
            additionalInstructions: extraParams?.additionalInstructions || ''
        };

        // 1. Partitioned user path
        await firestore
            .collection('script_projects')
            .doc(userId)
            .collection('userProjects')
            .doc(mappingId)
            .set(scriptProjectPayload)
            .catch((e: any) => console.error("Firestore script_projects user error:", e));

        // 2. Root collection document
        await firestore
            .collection('script_projects')
            .doc(mappingId)
            .set(scriptProjectPayload)
            .catch((e: any) => console.error("Firestore script_projects root error:", e));

        // Site-wide counter only — the per-user daily count that decides
        // the Discounted-vs-Normal tier now lives entirely on HF (see
        // deduct_script_credits_atomic), since it has to be read/bumped
        // atomically alongside the charge itself.
        if (database) {
            await database.ref(`dailyFreeScriptGenerations/${today}/count`).transaction((curr: any) => (curr || 0) + 1);
        }

        // 📝 Credit history + the dailySummaries 'creditsSpent' counter are
        // now both written by HF's deduct_script_credits_atomic once it
        // actually deducts on pickup — not here, since nothing was
        // charged by this function.

        await sendToTelegram(`💰 <b>Script Hub Initialized</b>\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Project:</b> ${escapeHtml(projectName)}`);

        return { success: true, mappingId };

    } catch (error: any) {
        reportServerError('src/app/script-generator/actions.ts#2', error);
        console.error("[Script Submission Failed]:", error.message);
        return { success: false, error: error.message };
    }
}

/**
 * 🏁 FINALIZE SCRIPT ACTION
 * Saves the received script to Firestore history and cleans up RTDB.
 */
export async function finalizeScriptSelectionAction(idToken: string, input: {
    userId: string;
    userEmail: string;
    userName: string;
    script: string;
    scriptUrl: string;
    mappingId: string;
    generationParams: any;
}): Promise<{ success: boolean; projectId?: string; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, input.userId);
    if (!guard.ok) return { success: false, error: guard.message };
    const { userId, userEmail, script, scriptUrl, mappingId, generationParams } = input;
    
    try {
        const { firestore, database } = initializeFirebase();
        
        const projectId = mappingId; 
        const projectRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);
        
        const projectName = `AI Script: ${generationParams.genre || 'Generation'}`;
        
        // 🚀 SECURE FULL SYNC
        await projectRef.set({ 
            id: projectId, 
            userId, 
            projectName, 
            script: script, 
            scriptUrl: scriptUrl,
            audioUrl: '', 
            createdAt: new Date().toISOString(), 
            generationParams,
            projectType: 'script',
            status: 'completed',
            cost: generationParams.cost || 0 
        });

        // Also sync completion to script_projects
        const updatedPayload = {
            script: script,
            scriptUrl: scriptUrl || '',
            status: 'completed',
            updatedAt: new Date().toISOString()
        };
        await firestore.collection('script_projects').doc(userId).collection('userProjects').doc(projectId).set(updatedPayload, { merge: true }).catch((e: any) => { reportServerError('src/app/script-generator/actions.ts:273', e); return null; });
        await firestore.collection('script_projects').doc(projectId).set(updatedPayload, { merge: true }).catch((e: any) => { reportServerError('src/app/script-generator/actions.ts:274', e); return null; });

        // Cleanup RTDB Node
        await database.ref(`tempScriptGenerations/${userId}/${mappingId}`).remove();

        await logSummaryEvent('scriptsGenerated');
        await sendToTelegram(`✅ <b>Script Hub Secured</b>\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>ID:</b> <code>${projectId}</code>`);
        
        revalidatePath('/history');
        return { success: true, projectId };
    } catch (error: any) {
    reportServerError('src/app/script-generator/actions.ts#3', error); 
        console.error("[Script Finalization Failed]:", error.message);
        return { success: false, error: error.message }; 
    }
}

/**
 * 📊 GET REMAINING SCRIPT QUOTA
 */
export async function getRemainingScriptQuotaAction(): Promise<{ remaining: number; limit: number }> {
    const { database } = initializeFirebase();
    if (!database) return { remaining: 0, limit: 0 };

    const today = getISTDateString();
    
    try {
        const limitSnap = await database.ref('settings/app/dailyFreeScriptLimit').get();
        const dailyFreeLimit = limitSnap.exists() ? Number(limitSnap.val()) : 40;

        const dailyFreeCountSnap = await database.ref(`dailyFreeScriptGenerations/${today}/count`).get();
        const dailyFreeCount = dailyFreeCountSnap.exists() ? Number(dailyFreeCountSnap.val()) : 0;

        return {
            remaining: Math.max(0, dailyFreeLimit - dailyFreeCount),
            limit: dailyFreeLimit
        };
    } catch (error) {
    reportServerError('src/app/script-generator/actions.ts#4', error);
        console.error("Error fetching script quota:", error);
        return { remaining: 0, limit: 0 };
    }
}
