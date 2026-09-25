'use server';

import { wholeCredits } from '@/lib/utils';
import { initializeFirebase } from '@/firebase/server';
import { callOpenRouterText } from '@/ai/engines/openrouter';
import { reportServerError } from '@/lib/report-error';
import { refundCreditsWithHistory } from '@/lib/credit-refund';
import { MIN_DIALOGUE_WORDS, isDialogueTooShort } from '@/lib/dialogue-validation';

const DEFAULT_AI_FIX_COST = 50;

/**
 * 🪄 "AI-Fix" — used by the pre-generate Resolve wizard
 * (studio/generation-settings.tsx) to expand a too-short dialogue line just
 * enough to give the TTS engine phonetic context to work with, without
 * rewriting the character's voice. Deducts an admin-configurable flat credit
 * cost (settings/app/aiDialogueExpandCost) via Gemini 2.5 Flash Lite,
 * reached through the existing OpenRouter integration (src/ai/engines/openrouter.ts)
 * already used elsewhere in this app as an analysis fallback.
 */
export async function expandDialogueWithAiAction(
    userId: string,
    dialogueText: string,
    characterName: string,
    fullScriptContext: string
): Promise<{ success: boolean; expandedText?: string; newCredits?: number; error?: string }> {
    if (!userId) return { success: false, error: 'User ID required.' };
    if (!dialogueText.trim()) return { success: false, error: 'Empty dialogue line.' };

    const { firestore, database } = initializeFirebase();
    let newCredits = 0;
    let charged = false;
    let cost = 0;

    try {
        const costSnap = await database.ref('settings/app/aiDialogueExpandCost').get();
        cost = Math.ceil(costSnap.exists() ? Number(costSnap.val()) : DEFAULT_AI_FIX_COST);

        // Charge first (same order as checkAndDeductCloningCredits) — if the
        // AI call itself fails after this, the credit loss is refunded below.
        const userRef = firestore.collection('users').doc(userId);
        await firestore.runTransaction(async (transaction: any) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User profile not found.');
            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < cost) throw new Error(`Insufficient credits. You need ${cost} credits for AI-Fix.`);
            newCredits = wholeCredits(Math.max(0, currentCredits - cost));
            transaction.update(userRef, { credits: newCredits });
        });
        charged = true;

        await database.ref(`creditHistory/${userId}`).push({
            amount: -cost,
            reason: 'Studio: AI Dialogue Fix',
            timestamp: new Date().toISOString(),
        }).catch((e: any) => { reportServerError('src/app/studio/ai-fix-actions.ts:creditHistory', e); return null; });

        const buildPrompt = (retry: boolean) => `You are fixing ONE line of dialogue in a voiceover script so it has enough words for an AI voice actor to perform naturally. The line below is too short (under ${MIN_DIALOGUE_WORDS} words) and would sound broken or clipped if synthesized as-is.

Full script for tone/context only:
"""
${fullScriptContext.slice(0, 2000)}
"""

Character speaking: ${characterName}
Line to fix: "${dialogueText}"
${retry ? `\nYour previous attempt was STILL under ${MIN_DIALOGUE_WORDS} words — that is not acceptable. Even a one-word line like "Haan." or "Okay." must become a real ${MIN_DIALOGUE_WORDS}+ word sentence, e.g. add a natural reaction, a short reason, or address who they're speaking to.\n` : ''}
Rewrite ONLY this one line so it is at least ${MIN_DIALOGUE_WORDS} words and sounds natural for this character. Keep the original meaning and tone. Only expand it slightly — do NOT turn it into a long speech, do NOT add new plot points, do NOT add stage directions or brackets. Reply with ONLY the rewritten line, nothing else — no quotes, no explanation.`;

        // 🔴 FIX: a single OpenRouter call that came back still-too-short
        // (common for a near-empty original line, e.g. "Haan." — a lite
        // model doesn't always take "expand this" seriously enough on its
        // own) went straight to a refund with no second attempt. One retry,
        // with an escalated prompt, before actually giving up.
        let expandedText = '';
        for (let attempt = 1; attempt <= 2; attempt++) {
            const result = await callOpenRouterText('google/gemini-2.5-flash-lite', { prompt: buildPrompt(attempt === 2) });
            if (result._error || !result.text) {
                if (attempt === 2) throw new Error(result.message || 'AI engine returned no result.');
                continue;
            }
            expandedText = result.text.trim().replace(/^["']|["']$/g, '');
            if (!isDialogueTooShort(expandedText)) break;
        }

        if (isDialogueTooShort(expandedText)) {
            // The model didn't actually fix it even after a retry —
            // refunded below rather than charging for a no-op.
            throw new Error('AI could not expand this line sufficiently. Try editing it manually.');
        }

        return { success: true, expandedText, newCredits };
    } catch (error: any) {
        reportServerError('src/app/studio/ai-fix-actions.ts:expandDialogueWithAiAction', error);
        // Charged but nothing delivered (AI error, exception, or no-op) —
        // give it back, with a history entry, via an atomic increment.
        if (charged) {
            const refunded = await refundCreditsWithHistory(userId, cost, 'Refund: Studio AI Dialogue Fix failed');
            return { success: false, error: error.message || 'AI-Fix failed.', newCredits: newCredits + refunded };
        }
        return { success: false, error: error.message || 'AI-Fix failed.' };
    }
}
