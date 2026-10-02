'use server';

import { headers } from 'next/headers';
import { sendToTelegram } from '@/lib/telegram-logger';
import { logSummaryEvent, logDailyActiveUser } from '@/lib/summary-logger';
import { memoryLimit, clientIp } from '@/lib/rate-limit';
import { requireUser } from '@/lib/auth-guard';

/**
 * The only logging entry points a browser can call. The Telegram and summary
 * loggers themselves are server-only, so a visitor can't post arbitrary bot
 * messages / photos or inflate the dashboard counters directly.
 */

const MAX_REPORT_LEN = 3500;

/** Client error reports → admin Telegram. Throttled per IP, text only. */
export async function sendClientReportToTelegram(message: string, _photoUrl?: string, _options?: unknown): Promise<void> {
  if (typeof message !== 'string' || !message.trim()) return;
  const ip = clientIp(await headers());
  if (!memoryLimit(`client-report:${ip}`, 20, 60)) return;
  const text = message.length > MAX_REPORT_LEN ? `${message.slice(0, MAX_REPORT_LEN)}…` : message;
  await sendToTelegram(text, undefined, { disable_web_page_preview: true });
}

/** Marks the signed-in caller as active today. */
export async function logDailyActiveUserAction(idToken: string): Promise<void> {
  const guard = await requireUser(idToken);
  if (!guard.ok) return;
  await logDailyActiveUser(guard.uid);
}

/** Counts one normal script analysis for the signed-in caller. */
export async function logScriptAnalysisEventAction(idToken: string): Promise<void> {
  const guard = await requireUser(idToken);
  if (!guard.ok || !memoryLimit(`analysis-event:${guard.uid}`, 10, 60)) return;
  await logSummaryEvent('normalScriptAnalysis');
}
