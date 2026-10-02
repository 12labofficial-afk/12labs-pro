
'use server';

import { requireSelfOrAdmin, requireUser, requireAdmin, type AuthToken } from '@/lib/auth-guard';

import { initializeFirebase } from '@/firebase/server';
import { Transaction } from 'firebase-admin/firestore';
import type { Character, UserProfile } from '@/lib/types';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent } from '@/lib/summary-logger';
import { ai } from '@/ai/genkit';
import { TTS_MODEL } from '@/ai/config';
import wav from 'wav';
import { escapeHtml, getDisplayUrl, wholeCredits } from '@/lib/utils';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';
import { r2Client, R2_BUCKET } from '@/lib/r2';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from 'crypto';
import { callHFEditingBridge } from '@/ai/engines/hf-bridge';
import { reportServerError } from '@/lib/report-error';
import { getEngineRate } from '@/lib/pricing';
import { refundCreditsWithHistory } from '@/lib/credit-refund';

import { rateLimit, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: 24000,
      bitDepth: 16,
    });
    let bufs = [] as any[];
    writer.on('error', reject);
    writer.on('data', function (d: any) { bufs.push(d); });
    writer.on('end', function () { resolve(Buffer.concat(bufs).toString('base64')); });
    writer.write(pcmData);
    writer.end();
  });
}

// Fast Gen pays up front (deductFastGenCreditsAction) and then renders the
// lines one call at a time. Each paid run adds a character allowance here;
// every TTS call spends from it, so the TTS endpoint can't be called
// directly for free voice. Server-only collection (Firestore rules: admin).
const TTS_BUDGET_COLLECTION = 'ttsBudgets';
// Covers the "[Emotion] " prefix and free retries of failed lines.
const ttsAllowanceFor = (chars: number) => Math.ceil(chars * 1.5) + 300;
const MAX_TTS_TEXT = 5000;

async function addTtsBudget(uid: string, chars: number) {
    const { firestore } = initializeFirebase();
    await firestore.collection(TTS_BUDGET_COLLECTION).doc(uid).set(
        { chars: FieldValue.increment(chars), updatedAt: new Date().toISOString() },
        { merge: true },
    );
}

async function spendTtsBudget(uid: string, chars: number): Promise<boolean> {
    const { firestore } = initializeFirebase();
    const ref = firestore.collection(TTS_BUDGET_COLLECTION).doc(uid);
    return firestore.runTransaction(async (tx: any) => {
        const doc = await tx.get(ref);
        const have = Number(doc.exists ? doc.data()?.chars : 0) || 0;
        if (have < chars) return false;
        tx.set(ref, { chars: have - chars, updatedAt: new Date().toISOString() }, { merge: true });
        return true;
    });
}

export async function generateTtsAudioAction(idToken: string, text: string, voiceId: string, userEmail?: string, workerId?: number, character?: string, lineId?: string): Promise<{ success: boolean; audioDataUri?: string; usedBridge?: boolean; keyName?: string; error?: string }> {
    const guard = await requireUser(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!(await rateLimit('tts', guard.uid, 200, 60))) return { success: false, error: RATE_LIMIT_MESSAGE };
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TTS_TEXT) return { success: false, error: 'Invalid line text.' };

    const chars = text.length;
    const paid = await spendTtsBudget(guard.uid, chars);
    // Admins (e.g. working inside another user's studio) aren't metered.
    if (!paid && !(await requireAdmin(idToken)).ok) {
        return { success: false, error: 'Please start the generation again — this line is not covered by your last payment.' };
    }
    const result = await synthesizeTts(text, voiceId, userEmail, workerId, character, lineId);
    // Nothing was delivered, so the allowance goes back for the retry.
    if (paid && !result.success) await addTtsBudget(guard.uid, chars).catch((e: any) => reportServerError('src/app/studio/actions.ts:ttsRefund', e));
    return result;
}

async function synthesizeTts(text: string, voiceId: string, userEmail?: string, workerId?: number, character?: string, lineId?: string): Promise<{ success: boolean; audioDataUri?: string; usedBridge?: boolean; keyName?: string; error?: string }> {
    try {
        const { database } = initializeFirebase();
        const editingSettingsSnap = await database.ref('settings/editingHfBackend').get();
        const editingSettings = editingSettingsSnap.exists() ? editingSettingsSnap.val() : null;

        if (editingSettings && editingSettings.enabled !== false && editingSettings.url) {
            const hfRes = await callHFEditingBridge(editingSettings.url, {
                text, voiceId, character, userEmail, lineId
            });
            if (hfRes.success && hfRes.audioDataUri) {
                return { success: true, audioDataUri: hfRes.audioDataUri, usedBridge: true, keyName: 'HF-Editing-Backend' };
            }
        }

        const response = await ai.generate({
            model: TTS_MODEL,
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId || 'Algenib' } },
                },
            },
            prompt: text,
            // @ts-ignore
            metadata: { userEmail: userEmail || "Anonymous", taskType: "Synthesis (Fast Gen)", charCount: text.length, workerId }
        }) as any;

        const media = response.media;
        const usedBridge = !!(response.custom as any)?.bridge;
        const keyName = (response.custom as any)?.keyName || 'Unknown';

        if (!media || !media.url) throw new Error('Neural engine failed to output binary audio.');

        const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
        const wavBase64 = await toWav(audioBuffer);
        return { success: true, audioDataUri: `data:audio/wav;base64,${wavBase64}`, usedBridge, keyName };

    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#1', error);
        const errMsg = `🎙️🚨 <b>Synthesis Engine Failure</b>\n\n<b>User:</b> ${escapeHtml(userEmail || 'Anonymous')}\n${error.message}`;
        await sendToTelegram(errMsg);
        return { success: false, error: error.message };
    }
}

export async function completeFastGenerationAction(idToken: string, 
    userId: string,
    userName: string,
    userEmail: string,
    projectName: string,
    script: string,
    audioUrl: string,
    characters: Omit<Character, 'id'>[],
    totalChars: number,
    projectId: string,
    usedBridge: boolean = false,
    keyName: string = 'Unknown',
    syncData?: any
): Promise<{ success: boolean; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, userId);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!(await rateLimit('fastgen-save', guard.uid, 30, 60))) return { success: false, error: RATE_LIMIT_MESSAGE };
    const { firestore } = initializeFirebase();
    try {
        const multiplier = await getEngineRate('gemini');
        const cost = Math.ceil(totalChars * multiplier);
        
        const projectRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);
        
        await projectRef.set({
            id: projectId, userId, projectName, script, audioUrl,
            projectType: 'fast-gen',
            status: 'completed', createdAt: new Date().toISOString(), characters, cost, syncData: syncData || null
        });
        
        await logSummaryEvent('fastVoicesGenerated');

        const headersList = await headers();
        const host = headersList.get('host');
        const protocol = headersList.get('x-forwarded-proto') || 'https';
        const baseUrl = `${protocol}://${host}`;

        const displayAudioUrl = `${baseUrl}${getDisplayUrl(audioUrl)}`;
        const serverIndicator = usedBridge ? '<b>Custom Server 💻</b>' : '<b>Vercel Server 🧬</b>';
        
        const message = `⚡ <b>Generation Ready</b>\n\n<b>User:</b> ${escapeHtml(userEmail)}\n<b>Project:</b> ${escapeHtml(projectName)}\n<b>Stats:</b> ${totalChars} chars / ${cost} credits\n<b>Route:</b> ${serverIndicator}\n\n<b>Link:</b>\n${displayAudioUrl}`;
        await sendToTelegram(message);
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#2', error); return { success: false, error: error.message }; }
}

/**
 * Per-character rate for an engine, read from the admin panel
 * (RTDB settings/pricing) rather than hardcoded.
 *
 * Gemini and 11Labs are priced separately because 11Labs costs us real
 * ElevenLabs characters. Whatever the admin sets is what the studio quotes
 * AND what gets charged — the client's own figure is never trusted, since
 * it's trivially editable in the browser. The client-side quote is derived
 * from the same two keys, so in normal use the two agree exactly.
 */
// (getEngineRate now lives in src/lib/pricing.ts — shared with the
// public API's /api/v1/generate so both charge from the exact same rate,
// read from the exact same settings/pricing RTDB path.)

export async function deductFastGenCreditsAction(idToken: string, 
    userId: string, 
    totalChars: number, 
    projectName: string, 
    projectId: string,
    customCost?: number,
    reasonOverride?: string
): Promise<{ success: boolean; newCredits?: number; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, userId);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!(await rateLimit('fastgen', guard.uid, 30, 60))) return { success: false, error: RATE_LIMIT_MESSAGE };
    // A zero / negative / fractional count would make the charge zero or
    // negative (i.e. add credits) — only whole positive counts are valid.
    if (!Number.isInteger(totalChars) || totalChars <= 0 || totalChars > 2_000_000) {
        return { success: false, error: 'Invalid script length.' };
    }
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    
    const multiplier = await getEngineRate('gemini');
    const serverCost = Math.ceil(totalChars * multiplier);
    // The client sends what it quoted; we charge the server's own figure.
    // Only ever take the client's number when it is HIGHER (it may have
    // priced a longer script than the count we were handed) — never lower,
    // or the price becomes editable from the browser.
    const cost = typeof customCost === 'number' && customCost > serverCost ? Math.ceil(customCost) : serverCost;

    try {
        // Voice replacement requests are asynchronous. Do not charge again while
        // the same project already has a swap waiting or being processed.
        // Completed/failed jobs remain retryable, but in-flight jobs are not.
        if (reasonOverride?.startsWith('Voice Edit:')) {
            const activeSwapSnapshot = await database
                .ref('voice_replacement')
                .orderByChild('projectId')
                .equalTo(projectId)
                .get();
            const hasActiveSwap = activeSwapSnapshot.exists() &&
                Object.values(activeSwapSnapshot.val() || {}).some((job: any) =>
                    job?.userId === userId &&
                    ['pending', 'processing'].includes(String(job?.status || '').toLowerCase())
                );
            if (hasActiveSwap) {
                return {
                    success: false,
                    error: 'A voice replacement is already in progress for this project.'
                };
            }
        }

        const result = await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("User profile missing.");
            
            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < cost) {
                throw new Error(`Insufficient credits. Required: ${cost.toLocaleString()}, Available: ${currentCredits.toLocaleString()}.`);
            }
            
            const updatedBalance = wholeCredits(Math.max(0, currentCredits - cost));
            transaction.update(userRef, { credits: updatedBalance, hasMadeFirstPurchase: true });
            return updatedBalance;
        });

        await database.ref(`creditHistory/${userId}`).push({
            amount: -cost,
            reason: reasonOverride || `Fast Gen: ${projectName}`,
            timestamp: new Date().toISOString(),
            // Refunds (studio.py / 11.py) already tag themselves "refund";
            // deductions were untagged, so the ledger couldn't be filtered
            // by kind. The UI keys off the sign of `amount`, so this is
            // additive and changes nothing on screen.
            type: 'deduction',
            totalChars,
            rate: multiplier,
            projectId
        });

        if (!reasonOverride) {
            await addTtsBudget(userId, ttsAllowanceFor(Math.max(0, Number(totalChars) || 0)));
        }

        await logSummaryEvent('creditsSpent', cost);
        return { success: true, newCredits: result };
    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#3', error); return { success: false, error: error.message }; }
}

export async function processHighQualityGenerationAndDeductCredits(idToken: AuthToken, 
  userId: string, 
  userName: string, 
  userEmail: string, 
  projectName: string, 
  script: string, 
  characters: Omit<Character, 'id'>[], 
  totalInvestment: number, 
  totalChars: number,
  syncData?: any,
  providedProjectId?: string,
  // 🔴 NEW: no longer read — cost computation moved entirely to HF (see
  // below). Kept in the signature only so existing positional call sites
  // (studio-provider.tsx, api/v1/generate/route.ts) don't need to change.
  customCost?: number,
  // Which engine renders the audio. 'gemini' keeps the existing path
  // untouched (pending_projects -> studio.py). 'elevenlabs' routes the
  // same analysed script to 11_projects -> 11.py instead. The per-
  // character voice ids in `characters` are already whatever the user
  // picked for that engine, so nothing else about the payload changes.
  voiceEngine: 'gemini' | 'elevenlabs' = 'gemini'
): Promise<{ success: boolean; newCredits?: number; projectId?: string; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, userId);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!(await rateLimit('hq-submit', guard.uid, 20, 60))) return { success: false, error: RATE_LIMIT_MESSAGE };
    // 🔴 FIX: a submission with an empty (or missing) dialogues array used
    // to sail straight through — a Firestore project doc created and a job
    // queued with total_dialogues: 0. Nothing exists for the worker to
    // synthesize, so the job never advances: the frontend shows "…/…
    // Signals" and sits at 0% forever. Rejected here, before queuing.
    if (!Array.isArray(syncData?.dialogues) || syncData.dialogues.length === 0) {
        return { success: false, error: 'No dialogue lines to generate. Nothing was submitted.' };
    }

    const { firestore, database } = initializeFirebase();
    // 🔴 FIX: providedProjectId (the client's hqSubmissionId) is minted once
    // per script ANALYSIS, not per generation — if the same analysis gets
    // generated with both engines (e.g. a quick engine switch before the
    // first submission's state reset lands), both calls carried the exact
    // same providedProjectId, so the second transaction.set() below fully
    // overwrote the first engine's Firestore project doc — one generation
    // silently vanished from History. Suffixing with the engine keeps a
    // legitimate same-engine resume mapped to the same doc as before
    // (deterministic), while a cross-engine reuse now lands in a separate
    // doc instead of colliding.
    const projectId = providedProjectId
        ? `${providedProjectId}_${voiceEngine}`
        : `HQ_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
    const createdAt = syncData?.clientTimestamp || new Date().toISOString();

    const isElevenLabs = voiceEngine === 'elevenlabs';
    const rtdbNode = isElevenLabs ? '11_projects' : 'pending_projects';

    const projectRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);

    try {
        // 🔴 FIX: this used to also read the user's balance for a precheck
        // and compute a cost/creditCost estimate to write here — both
        // removed. This function is now pure submission: NO billing logic
        // runs on Vercel at all, not even a read-only check. The charge is
        // computed and deducted exactly once, server-side, on HF
        // (deduct_credits_atomic in studio.py/11.py) the moment it picks
        // the job up — from the dialogues actually queued, never from a
        // client-supplied number — making HF the single billing authority
        // for both the website and the future app (which will submit
        // straight to Firebase, bypassing this file entirely). HF writes
        // the real cost/creditCost into both the RTDB queue node and this
        // Firestore doc as soon as it starts processing, so History/
        // progress UI always shows the true charged amount, not an
        // estimate. If the user's balance turns out to be insufficient,
        // HF rejects the job there (status: 'error') instead of here.
        await projectRef.set({
            id: projectId, userId, projectName, script, characters,
            status: 'in_queue', projectType: 'hq-submission', voiceEngine,
            createdAt: createdAt, clientTimestamp: createdAt, timestamp: Date.now(), audioUrl: '', syncData: syncData || null
        });

        // 🔴 FIX: this is the write that actually hands the job to the
        // worker (studio.py/11.py listen on this RTDB node, not on the
        // Firestore doc). Caught separately so a failure here just marks
        // the doc errored — nothing was ever charged by this function, so
        // there's no refund path needed.
        try {
            await database.ref(`${rtdbNode}/${projectId}`).set({
                status: 'in_queue',
                voiceEngine,
                // Tells 11.py which Firestore collection holds the doc the
                // frontend actually reads, so it updates the right one.
                firestoreCollection: 'projects',
                userId,
                userEmail: userEmail || '',
                projectName: projectName || 'Untitled',
                characters: characters || [],
                dialogues: syncData?.dialogues || [],
                genre: syncData?.genere || syncData?.genre || 'general',
                genere: syncData?.genere || syncData?.genre || 'general',
                toneGuidance: syncData?.toneGuidance || '',
                queuedAt: Date.now(),
                timestamp: Date.now(),
                // Extra fields for website backend tracking
                id: projectId,
                userName,
                script,
                createdAt,
                clientTimestamp: createdAt,
                projectType: 'hq-submission',
                syncData: syncData || null,
                total_dialogues: (syncData?.dialogues || []).length,
                processed_dialogues: 0,
                rejected_nodes: 0
            });
        } catch (queueErr: any) {
            reportServerError('src/app/studio/actions.ts#queueFailed', queueErr, { userId, projectId });
            await projectRef.set({ status: 'error', error: 'Failed to queue for the production worker.' }, { merge: true }).catch(() => null);
            await sendToTelegram(`🚨 <b>HQ JOB FAILED TO QUEUE</b>\n<b>User:</b> ${escapeHtml(userEmail || userId)}\n<b>Project:</b> ${escapeHtml(projectName || 'Untitled')}\n<b>Error:</b> ${escapeHtml(queueErr.message)}`).catch(() => null);
            return { success: false, error: 'Could not start generation. Please try again.' };
        }

        return { success: true, projectId: projectId };
    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#4', error);
        return { success: false, error: error.message };
    }
}

export async function regenerateLineWithCreditsAction(idToken: string, userId: string, text: string, voiceId: string): Promise<{ success: boolean; audioDataUri?: string; error?: string; newCredits?: number }> {
    const guard = await requireSelfOrAdmin(idToken, userId);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!(await rateLimit('tts-regen', guard.uid, 30, 60))) return { success: false, error: RATE_LIMIT_MESSAGE };
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TTS_TEXT) return { success: false, error: 'Invalid line text.' };
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    const cost = Math.ceil(text.length * await getEngineRate('gemini'));
    let charged = false;
    
    try {
        if (!R2_BUCKET) throw new Error("R2 Node: Bucket ID missing.");

        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error("User node not found.");
        const userEmail = userDoc.data()?.email;

        const newBalance = await firestore.runTransaction(async (transaction: any) => {
            const freshUserDoc = await transaction.get(userRef);
            const currentCredits = freshUserDoc.data()?.credits || 0;
            if (currentCredits < cost) throw new Error(`Required: ${cost.toLocaleString()}, Available: ${currentCredits.toLocaleString()}.`);
            const updated = wholeCredits(Math.max(0, currentCredits - cost));
            transaction.update(userRef, { credits: updated, hasMadeFirstPurchase: true });
            return updated;
        });
        charged = true;

        // Write the ledger entry immediately after the successful deduction so
        // failed/slow audio generation cannot make the credit history disappear.
        if (database) {
            await database.ref(`creditHistory/${userId}`).push({
                amount: -cost,
                reason: `Voice Edit / Regenerate Line`,
                timestamp: new Date().toISOString(),
            });
        }

        const genResult = await synthesizeTts(text, voiceId, userEmail);
        if (!genResult.success || !genResult.audioDataUri) throw new Error(genResult.error);

        const parts = genResult.audioDataUri.split(';base64,');
        const buffer = Buffer.from(parts[1], 'base64');
        const nodeUuid = crypto.randomUUID().split('-')[0];
        const objectKey = `public/editor/overrides/${userId}/${Date.now()}_${nodeUuid}.wav`;
        
        await r2Client.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: objectKey,
            Body: buffer,
            ContentType: 'audio/wav',
        }));
        
        const r2PublicUrl = `pub://${objectKey.replace('public/', '')}`;
        await logSummaryEvent('creditsSpent', cost);

        return { success: true, audioDataUri: getDisplayUrl(r2PublicUrl), newCredits: newBalance };
    } catch (error: any) {
        reportServerError('src/app/studio/actions.ts#5', error);
        // Credits are taken before generating; if generation or the upload
        // then fails the user got nothing, so give them back.
        if (charged) await refundCreditsWithHistory(userId, cost, 'Refund: Voice Edit / Regenerate Line failed');
        return { success: false, error: error.message };
    }
}

export async function createCharacterVoiceReplacementJobAction(idToken: string, {
    projectId,
    userId,
    character,
    newVoiceId,
    replacements,
    syncData,
    projectAudioUrl
}: {
    projectId: string;
    userId: string;
    character?: string;
    newVoiceId?: string;
    replacements?: { charName: string; newVoiceId: string }[];
    syncData: any;
    projectAudioUrl?: string;
}): Promise<{
    success: boolean;
    jobId?: string;
    editedAudioUrl?: string;
    newCredits?: number;
    updatedSyncData?: any;
    error?: string;
}> {
    const guard = await requireSelfOrAdmin(idToken, userId);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!(await rateLimit('voice-swap', guard.uid, 20, 60))) return { success: false, error: RATE_LIMIT_MESSAGE };
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    let cost = 0;
    let charged = false;
    let refunded = 0;
    
    try {
        if (!syncData || !syncData.dialogues || !Array.isArray(syncData.dialogues)) {
            throw new Error("Invalid project dialogue data.");
        }

        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error("User record not found.");
        const userEmail = userDoc.data()?.email || '';

        // Build replacement map
        const swapMap = new Map<string, string>();
        if (replacements && replacements.length > 0) {
            replacements.forEach(r => {
                if (r.charName && r.newVoiceId) {
                    swapMap.set(r.charName.toLowerCase().trim(), r.newVoiceId);
                }
            });
        } else if (character && newVoiceId) {
            swapMap.set(character.toLowerCase().trim(), newVoiceId);
        }

        if (swapMap.size === 0) {
            throw new Error("No character voice mappings specified.");
        }

        // Find affected dialogues
        const dialogues = [...syncData.dialogues];
        const affectedIndices: { idx: number; charName: string; voiceId: string }[] = [];
        dialogues.forEach((d: any, idx: number) => {
            const charLow = (d.character || '').toLowerCase().trim();
            if (swapMap.has(charLow)) {
                affectedIndices.push({ idx, charName: d.character, voiceId: swapMap.get(charLow)! });
            }
        });

        if (affectedIndices.length === 0) {
            throw new Error("No dialogues match the selected character(s).");
        }

        // Calculate character length & credits
        const totalChars = affectedIndices.reduce((acc, item) => acc + (dialogues[item.idx].line || '').length, 0);
        const rate = await getEngineRate('gemini');
        cost = Math.max(1, Math.ceil(totalChars * rate));

        // Deduct credits
        const newBalance = await firestore.runTransaction(async (transaction: any) => {
            const freshUserDoc = await transaction.get(userRef);
            const currentCredits = freshUserDoc.data()?.credits || 0;
            if (currentCredits < cost) {
                throw new Error(`Insufficient credits. Required: ${cost.toLocaleString()}, Available: ${currentCredits.toLocaleString()}.`);
            }
            const updated = wholeCredits(Math.max(0, currentCredits - cost));
            transaction.update(userRef, { credits: updated, hasMadeFirstPurchase: true });
            return updated;
        });
        charged = true;

        // Record credit history
        await database.ref(`creditHistory/${userId}`).push({
            amount: -cost,
            reason: `Voice Swap (${affectedIndices.length} dialogues): ${character || 'Bulk Cast'}`,
            timestamp: new Date().toISOString(),
            projectId
        });

        await logSummaryEvent('creditsSpent', cost);

        // 1. Create RTDB editingjobs record (Lightweight payload without heavy scriptJson to save RTDB storage/bandwidth)
        const jobId = `job_${Date.now()}_${crypto.randomUUID().split('-')[0]}`;
        const originalAudioUrl = projectAudioUrl || syncData?.audioUrl || "";

        const initialJobRecord = {
            jobId,
            projectId,
            userId,
            character: character || Array.from(swapMap.keys()).join(', '),
            newVoiceId: newVoiceId || '',
            status: 'pending',
            progress: 0,
            cost,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await database.ref(`editingjobs/${jobId}`).set(initialJobRecord);

        // 2. Start Processing Job
        await database.ref(`editingjobs/${jobId}`).update({
            status: 'processing',
            progress: 5,
            updatedAt: new Date().toISOString()
        });

        let processedCount = 0;
        let primaryOverrideUrl = '';
        let failedLines = 0;
        let failedChars = 0;

        for (const item of affectedIndices) {
            const lineText = dialogues[item.idx].line;
            const genResult = await generateTtsAudioAction(idToken, lineText, item.voiceId, userEmail);

            if (genResult.success && genResult.audioDataUri) {
                const parts = genResult.audioDataUri.split(';base64,');
                const buffer = Buffer.from(parts[1], 'base64');
                // 💡 Deterministic objectKey per project and node index: Overwrites existing R2 file to avoid double storage charges!
                const objectKey = `public/editor/overrides/${userId}/${projectId}_node_${item.idx}.wav`;

                if (R2_BUCKET) {
                    await r2Client.send(new PutObjectCommand({
                        Bucket: R2_BUCKET,
                        Key: objectKey,
                        Body: buffer,
                        ContentType: 'audio/wav',
                    }));
                    const r2PublicUrl = `pub://${objectKey.replace('public/', '')}`;
                    const fullOverrideUrl = getDisplayUrl(r2PublicUrl);
                    dialogues[item.idx] = {
                        ...dialogues[item.idx],
                        audioOverridden: fullOverrideUrl,
                        useOverride: true
                    };
                    if (!primaryOverrideUrl) primaryOverrideUrl = fullOverrideUrl;
                } else {
                    dialogues[item.idx] = {
                        ...dialogues[item.idx],
                        audioOverridden: genResult.audioDataUri,
                        useOverride: true
                    };
                    if (!primaryOverrideUrl) primaryOverrideUrl = genResult.audioDataUri;
                }
            } else {
                failedLines++;
                failedChars += (lineText || '').length;
            }

            processedCount++;
            const currentProgress = Math.min(95, Math.round(10 + (processedCount / affectedIndices.length) * 85));
            await database.ref(`editingjobs/${jobId}`).update({
                progress: currentProgress,
                updatedAt: new Date().toISOString()
            });
        }

        // Lines that failed to generate were charged but not delivered —
        // refund their share (all of it if every line failed).
        if (failedLines > 0) {
            const owed = failedLines === affectedIndices.length ? cost : Math.min(cost, Math.floor(failedChars * rate));
            refunded += await refundCreditsWithHistory(
                userId, owed,
                `Refund: Voice Swap — ${failedLines}/${affectedIndices.length} dialogue(s) failed`,
                { projectId }
            );
        }

        // Update voice assignments map
        const newVoiceAssignments = { ...(syncData.voiceAssignments || {}) };
        swapMap.forEach((vId, charKey) => {
            const existingKey = Object.keys(newVoiceAssignments).find(k => k.toLowerCase() === charKey);
            newVoiceAssignments[existingKey || charKey] = vId;
        });

        const updatedSyncData = {
            ...syncData,
            dialogues,
            voiceAssignments: newVoiceAssignments
        };

        const editedAudioUrl = primaryOverrideUrl || originalAudioUrl;

        // 3. Complete Job in RTDB & schedule auto-cleanup to save RTDB space
        await database.ref(`editingjobs/${jobId}`).update({
            status: 'completed',
            progress: 100,
            editedAudioUrl,
            updatedAt: new Date().toISOString()
        });

        // 🧹 Auto cleanup editing job node from RTDB after 30 seconds to prevent RTDB database clutter
        setTimeout(async () => {
            try {
                await database.ref(`editingjobs/${jobId}`).remove();
            } catch (err) {
    reportServerError('src/app/studio/actions.ts#6', err);
                console.warn(`[RTDB Cleanup] Failed to remove editingjob ${jobId}:`, err);
            }
        }, 30000);

        // 4. Update RTDB projectEdits
        await database.ref(`projectEdits/${projectId}`).set({
            ownerId: userId,
            syncData: updatedSyncData,
            editedAudioUrl,
            updatedAt: new Date().toISOString()
        });

        // 5. Update Firestore Project document
        const partitionedRef = firestore.collection('projects').doc(userId).collection('userProjects').doc(projectId);
        const partitionedDoc = await partitionedRef.get();

        const firestoreUpdate = {
            syncData: updatedSyncData,
            editedAudioUrl,
            edited_audio_url: editedAudioUrl,
            updatedAt: new Date().toISOString()
        };

        if (partitionedDoc.exists) {
            await partitionedRef.update(firestoreUpdate);
        } else {
            const proRef = firestore.collection('pro_projects').doc(userId).collection('userProjects').doc(projectId);
            const proDoc = await proRef.get();
            if (proDoc.exists) {
                await proRef.update(firestoreUpdate);
            } else {
                const legacyRef = firestore.collection('projects').doc(projectId);
                const legacyDoc = await legacyRef.get();
                if (legacyDoc.exists) {
                    await legacyRef.update(firestoreUpdate);
                }
            }
        }

        revalidatePath('/history');

        return {
            success: true,
            jobId,
            editedAudioUrl,
            newCredits: newBalance + refunded,
            updatedSyncData
        };

    } catch (error: any) {
    reportServerError('src/app/studio/actions.ts#7', error);
        console.error("createCharacterVoiceReplacementJobAction failed:", error);
        // Failed after charging — return whatever hasn't been refunded yet.
        if (charged && cost > refunded) {
            await refundCreditsWithHistory(userId, cost - refunded, 'Refund: Voice Swap failed', { projectId });
        }
        return { success: false, error: error.message || 'Job creation failed' };
    }
}
