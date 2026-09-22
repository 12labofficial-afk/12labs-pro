'use client';

import { useEffect } from 'react';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { getCurrentUserEmail } from '@/lib/current-user-email';
import { reportClientError } from '@/lib/report-client-error';
import { notifyStaleBuildIfNeeded } from '@/lib/stale-build-guard';
import { isIgnorableError } from '@/lib/ignorable-errors';

// Cooldown so a hot error path doesn't spam the bot (per browser tab).
const COOLDOWN_MS = 10 * 60 * 1000;
const lastReported = new Map<string, number>();

function report(context: string, message: string, stack?: string, extra?: Record<string, string>) {
  if (isIgnorableError(message)) return;

  // Same stale-build detection as reportClientError — this path catches
  // whatever slipped past a local try/catch (uncaught errors, unawaited
  // rejections), which a version-skewed Server Action call often does.
  notifyStaleBuildIfNeeded(new Error(message));

  const key = `${context}::${message}`;
  const now = Date.now();
  const last = lastReported.get(key) || 0;
  if (now - last <= COOLDOWN_MS) return;
  lastReported.set(key, now);

  const extraLines = extra
    ? Object.entries(extra).map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(v)}`).join('\n') + '\n'
    : '';

  sendToTelegram(
    `🔴 <b>Client Error</b>\n` +
    `<b>Context:</b> ${escapeHtml(context)}\n` +
    `<b>User:</b> ${escapeHtml(getCurrentUserEmail())}\n` +
    extraLines +
    `<b>Page:</b> ${escapeHtml(typeof window !== 'undefined' ? window.location.pathname : 'unknown')}\n` +
    `<b>Message:</b> ${escapeHtml(message)}\n` +
    (stack ? `<pre>${escapeHtml(stack.slice(0, 1500))}</pre>` : '')
  ).catch((dispatchErr) => {
        reportClientError('src/components/global-error-reporter.tsx:55', dispatchErr);
    // Don't let a logging failure break the app, but don't swallow it either.
    console.error(`[GlobalErrorReporter] Telegram dispatch failed for ${context}:`, dispatchErr);
  });
}

/**
 * Mounted once in the root layout. Silently catches, on every page:
 * - Uncaught JS errors (window 'error' event) — bad code paths, syntax issues at runtime, etc.
 * - Unhandled promise rejections (window 'unhandledrejection') — this is the big one:
 *   failed fetch()/upload calls, timeouts, async errors that nobody awaited/caught.
 *
 * Nothing is shown to the user — this only reports to the admin Telegram bot.
 */
export function GlobalErrorReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      report('window.onerror', event.message || 'Unknown error', event.error?.stack, {
        source: `${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : JSON.stringify(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      report('unhandledrejection', message || 'Unknown rejection', stack);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
