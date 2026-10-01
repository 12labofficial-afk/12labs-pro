'use server';

import { requireSelfOrAdmin } from '@/lib/auth-guard';

import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { reportServerError } from '@/lib/report-error';

/**
 * 🎵 SUBMIT MUSIC PROJECT REQUEST (Firestore `music_project` submission)
 */
export async function submitMusicProjectRequestAction(idToken: string, input: {
    userId: string;
    userName?: string;
    userEmail?: string;
    prompt: string;
    productionMode: 'vocal' | 'instrumental';
    selectedLanguage: string;
    selectedTags: string[];
    lyrics?: string;
    mood?: string;
    duration?: string;
    tempo?: string;
    genre?: string;
    category?: string;
    instruments?: string[];
    clientTimestamp?: string;
}): Promise<{ success: boolean; projectId?: string; newCredits?: number; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, input.userId);
    if (!guard.ok) return { success: false, error: guard.message };
    const { 
        userId, userName, userEmail, prompt, productionMode, 
        selectedLanguage, selectedTags, lyrics, mood, duration, 
        tempo, genre, category, instruments,
        clientTimestamp 
    } = input;
    
    if (!userId) {
        return { success: false, error: "User authentication required." };
    }
    if (!prompt || prompt.trim().length < 3) {
        return { success: false, error: "Please enter a valid music prompt (at least 3 characters)." };
    }

    const { firestore, database } = initializeFirebase();
    const projectId = `MUS_${Date.now()}_${crypto.randomUUID().split('-')[0].toUpperCase()}`;
    const createdAtIso = clientTimestamp || new Date().toISOString();
    const timestampNow = Date.now();

    try {
        // 🔴 FIX: this used to be the transaction that ACTUALLY deducted a
        // hardcoded `cost = 2000` credits — removed entirely, same
        // reasoning as processHighQualityGenerationAndDeductCredits (see
        // src/app/studio/actions.ts): a future native app submitting
        // straight to Firebase would bypass this file, and Firestore
        // rules can only pin ownership, not validate a cost field the app
        // also wrote. The charge is now computed (get_music_cost, same
        // settings/pricing musicNormal key as getMusicCost in
        // src/lib/pricing.ts — a flat fee for everyone, matching the
        // original hardcoded value exactly) and deducted once,
        // server-side, on HF (deduct_music_credits_atomic in
        // server-files/music_generation.py) the moment it picks the job
        // up. This function is pure submission — no billing logic runs
        // here, not even a read-only check.

        // 1. Format and enhance prompt with selected duration if not already present
        let enhancedPrompt = prompt ? prompt.trim() : '';
        if (duration && enhancedPrompt) {
            const minMatch = duration.match(/^(\d+):00$/);
            const durationText = minMatch ? `${minMatch[1]} minutes` : `${duration} minutes`;
            const lowerPrompt = enhancedPrompt.toLowerCase();
            if (!lowerPrompt.includes('minute') && !lowerPrompt.includes('duration') && !lowerPrompt.includes('seconds') && !lowerPrompt.includes('length')) {
                enhancedPrompt = `${enhancedPrompt}, duration: ${durationText}`;
            }
        }

        // 3. Build Music Project Payload for Firestore
        const projectPayload = {
            id: projectId,
            projectId,
            userId,
            userName: userName || 'User',
            userEmail: userEmail || 'N/A',
            projectName: `AI MUSIC: ${(enhancedPrompt || 'Track').slice(0, 32).toUpperCase()}`,
            script: enhancedPrompt,
            prompt: enhancedPrompt,
            productionMode,
            language: selectedLanguage || 'English',
            tags: selectedTags || [],
            genre: genre || (selectedTags && selectedTags.length > 0 ? selectedTags.join(', ') : 'Music'),
            category: category || (productionMode === 'instrumental' ? (selectedTags[0] || 'Music') : 'Vocal'),
            instruments: instruments || (productionMode === 'instrumental' ? selectedTags.slice(1) : []),
            lyrics: lyrics || '',
            mood: mood || 'Upbeat',
            duration: duration || '2:00',
            tempo: tempo || 'Medium',
            status: 'pending',
            projectType: 'music-gen',
            isMusic: true,
            createdAt: createdAtIso,
            clientTimestamp: createdAtIso,
            updatedAt: createdAtIso,
            timestamp: timestampNow
        };

        // 3. Save to `music_project` Firestore paths
        // Path A: Partitioned under user
        await firestore
            .collection('music_project')
            .doc(userId)
            .collection('userProjects')
            .doc(projectId)
            .set(projectPayload);

        // Path B: Root collection for direct queries / worker listeners
        await firestore
            .collection('music_project')
            .doc(projectId)
            .set(projectPayload);

        // 📝 Credit history + the dailySummaries 'creditsSpent' counter are
        // now both written by HF's deduct_music_credits_atomic
        // (server-files/music_generation.py) once it actually deducts on
        // pickup — not here, since nothing was charged by this function.

        // 4. Send Telegram log notification
        await sendToTelegram(
            `🎵 <b>New Music Request Submitted</b>\n` +
            `<b>User:</b> ${escapeHtml(userEmail || userId)}\n` +
            `<b>Project ID:</b> <code>${projectId}</code>\n` +
            `<b>Mode:</b> ${productionMode.toUpperCase()} | <b>Lang:</b> ${selectedLanguage}\n` +
            `<b>Prompt:</b> <pre>${escapeHtml(enhancedPrompt)}</pre>`
        ).catch((e: any) => { reportServerError('src/app/music-studio/actions.ts:148', e); return null; });

        revalidatePath('/history');
        revalidatePath('/music-studio');

        // Generation is done by the HQ cluster's music_generation.py, which
        // listens on the root music_project/{projectId} doc written above.
        // Don't also dispatch through ai.generate here: that second path
        // generated the same track again (double Vertex cost) and its
        // result was never saved anywhere.

        return {
            success: true,
            projectId
        };

    } catch (error: any) {
    reportServerError('src/app/music-studio/actions.ts#2', error);
        console.error("[Submit Music Project Error]:", error.message);
        return {
            success: false,
            error: error.message || "Failed to submit music request."
        };
    }
}

/**
 * 🗑️ DELETE MUSIC PROJECT REQUEST
 */
export async function deleteMusicProjectRequestAction(idToken: string, projectId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, userId);
    if (!guard.ok) return { success: false, error: guard.message };
    if (!projectId || !userId) {
        return { success: false, error: "Missing parameters." };
    }

    const { firestore } = initializeFirebase();

    try {
        // Delete or mark deleted from both paths
        await firestore
            .collection('music_project')
            .doc(userId)
            .collection('userProjects')
            .doc(projectId)
            .delete()
            .catch((e: any) => { reportServerError('src/app/music-studio/actions.ts:231', e); return null; });

        await firestore
            .collection('music_project')
            .doc(projectId)
            .delete()
            .catch((e: any) => { reportServerError('src/app/music-studio/actions.ts:237', e); return null; });

        revalidatePath('/history');
        revalidatePath('/music-studio');

        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/music-studio/actions.ts#3', error);
        return { success: false, error: error.message };
    }
}
