'use server';

import { initializeFirebase } from '@/firebase/server';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

export async function approveAdAction(adId: string, adminEmail: string): Promise<{ success: boolean; message: string }> {
  const { database } = initializeFirebase();
  try {
    const adRef = database.ref(`ads/${adId}`);
    const snap = await adRef.get();
    if (!snap.exists()) return { success: false, message: 'Ad not found.' };
    const ad = snap.val();
    if (ad.status !== 'pending_review') return { success: false, message: 'This ad is not awaiting review.' };

    await adRef.update({ status: 'active', reviewedAt: new Date().toISOString(), reviewedBy: adminEmail });

    await sendToTelegram(
      `✅ <b>Ad Approved</b>\n<b>Advertiser:</b> ${escapeHtml(ad.advertiserEmail || 'unknown')}\n<b>Admin:</b> ${escapeHtml(adminEmail)}\nNow live for viewers.`
    ).catch((e: any) => { reportServerError('src/app/admin/ads/actions.ts:approveTelegram', e); return null; });

    return { success: true, message: 'Ad approved and is now live.' };
  } catch (e: any) {
    reportServerError('src/app/admin/ads/actions.ts:approveAdAction', e, { adId });
    return { success: false, message: e.message || 'Could not approve ad.' };
  }
}

export async function rejectAdAction(adId: string, reason: string, adminEmail: string): Promise<{ success: boolean; message: string }> {
  const { database } = initializeFirebase();
  try {
    const adRef = database.ref(`ads/${adId}`);
    const snap = await adRef.get();
    if (!snap.exists()) return { success: false, message: 'Ad not found.' };
    const ad = snap.val();
    if (ad.status !== 'pending_review') return { success: false, message: 'This ad is not awaiting review.' };

    await adRef.update({
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminEmail,
      rejectionReason: reason || 'Not specified',
    });

    await sendToTelegram(
      `❌ <b>Ad Rejected</b>\n<b>Advertiser:</b> ${escapeHtml(ad.advertiserEmail || 'unknown')}\n<b>Reason:</b> ${escapeHtml(reason || 'Not specified')}\n<b>Admin:</b> ${escapeHtml(adminEmail)}`
    ).catch((e: any) => { reportServerError('src/app/admin/ads/actions.ts:rejectTelegram', e); return null; });

    return { success: true, message: 'Ad rejected.' };
  } catch (e: any) {
    reportServerError('src/app/admin/ads/actions.ts:rejectAdAction', e, { adId });
    return { success: false, message: e.message || 'Could not reject ad.' };
  }
}
