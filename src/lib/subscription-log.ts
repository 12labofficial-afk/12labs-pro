/**
 * One Telegram message format for everything that moves a Consistent
 * Creator plan: weekly grants (app sync, hourly cloud function), plan
 * completion, and manual admin changes. Pure (no imports) so it can be
 * copied verbatim into functions/src/subscription-log.ts.
 */

export type SubscriptionLogSource = 'App sync' | 'Cloud function (hourly)' | 'Admin manual' | 'Payment';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v: number) => Math.round(v).toLocaleString('en-IN');
const when = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' IST';
};

export interface GrantLogInput {
  source: SubscriptionLogSource;
  name?: string;
  email?: string;
  userId: string;
  planName: string;
  unit: 'Day' | 'Week';
  fromWeek: number;
  toWeek: number;
  maxGrants: number;
  credits: number;
  tickets: number;
  balanceAfter?: number;
  /** The plan reached its last installment and was closed. */
  finished: boolean;
  /** Cycles still waiting behind the one that just ran. */
  queuedLeft: number;
  nextGrantAt?: string | null;
  /** More than one installment paid in one go (user/function was late). */
  caughtUp: boolean;
}

export function formatGrantLog(i: GrantLogInput): string {
  const range = i.toWeek - i.fromWeek > 1 ? `${i.unit}s ${i.fromWeek + 1}–${i.toWeek}` : `${i.unit} ${i.toWeek}`;
  const head = i.finished ? '✅ <b>CONSISTENT PLAN COMPLETED (EXPIRED)</b>' : `📅 <b>CONSISTENT PLAN — ${i.unit.toUpperCase()} GRANT</b>`;
  return [
    head,
    '',
    `<b>User:</b> ${esc(i.name || 'N/A')} (${esc(i.email || i.userId)})`,
    `<b>Plan:</b> ${esc(i.planName)}`,
    `<b>Progress:</b> ${i.unit} ${i.fromWeek} → ${i.toWeek} of ${i.maxGrants}${i.caughtUp ? ' (late — caught up)' : ''}`,
    `<b>Granted:</b> ${range} · +${n(i.credits)} credits${i.tickets ? ` · +${i.tickets} 🎟️ ticket${i.tickets > 1 ? 's' : ''}` : ''}`,
    i.balanceAfter !== undefined ? `<b>Balance now:</b> ${n(i.balanceAfter)}` : null,
    i.finished
      ? (i.queuedLeft > 0 ? `<b>Next:</b> a queued cycle starts (${i.queuedLeft} waiting)` : '<b>Status:</b> all installments paid — plan closed')
      : `<b>Next grant:</b> ${when(i.nextGrantAt)}${i.queuedLeft ? ` · queued cycles: ${i.queuedLeft}` : ''}`,
    `<b>Source:</b> ${i.source}`,
    `<b>User ID:</b> <code>${esc(i.userId)}</code>`,
  ].filter((line) => line !== null).join('\n');
}

export interface SubscriptionSnapshot {
  planId?: string;
  status?: string;
  weeklyGrantCount?: number;
  nextWeeklyGrantDate?: string;
  queuedCycles?: number;
}

/** Admin edited the subscription by hand: show exactly what changed. */
export function formatManualChangeLog(opts: {
  admin: string;
  name?: string;
  email?: string;
  userId: string;
  before?: SubscriptionSnapshot | null;
  after?: SubscriptionSnapshot | null;
}): string {
  const b = opts.before || {};
  const a = opts.after || {};
  const rows: string[] = [];
  const diff = (label: string, x: unknown, y: unknown) => {
    if (String(x ?? '—') !== String(y ?? '—')) rows.push(`• ${label}: ${esc(x ?? '—')} → <b>${esc(y ?? '—')}</b>`);
  };
  diff('Plan', b.planId, a.planId);
  diff('Status', b.status, a.status);
  diff('Week', b.weeklyGrantCount, a.weeklyGrantCount);
  diff('Next grant', b.nextWeeklyGrantDate ? when(b.nextWeeklyGrantDate) : undefined, a.nextWeeklyGrantDate ? when(a.nextWeeklyGrantDate) : undefined);
  diff('Queued cycles', b.queuedCycles ?? 0, a.queuedCycles ?? 0);
  return [
    '🛠️ <b>CONSISTENT PLAN EDITED MANUALLY</b>',
    '',
    `<b>Admin:</b> ${esc(opts.admin)}`,
    `<b>User:</b> ${esc(opts.name || 'N/A')} (${esc(opts.email || opts.userId)})`,
    '<b>Changes:</b>',
    ...(rows.length ? rows : ['• (no field changed)']),
    `<b>User ID:</b> <code>${esc(opts.userId)}</code>`,
  ].join('\n');
}

/** Tickets (or a queued plan's start) settled by the website after the hourly function already paid the credits. */
export function formatTicketLog(i: {
  name?: string; email?: string; userId: string; planName?: string; week?: number;
  credits: number; tickets: number; ticketsAfter: number; balanceAfter: number; queuedLeft: number; started: boolean;
}): string {
  return [
    i.started ? '▶️ <b>QUEUED CONSISTENT PLAN STARTED</b>' : '🎟️ <b>STORE TICKET GRANTED (CONSISTENT PLAN)</b>',
    '',
    `<b>User:</b> ${esc(i.name || 'N/A')} (${esc(i.email || i.userId)})`,
    i.planName ? `<b>Plan:</b> ${esc(i.planName)}${i.week ? ` · Week ${i.week}` : ''}` : null,
    i.started ? `<b>Week 1 credits:</b> +${n(i.credits)}` : '<b>Why:</b> credits for this week were already paid by the hourly function',
    `<b>Tickets:</b> +${i.tickets} 🎟️ (now ${i.ticketsAfter})`,
    `<b>Balance now:</b> ${n(i.balanceAfter)}`,
    i.queuedLeft ? `<b>Queued cycles left:</b> ${i.queuedLeft}` : null,
    '<b>Source:</b> App sync',
    `<b>User ID:</b> <code>${esc(i.userId)}</code>`,
  ].filter((line) => line !== null).join('\n');
}
