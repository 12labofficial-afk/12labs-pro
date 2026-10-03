'use server';

import { requireAdmin } from '@/lib/auth-guard';

import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

// Push notification logic removed as system is disabled.
// Restoring empty export to fix build dependencies.
export async function sendPushNotificationToAdmins(idToken: string, title: string, body: string, url: string) {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    // Push notifications are currently handled via Targeted Push Hub.
    return { success: true };
}

/**
 * 📊 ADMIN DASHBOARD STATS (Admin SDK — bypasses Firestore security rules)
 * Client-side getCountFromServer() was failing silently for admins not in
 * the hardcoded email list / without the custom 'role' claim, causing the
 * Global Registry / Verified Output Nodes cards to show 0.
 */
export async function getAdminDashboardStatsAction(idToken: string): Promise<{ success: boolean; totalUsers: number; totalProjects: number; message?: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, totalUsers: 0, totalProjects: 0, message: guard.message };
    try {
        const { firestore } = initializeFirebase();
        if (!firestore) throw new Error('Firestore service unavailable.');

        const [usersSnap, projectsSnap] = await Promise.all([
            firestore.collection('users').count().get(),
            firestore.collection('projects').count().get(),
        ]);

        return {
            success: true,
            totalUsers: usersSnap.data().count || 0,
            totalProjects: projectsSnap.data().count || 0,
        };
    } catch (error: any) {
        reportServerError('src/app/admin/actions.ts#stats', error);
        return { success: false, totalUsers: 0, totalProjects: 0, message: error.message || 'Failed to fetch stats.' };
    }
}

export async function saveDailyFreeScriptLimitAction(idToken: string, data: { limit: number; todayCount: number; today: string }) {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        const numLimit = Math.max(1, Number(data.limit) || 40);
        const numCount = Math.max(0, Number(data.todayCount) || 0);

        await database.ref('settings/app/dailyFreeScriptLimit').set(numLimit);
        await database.ref(`dailyFreeScriptGenerations/${data.today}/count`).set(numCount);

        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#1', error);
        console.error("Error updating daily script limit:", error);
        return { success: false, error: error.message || 'Failed to update limit.' };
    }
}

export async function saveHqBackendUrlAction(idToken: string, url: string) {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref('admin/config/hq_backend_url').set(url.trim());
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#2', error);
        console.error("Error updating HQ backend url:", error);
        return { success: false, error: error.message || 'Failed to update HQ backend URL.' };
    }
}

export async function saveEditingHfBackendAction(idToken: string, data: { url: string; enabled: boolean }) {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref('settings/editingHfBackend').update({
            url: (data.url || '').trim(),
            enabled: data.enabled !== false,
            updatedAt: new Date().toISOString(),
        });
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#3', error);
        console.error("Error updating editing HF backend:", error);
        return { success: false, error: error.message || 'Failed to update Editing HF Backend.' };
    }
}

export async function saveAiDialogueExpandCostAction(idToken: string, cost: number) {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref('settings/app').update({
            aiDialogueExpandCost: Math.max(0, Math.round(cost)),
        });
        return { success: true };
    } catch (error: any) {
        reportServerError('src/app/admin/actions.ts#aiDialogueExpandCost', error);
        return { success: false, error: error.message || 'Failed to update AI dialogue-fix cost.' };
    }
}

export async function toggleToolLockAction(idToken: string, id: string, locked: boolean) {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref(`toolSettings/${id}/locked`).set(locked);
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#4', error);
        console.error("Error toggling tool lock:", error);
        return { success: false, error: error.message || 'Failed to toggle tool status.' };
    }
}

export async function saveMusicWatermarkUrlAction(idToken: string, url: string) {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref('settings/app').update({ musicWatermarkUrl: url });
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#5', error);
        console.error("Error updating music watermark:", error);
        return { success: false, error: error.message || 'Failed to update watermark URL.' };
    }
}

export async function setAnalysisExecutionModeAction(idToken: string, mode: 'realtime' | 'server') {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, error: guard.message };
    try {
        const { database } = initializeFirebase();
        if (!database) throw new Error("Database service unavailable.");

        await database.ref('settings/analysisExecutionMode').set(mode);
        return { success: true };
    } catch (error: any) {
    reportServerError('src/app/admin/actions.ts#6', error);
        console.error("Error updating analysis execution mode:", error);
        return { success: false, error: error.message || 'Failed to update execution mode.' };
    }
}


export type ActionItemGroup = {
    key: 'withdrawals' | 'sellerProfiles' | 'products' | 'chats' | 'payments';
    count: number;
    preview: string[];
};

/**
 * Everything that is waiting on an admin, in one call, for the Action
 * Center at the top of /admin. Each source fails independently so one bad
 * query can't hide the others.
 */
export async function getAdminActionItems(idToken: string): Promise<{ success: boolean; groups: ActionItemGroup[]; error?: string }> {
    const guard = await requireAdmin(idToken);
    if (!guard.ok) return { success: false, groups: [], error: guard.message };
    const { firestore, database } = initializeFirebase();
    const groups: ActionItemGroup[] = [];
    const inr = (n: any) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

    await Promise.all([
        (async () => {
            const snap = await firestore.collection('withdrawalRequests').where('status', '==', 'pending').limit(50).get();
            const rows = snap.docs.map((d: any) => d.data()).sort((a: any, b: any) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
            groups.push({ key: 'withdrawals', count: snap.size, preview: rows.slice(0, 3).map((r: any) => `${r.sellerName || 'Seller'} — ${inr(r.amount)}`) });
        })().catch((e) => reportServerError('src/app/admin/actions.ts:actionItems:withdrawals', e)),
        (async () => {
            const val = (await database.ref('pendingSellerProfiles').get()).val() || {};
            const rows = Object.values(val) as any[];
            groups.push({ key: 'sellerProfiles', count: rows.length, preview: rows.slice(0, 3).map((r) => r?.storeName || 'Unnamed store') });
        })().catch((e) => reportServerError('src/app/admin/actions.ts:actionItems:sellers', e)),
        (async () => {
            const val = (await database.ref('pendingProducts').get()).val() || {};
            const rows = Object.values(val) as any[];
            groups.push({ key: 'products', count: rows.length, preview: rows.slice(0, 3).map((r) => `${r?.title || 'Untitled'}${r?.sellerName ? ` · ${r.sellerName}` : ''}`) });
        })().catch((e) => reportServerError('src/app/admin/actions.ts:actionItems:products', e)),
        (async () => {
            const val = (await database.ref('chats').orderByChild('isReadByAdmin').equalTo(false).get()).val() || {};
            const rows = Object.values(val) as any[];
            groups.push({ key: 'chats', count: rows.length, preview: rows.slice(0, 3).map((r) => r?.userName || r?.userEmail || 'User') });
        })().catch((e) => reportServerError('src/app/admin/actions.ts:actionItems:chats', e)),
        (async () => {
            // Webhook events that still haven't been processed after retries — need a look / manual grant.
            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const snap = await firestore.collection('webhookEvents').where('status', '==', 'dead').limit(50).get();
            const rows = snap.docs.map((d: any) => d.data()).filter((r: any) => String(r.lastAttemptAt || '') >= since && !r.resolved);
            groups.push({ key: 'payments', count: rows.length, preview: rows.slice(0, 3).map((r: any) => String(r.lastError || 'Payment not credited').slice(0, 60)) });
        })().catch((e) => reportServerError('src/app/admin/actions.ts:actionItems:payments', e)),
    ]);

    return { success: true, groups: groups.filter((g) => g.count > 0) };
}
