import { plans } from '@/lib/plans';
import type { UserProfile } from '@/lib/types';

const AUTOPAY_PLANS = ['autopay_pro', 'test_sub'];

function parseDate(value: any): Date {
  if (value?.toDate && typeof value.toDate === 'function') return value.toDate();
  if (value?._seconds || value?.seconds) return new Date(Number(value._seconds ?? value.seconds) * 1000);
  return new Date(value);
}

/**
 * Does this user have anything for the Consistent Creator sync to do?
 * Besides a due weekly grant, that includes work left behind by the
 * hourly Firebase function (it grants credits itself but knows nothing
 * about tickets or queued cycles): a ticket for a week it already paid,
 * or a queued cycle after it closed the finished plan.
 */
export function needsAutopaySync(profile: Partial<UserProfile> | null | undefined, now = new Date()): boolean {
  if (!profile) return false;
  const sub: any = profile.subscription;
  const queued = Number(profile.autopayQueue?.count || 0);
  const ledgerWeek = profile.autopayLedger?.week;
  const maxAutopay = plans.find((p) => p.id === 'autopay_pro')?.maxGrants ?? 4;

  if (!sub) return queued > 0 || (typeof ledgerWeek === 'number' && ledgerWeek < maxAutopay);

  if (!AUTOPAY_PLANS.includes(sub.planId) || (sub.status !== 'active' && sub.status !== 'cancelled')) return false;
  const max = plans.find((p) => p.id === sub.planId)?.maxGrants ?? 4;
  const count = Number(sub.weeklyGrantCount || 0);
  const pendingQueue = queued + Number(sub.queuedCycles || 0);

  if (count < max && now >= parseDate(sub.nextWeeklyGrantDate)) return true;
  if (count >= max && pendingQueue > 0) return true;
  if (sub.planId === 'autopay_pro' && typeof ledgerWeek === 'number' && count > ledgerWeek) return true;
  if (Number(sub.queuedCycles || 0) > 0) return true; // fold the old in-subscription counter into autopayQueue
  return false;
}
