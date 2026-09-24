import { FieldValue } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';
import { wholeCredits } from '@/lib/utils';

/**
 * Gives credits back to a user and records it in their credit history.
 * Uses an atomic increment, never "old balance + amount", so anything the
 * user spent in the meantime is not overwritten. Returns the whole-number
 * amount actually refunded (0 if nothing was refunded).
 */
export async function refundCreditsWithHistory(
    userId: string,
    amount: number,
    reason: string,
    extra: Record<string, any> = {}
): Promise<number> {
    const credits = wholeCredits(amount);
    if (!userId || credits <= 0) return 0;

    const { firestore, database } = initializeFirebase();
    try {
        await firestore.collection('users').doc(userId).update({ credits: FieldValue.increment(credits) });
    } catch (e) {
        reportServerError('src/lib/credit-refund.ts:balance', e, { userId, amount: credits });
        return 0;
    }

    await database.ref(`creditHistory/${userId}`).push({
        amount: credits,
        reason,
        timestamp: new Date().toISOString(),
        type: 'refund',
        ...extra,
    }).catch((e: any) => { reportServerError('src/lib/credit-refund.ts:history', e, { userId }); return null; });

    return credits;
}
