import { plans } from '@/lib/plans';
import { ticketsBetween, ticketsForWeek } from '@/lib/tickets';
import type { UserProfile } from '@/lib/types';

const AUTOPAY_PLANS = ['autopay_pro', 'test_sub'];

export function parseDate(value: any): Date {
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

/**
 * Tickets still owed from a PREVIOUS Consistent Creator cycle that the hourly
 * function already closed (it deletes `subscription`) before anyone settled
 * its tickets. Must be added when a new cycle starts, because starting it
 * resets the ledger to week 1.
 */
export function carryOverTickets(userData: any): number {
  const ledgerWeek = userData?.autopayLedger?.week;
  const max = plans.find((p) => p.id === 'autopay_pro')?.maxGrants ?? 4;
  if (typeof ledgerWeek !== 'number' || ledgerWeek >= max) return 0;
  const sub = userData?.subscription;
  const running = !!sub && Number(sub.weeklyGrantCount || 0) < max;
  if (running) return 0;
  return ticketsBetween('autopay_pro', ledgerWeek, max);
}

export interface FieldOps {
  increment: (n: number) => any;
  del: () => any;
}

export interface AutopaySyncResult {
  updateData: any;
  history: any[];
  notifications: any[];
  credits: number;
  tickets: number;
  /** Nothing the user needs to be told about (bookkeeping only). */
  silent: boolean;
  grantLog: any | null;
  updatedProfile: any | null;
}

/**
 * Everything the Consistent Creator sync decides, as a pure function of the
 * user document (Firestore sentinels are injected via `ops`), so it can be
 * tested without a database. syncUserSubscriptionInstallments runs it inside
 * a transaction and writes the result.
 *
 * Invariant: tickets are paid out exactly once per installment because
 * `autopayLedger.week` is written in the same update as `storeTickets`.
 */
export function computeAutopaySync(userData: any, userId: string, ops: FieldOps, serverNow = new Date()): AutopaySyncResult | null {
  const DAY = 24 * 60 * 60 * 1000;
  const sub: any = userData.subscription;
  const queueIn = userData.autopayQueue;
  const ledgerIn = userData.autopayLedger;
  const autopay = plans.find((p) => p.id === 'autopay_pro');
  const autopayMax = autopay?.maxGrants ?? 4;
  const autopayCredits = autopay?.weeklyCredits ?? 20000;
  const subRunnable = !!sub && AUTOPAY_PLANS.includes(sub.planId) && (sub.status === 'active' || sub.status === 'cancelled');
  const sameQueueId = queueIn?.subscriptionId ? { subscriptionId: queueIn.subscriptionId } : {};

  // ---------- A) No subscription on the user ----------
  if (!sub) {
    const queuedCount = Number(queueIn?.count || 0);
    const ledgerOpen = typeof ledgerIn?.week === 'number' && ledgerIn.week < autopayMax;
    if (queuedCount <= 0 && !ledgerOpen) return null;

    let tickets = ledgerOpen ? ticketsBetween('autopay_pro', ledgerIn.week, autopayMax) : 0;
    let credits = 0;
    const updateData: any = {};
    const notifications: any[] = [];
    const history: any[] = [];
    const startedQueued = queuedCount > 0;

    if (startedQueued) {
      credits = autopayCredits;
      tickets += ticketsForWeek('autopay_pro', 1);
      updateData.subscription = {
        planId: 'autopay_pro',
        status: 'active',
        ...sameQueueId,
        startDate: serverNow.toISOString(),
        nextWeeklyGrantDate: new Date(serverNow.getTime() + (autopay?.grantIntervalDays ?? 7) * DAY).toISOString(),
        weeklyGrantCount: 1,
        currentCycleMonth: `${serverNow.getFullYear()}-${String(serverNow.getMonth() + 1).padStart(2, '0')}`,
      };
      updateData.autopayLedger = { week: 1 };
      updateData.autopayQueue = queuedCount - 1 > 0 ? { count: queuedCount - 1, ...sameQueueId } : ops.del();
      history.push({ amount: credits, reason: `${autopay?.name || 'Consistent Creator'}: Week 1 Grant (queued plan started)`, timestamp: serverNow.toISOString() });
      notifications.push({
        id: `sub-queued-start-${serverNow.getTime()}`,
        message: `Your next Consistency plan has started: +${credits.toLocaleString()} Credits (Week 1/${autopayMax}).${ticketsForWeek('autopay_pro', 1) ? ' 🎟️ +1 Store Ticket.' : ''}`,
        timestamp: serverNow.toISOString(), read: false, type: 'credits',
      });
    } else {
      updateData.autopayLedger = ops.del();
    }
    if (credits > 0) updateData.credits = ops.increment(credits);
    if (tickets > 0) {
      updateData.storeTickets = ops.increment(tickets);
      if (!startedQueued) {
        notifications.push({
          id: `sub-ticket-${serverNow.getTime()}`,
          message: `🎟️ +${tickets} Store Ticket from your Consistency plan — get any Verified Partner asset free.`,
          timestamp: serverNow.toISOString(), read: false, type: 'credits',
        });
      }
    }
    const profile: any = { ...userData, credits: Number(userData.credits || 0) + credits, storeTickets: Number(userData.storeTickets || 0) + tickets };
    if (startedQueued) profile.subscription = updateData.subscription;
    return {
      updateData, history, notifications, credits, tickets, silent: false,
      grantLog: tickets > 0 || startedQueued ? {
        kind: 'ticketOnly', started: startedQueued, name: userData.name, email: userData.email, userId, credits, tickets,
        planName: autopay?.name, ticketsAfter: Number(userData.storeTickets || 0) + tickets,
        balanceAfter: Number(userData.credits || 0) + credits, queuedLeft: Math.max(0, queuedCount - (startedQueued ? 1 : 0)),
      } : null,
      updatedProfile: profile,
    };
  }

  // ---------- B) A running plan ----------
  if (!subRunnable) return null;

  const planSource = plans.find((p) => p.id === sub.planId);
  const maxGrants = planSource?.maxGrants ?? 4;
  const isAutopayPlan = sub.planId === 'autopay_pro';
  // the queue lives on the user; fold in the old in-subscription counter
  let queuedCycles = Number(queueIn?.count || 0) + Number(sub.queuedCycles || 0);
  const legacyQueueFolded = Number(sub.queuedCycles || 0) > 0;

  let currentNextGrantDate = parseDate(sub.nextWeeklyGrantDate);
  if (Number.isNaN(currentNextGrantDate.getTime())) throw new Error('Invalid nextWeeklyGrantDate on subscription.');
  let currentWeekCount = Number(sub.weeklyGrantCount || 0);
  const startWeekCount = currentWeekCount;
  let installmentsPaid = 0;
  let totalCreditsToGrant = 0;
  let totalTicketsToGrant = 0;
  const newHistoryEntries: any[] = [];
  const newNotifications: any[] = [];

  // Weeks the hourly function already paid out. A plan from before tickets
  // existed has no ledger: treat it as settled up to now (no retro tickets).
  const ledgerStart = typeof ledgerIn?.week === 'number' ? ledgerIn.week : (isAutopayPlan ? currentWeekCount : 0);
  let ledgerWeek = ledgerStart;
  if (isAutopayPlan && currentWeekCount > ledgerWeek) {
    totalTicketsToGrant += ticketsBetween(sub.planId, ledgerWeek, currentWeekCount);
    ledgerWeek = currentWeekCount;
  }

  const grantAmount = planSource?.weeklyCredits ?? (sub.planId === 'test_sub' ? 2 : 20000);
  const planName = planSource?.name || 'Consistency Plan';
  const intervalDays = planSource?.grantIntervalDays ?? 7;
  const unitLabel = intervalDays === 1 ? 'Day' : 'Week';

  // Catch-up loop: every installment that became due while the user was away
  while (serverNow >= currentNextGrantDate && (currentWeekCount < maxGrants || queuedCycles > 0)) {
    if (currentWeekCount >= maxGrants) {
      currentWeekCount = 0; // the plan bought while this one ran starts right after it
      queuedCycles--;
      ledgerWeek = 0;
    }
    const scheduledTimestamp = currentNextGrantDate.toISOString();
    totalCreditsToGrant += grantAmount;
    installmentsPaid++;
    currentWeekCount++;

    let ticketsThisWeek = 0;
    if (isAutopayPlan && currentWeekCount > ledgerWeek) {
      ticketsThisWeek = ticketsBetween(sub.planId, ledgerWeek, currentWeekCount);
      totalTicketsToGrant += ticketsThisWeek;
      ledgerWeek = currentWeekCount;
    }

    newHistoryEntries.push({ amount: grantAmount, reason: `${planName}: ${unitLabel} ${currentWeekCount} Grant`, timestamp: scheduledTimestamp });
    newNotifications.push({
      id: `sub-grant-${currentWeekCount}-${serverNow.getTime()}-${installmentsPaid}`,
      message: `${unitLabel === 'Day' ? 'Daily' : 'Weekly'} Consistency Grant: +${grantAmount.toLocaleString()} Credits added! (${unitLabel} ${currentWeekCount}/${maxGrants})${ticketsThisWeek ? ` 🎟️ +${ticketsThisWeek} Store Ticket — get any Verified Partner asset free.` : ''}`,
      timestamp: serverNow.toISOString(), read: false, type: 'credits',
    });
    currentNextGrantDate = new Date(currentNextGrantDate.getTime() + intervalDays * DAY);
  }

  const ledgerChanged = isAutopayPlan && ledgerWeek !== ledgerIn?.week;
  if (totalCreditsToGrant <= 0 && totalTicketsToGrant <= 0 && !legacyQueueFolded) {
    // bookkeeping only (e.g. the function paid a week that has no ticket)
    if (!ledgerChanged) return null;
    return { updateData: { autopayLedger: { week: ledgerWeek } }, history: [], notifications: [], credits: 0, tickets: 0, silent: true, grantLog: null, updatedProfile: null };
  }

  const isPlanFinished = currentWeekCount >= maxGrants && queuedCycles <= 0;
  const updateData: any = {};
  if (totalCreditsToGrant > 0) updateData.credits = ops.increment(totalCreditsToGrant);
  if (totalTicketsToGrant > 0) updateData.storeTickets = ops.increment(totalTicketsToGrant);

  if (totalTicketsToGrant > 0 && totalCreditsToGrant <= 0) {
    newNotifications.push({
      id: `sub-ticket-${serverNow.getTime()}`,
      message: `🎟️ +${totalTicketsToGrant} Store Ticket from your Consistency plan (${unitLabel} ${currentWeekCount}) — get any Verified Partner asset free.`,
      timestamp: serverNow.toISOString(), read: false, type: 'credits',
    });
  }

  if (isPlanFinished) {
    updateData.subscription = ops.del();
    updateData.autopayLedger = ops.del();
    updateData.autopayQueue = ops.del();
    newNotifications.push({
      id: `sub-complete-${serverNow.getTime()}`,
      message: `Congratulations! Your ${maxGrants * intervalDays}-day Consistency Plan is complete. Your credits will expire 30 days from the original purchase date.`,
      timestamp: serverNow.toISOString(), read: false, type: 'system',
    });
  } else {
    const { queuedCycles: _legacyQueued, ...subRest } = sub;
    updateData.subscription = { ...subRest, weeklyGrantCount: currentWeekCount, nextWeeklyGrantDate: currentNextGrantDate.toISOString() };
    if (isAutopayPlan) updateData.autopayLedger = { week: ledgerWeek };
    updateData.autopayQueue = queuedCycles > 0 ? { count: queuedCycles, ...sameQueueId } : ops.del();
  }

  const updatedProfile: any = {
    ...userData,
    credits: Number(userData.credits || 0) + totalCreditsToGrant,
    storeTickets: Number(userData.storeTickets || 0) + totalTicketsToGrant,
  };
  if (isPlanFinished) delete updatedProfile.subscription; else updatedProfile.subscription = updateData.subscription;

  return {
    updateData, history: newHistoryEntries, notifications: newNotifications,
    credits: totalCreditsToGrant, tickets: totalTicketsToGrant, silent: false,
    grantLog: totalCreditsToGrant > 0 ? {
      source: 'App sync', name: userData.name, email: userData.email, userId, planName, unit: unitLabel,
      fromWeek: startWeekCount >= maxGrants ? 0 : startWeekCount, toWeek: currentWeekCount, maxGrants,
      credits: totalCreditsToGrant, tickets: totalTicketsToGrant,
      balanceAfter: Number(userData.credits || 0) + totalCreditsToGrant,
      finished: isPlanFinished, queuedLeft: queuedCycles,
      nextGrantAt: isPlanFinished ? null : currentNextGrantDate.toISOString(), caughtUp: installmentsPaid > 1,
    } : {
      kind: 'ticketOnly', started: false, name: userData.name, email: userData.email, userId, credits: 0, tickets: totalTicketsToGrant,
      ticketsAfter: Number(userData.storeTickets || 0) + totalTicketsToGrant, balanceAfter: Number(userData.credits || 0),
      queuedLeft: queuedCycles, week: currentWeekCount, planName,
    },
    updatedProfile,
  };
}
