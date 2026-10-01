'use server';

import { requireSelfOrAdmin } from '@/lib/auth-guard';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import { logSummaryEvent } from '@/lib/summary-logger';
import { getISTDateString, escapeHtml } from '@/lib/utils';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

const SubmitThumbnailRequestSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  userEmail: z.string().optional(),
  title: z.string().min(1, 'Title or Topic is required'),
  // The literal text (if any) the user typed into "Text to show on
  // thumbnail". Kept separate from `title` (which is used for project
  // naming/logging and always has a fallback) so an empty field here
  // truly means "no text baked into the image".
  titleTextForImage: z.string().optional().default(''),
  prompt: z.string().min(1, 'Prompt is required'),
  referenceImageUrl: z.string().url().optional().or(z.literal('')),
  ytLink: z.string().optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']).default('16:9'),
  style: z.string().default('YouTube Clickbait (Vibrant, High Contrast)'),
  width: z.number().default(1280),
  height: z.number().default(720),
});

export type SubmitThumbnailRequestInput = z.infer<typeof SubmitThumbnailRequestSchema>;

/**
 * 🎨 SUBMIT THUMBNAIL GENERATION REQUEST (Realtime Hub + Firestore + Credit Engine)
 */
export async function submitThumbnailRequestAction(idToken: string, 
  input: SubmitThumbnailRequestInput
): Promise<{ success: boolean; cost?: number; newCredits?: number; mappingId?: string; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, input.userId);
    if (!guard.ok) return { success: false, error: guard.message };
  const validation = SubmitThumbnailRequestSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.flatten().formErrors.join(', ') };
  }

  const {
    userId,
    userEmail = 'N/A',
    title,
    titleTextForImage = '',
    prompt,
    referenceImageUrl = '',
    ytLink = '',
    aspectRatio,
    style,
    width,
    height,
  } = validation.data;

  const { firestore, database } = initializeFirebase();
  if (!firestore) {
    return { success: false, error: 'Database service is currently unavailable.' };
  }

  const userRef = firestore.collection('users').doc(userId);
  const today = getISTDateString();
  const mappingId = `THUMB_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  const createdAtIso = new Date().toISOString();
  const numericTimestamp = Date.now();

  try {
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return { success: false, error: 'User profile not found.' };
    }

    // 🔴 FIX: this used to also fetch pricing, compute the isSponsor/
    // hasMadeFirstPurchase tier, and run the transaction that ACTUALLY
    // deducted credits — all removed. Not safe for a future native app
    // submitting straight to Firebase (Firestore rules can only pin
    // ownership fields, not a cost field the app also wrote). The charge
    // is now computed (get_thumbnail_cost, same settings/pricing
    // thumbnailNormal/thumbnailDiscounted + tiering as before) and
    // deducted once, server-side, on HF (deduct_thumbnail_credits_atomic
    // in server-files/thumbnail_generation.py) the moment it picks the
    // job up. This function is pure submission now.

    // 1. Save Request to Realtime Database for Live Node Processing & Live Polling
    if (database) {
      await database.ref(`tempThumbnailGenerations/${userId}/${mappingId}`).set({
        id: mappingId,
        mappingId,
        userId,
        userEmail,
        status: 'processing',
        projectName: title,
        title,
        titleTextForImage: titleTextForImage || null,
        prompt,
        referenceImageUrl: referenceImageUrl || null,
        sourceImageUrl: referenceImageUrl || null,
        ytLink: ytLink || null,
        aspectRatio,
        style,
        width,
        height,
        type: 'thumbnail_generation',
        createdAt: createdAtIso,
        timestamp: numericTimestamp,
      });
    }

    // 2. Save Request to Firestore (`thumbnailProjects` & `thumbnail_projects`)
    const thumbnailPayload = {
      id: mappingId,
      projectId: mappingId,
      mappingId,
      userId,
      userEmail,
      projectName: `THUMBNAIL: ${title.slice(0, 32).toUpperCase()}`,
      title,
      titleTextForImage: titleTextForImage || null,
      prompt,
      referenceImageUrl: referenceImageUrl || null,
      sourceImageUrl: referenceImageUrl || null,
      ytLink: ytLink || null,
      aspectRatio,
      style,
      width,
      height,
      status: 'pending',
      type: 'thumbnail_generation',
      projectType: 'thumbnail',
      createdAt: createdAtIso,
      updatedAt: createdAtIso,
      timestamp: numericTimestamp,
    };

    // 1. thumbnailProjects (matches screenshot collection)
    await firestore
      .collection('thumbnailProjects')
      .doc(userId)
      .collection('userProjects')
      .doc(mappingId)
      .set(thumbnailPayload)
      .catch((e: any) => console.error('Firestore thumbnailProjects user error:', e));

    await firestore
      .collection('thumbnailProjects')
      .doc(mappingId)
      .set(thumbnailPayload)
      .catch((e: any) => console.error('Firestore thumbnailProjects root error:', e));

    // 2. thumbnail_projects (snake_case fallback)
    await firestore
      .collection('thumbnail_projects')
      .doc(userId)
      .collection('userProjects')
      .doc(mappingId)
      .set(thumbnailPayload)
      .catch((e: any) => console.error('Firestore thumbnail_projects user error:', e));

    await firestore
      .collection('thumbnail_projects')
      .doc(mappingId)
      .set(thumbnailPayload)
      .catch((e: any) => console.error('Firestore thumbnail_projects root error:', e));

    // 📝 Credit history + the dailySummaries 'creditsSpent' counter are
    // now both written by HF's deduct_thumbnail_credits_atomic
    // (server-files/thumbnail_generation.py) once it actually deducts on
    // pickup — not here, since nothing was charged by this function.

    // Telegram Notification — cost omitted, not known until HF charges it.
    const tgMsg = `🎨 <b>Thumbnail Generation Request Submitted</b>
<b>User:</b> ${escapeHtml(userEmail)}
<b>Title:</b> ${escapeHtml(title)}
<b>Style:</b> ${escapeHtml(style)} (${aspectRatio})
<b>Prompt:</b> <code>${escapeHtml(prompt.slice(0, 150))}...</code>
${referenceImageUrl ? `<b>Extracted YT / Reference Image:</b> ${referenceImageUrl}` : ''}`;

    await sendToTelegram(tgMsg, referenceImageUrl || undefined).catch((e: any) => { reportServerError('src/app/thumbnail-generator/actions.ts:230', e); return null; });

    return {
      success: true,
      mappingId,
    };
  } catch (error: any) {
    // "Insufficient credits" is expected user-facing validation, not a bug —
    // it fires every time a user tries to generate without enough balance.
    // Reporting it as a Server Error spams the admin channel with routine,
    // actionless noise. Only report genuine failures (DB errors, etc).
    const isInsufficientCredits = typeof error?.message === 'string' && error.message.startsWith('Insufficient credits');
    if (!isInsufficientCredits) {
      reportServerError('src/app/thumbnail-generator/actions.ts#2', error);
    }
    console.error('[Thumbnail Request Submission Failed]:', error.message);
    return { success: false, error: error.message || 'Failed to submit thumbnail request.' };
  }
}

/**
 * 🗑️ CANCEL OR DELETE THUMBNAIL JOB
 */
export async function removeThumbnailJobAction(idToken: string, 
  userId: string,
  mappingId: string
): Promise<{ success: boolean; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, userId);
    if (!guard.ok) return { success: false, error: guard.message };
  try {
    const { database } = initializeFirebase();
    if (database) {
      await database.ref(`tempThumbnailGenerations/${userId}/${mappingId}`).remove();
    }
    return { success: true };
  } catch (error: any) {
    reportServerError('src/app/thumbnail-generator/actions.ts#3', error);
    return { success: false, error: error.message };
  }
}

/**
 * 💾 SAVE COMPLETED THUMBNAIL TO USER HISTORY
 */
export async function saveCompletedThumbnailAction(idToken: string, input: {
  userId: string;
  userEmail: string;
  mappingId: string;
  title: string;
  prompt: string;
  imageUrl: string;
  aspectRatio: string;
  style: string;
}): Promise<{ success: boolean; error?: string }> {
    const guard = await requireSelfOrAdmin(idToken, input.userId);
    if (!guard.ok) return { success: false, error: guard.message };
  try {
    const { firestore, database } = initializeFirebase();
    if (!firestore) return { success: false, error: 'Database unavailable' };

    const createdAt = new Date().toISOString();

    // 1. Save to users/{userId}/thumbnails
    const userThumbRef = firestore.collection('users').doc(input.userId).collection('thumbnails').doc(input.mappingId);
    await userThumbRef.set({
      id: input.mappingId,
      userId: input.userId,
      userEmail: input.userEmail,
      title: input.title,
      prompt: input.prompt,
      imageUrl: input.imageUrl,
      aspectRatio: input.aspectRatio,
      style: input.style,
      createdAt,
      timestamp: Date.now(),
    });

    // 2. Update status in RTDB
    if (database) {
      await database.ref(`tempThumbnailGenerations/${input.userId}/${input.mappingId}`).update({
        status: 'completed',
        imageUrl: input.imageUrl,
        completedAt: createdAt,
      });
    }

    await logSummaryEvent('thumbnailsGenerated').catch((e: any) => { reportServerError('src/app/thumbnail-generator/actions.ts:314', e); return null; });

    return { success: true };
  } catch (error: any) {
    reportServerError('src/app/thumbnail-generator/actions.ts#4', error);
    console.error('Error saving completed thumbnail:', error);
    return { success: false, error: error.message };
  }
}
