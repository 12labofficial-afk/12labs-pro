'use server';

import { initializeFirebase } from '@/firebase/server';
import type { Character, UserProfile } from '@/lib/types';
import { logSummaryEvent } from '@/lib/summary-logger';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { reportServerError } from '@/lib/report-error';

/**
 * 🎙️ PRO STUDIO DISPATCHER (v4.2 - PRO_PROJECTS NODE SYNC)
 * ---------------------------------------
 * Fixed: Writes to 'pro_projects' node in RTDB instead of 'pending_projects'.
 * Fixed: Explicitly places 'dialogues' at root of RTDB node for backend sync.
 */
export async function processProStudioGenerationAndDeductCredits(
  userId: string, 
  userName: string, 
  userEmail: string, 
  projectName: string, 
  script: string, 
  characters: Omit<Character, 'id'>[], 
  totalChars: number,
  dialogues: { character: string, line: string, emotion?: string }[],
  clientTimestamp?: string,
  // 🎙️ Engine selection — "gemini" (default, existing behavior, untouched)
  // or "elevenlabs" (new 11Labs Studio). elevenLabsVoiceId is required
  // when engine === 'elevenlabs': v1 applies ONE selected library voice
  // to every dialogue node project-wide (per-character voice mapping for
  // 11Labs is a follow-up, same as CharacterAssignments is Gemini-only
  // today). Analysis (script/dialogues above) is untouched either way —
  // only which backend node/engine consumes the queue item differs.
  engine: 'gemini' | 'elevenlabs' = 'gemini',
  elevenLabsVoiceId?: string
): Promise<{ success: boolean; newCredits?: number; projectId?: string; error?: string }> {
    if (engine === 'elevenlabs' && !elevenLabsVoiceId) {
        return { success: false, error: 'Select an 11Labs voice before generating.' };
    }
    const { firestore, database } = initializeFirebase();
    const userRef = firestore.collection('users').doc(userId);
    
    // Pro Studio Cost: 0.5x multiplier (UPDATED per user request - Integer node)
    const cost = Math.ceil(totalChars * 0.5); 
    const projectId = `PRO_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
    const createdAt = clientTimestamp || new Date().toISOString();

    // 🎙️ 11Labs Studio gets its OWN RTDB queue node (11_projects) so
    // server-files/11.py can pick it up — that queue is separate from the
    // Firestore doc the frontend actually renders. The Firestore doc
    // itself must ALWAYS live under 'pro_projects': /history only queries
    // the 'pro_projects' collection (root and partitioned), never a
    // Firestore collection named '11_projects'. Previously this used
    // `rtdbNode` for BOTH the RTDB path and the Firestore collection, so
    // an 11Labs Pro Studio project's doc was created at
    // 11_projects/{uid}/userProjects/{id} — a collection nothing ever
    // reads — and the finished project silently never appeared in
    // history even though generation succeeded and credits were charged.
    const rtdbNode = engine === 'elevenlabs' ? '11_projects' : 'pro_projects';
    const firestoreCollection = 'pro_projects';
    const projectRef = firestore.collection(firestoreCollection).doc(userId).collection('userProjects').doc(projectId);

    try {
        const newBalanceAfterDeduction = await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("Identity node missing.");

            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < cost) {
                throw new Error(`Insufficient credits. Required: ${cost.toLocaleString()}, Available: ${currentCredits.toLocaleString()}.`);
            }
            
            const updated = Math.max(0, currentCredits - cost);
            transaction.set(projectRef, { 
                id: projectId, userId, projectName, script, characters, cost, creditCost: cost,
                status: 'in_queue', projectType: 'pro-studio', engine,
                ...(engine === 'elevenlabs' ? { elevenLabsVoiceId } : {}),
                createdAt: createdAt, clientTimestamp: createdAt, timestamp: Date.now(), audioUrl: '', 
                syncData: { dialogues, clientTimestamp: createdAt } 
            });
            transaction.update(userRef, { credits: updated, hasMadeFirstPurchase: true });
            return updated;
        });

        if (database) {
            await database.ref(`creditHistory/${userId}`).push({
                amount: -cost,
                creditCost: cost,
                reason: `Pro Studio: ${projectName}`,
                timestamp: createdAt,
                clientTimestamp: createdAt,
                numericTimestamp: Date.now()
            });
        }

        /**
         * 🛰️ NEURAL HUB DISPATCH
         * "gemini" -> pro_projects (untouched, existing Murf/Gemini path).
         * "elevenlabs" -> 11_projects (server-files/11.py's own dedicated
         * node — see rtdbNode above). 'dialogues' stays at root either way
         * for the Python backend.
         */
        await database.ref(`${rtdbNode}/${projectId}`).set({ 
            id: projectId, 
            userId, 
            userName, 
            userEmail, 
            projectName, 
            script, 
            characters, 
            dialogues: dialogues.map(d => ({ character: d.character, line: d.line })), 
            cost, 
            creditCost: cost,
            createdAt, 
            clientTimestamp: createdAt,
            timestamp: Date.now(),
            status: 'in_queue', 
            projectType: 'pro-studio', 
            engine,
            // See studio/actions.ts — 11.py needs to know which Firestore
            // collection to update. This is always 'pro_projects' (see
            // firestoreCollection above) — NOT the RTDB node name, which
            // for 11Labs is the separate 11_projects queue.
            firestoreCollection,
            ...(engine === 'elevenlabs' ? { elevenLabsVoiceId } : {}),
            syncData: { dialogues, clientTimestamp: createdAt },
            total_dialogues: dialogues.length,
            processed_dialogues: 0,
            rejected_nodes: 0
        });

        await logSummaryEvent('creditsSpent', cost); 

        // 📝 Record Deduction to History Ledger
        if (database) {
            await database.ref(`creditHistory/${userId}`).push({
                amount: -cost,
                reason: `Pro Studio: ${projectName || 'Untitled'}`,
                timestamp: new Date().toISOString(),
                projectId
            });
        }
        
        revalidatePath('/history');
        return { success: true, newCredits: newBalanceAfterDeduction, projectId: projectId };
    } catch (error: any) {
    reportServerError('src/app/pro-studio/actions.ts#1', error); 
        console.error("[Pro Studio Error]:", error.message);
        return { success: false, error: error.message }; 
    }
}
