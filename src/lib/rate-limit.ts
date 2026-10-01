import { NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

/**
 * Fixed-window rate limiting.
 *
 * Two layers:
 * - memoryLimit: per server instance, zero latency. Serverless instances
 *   don't share memory, so this alone is best-effort; it's for cheap,
 *   high-volume paths (file proxies) and a global per-user ceiling.
 * - rateLimit: shared across all instances via an RTDB counter
 *   (rateLimits/{bucket}/{id}, Admin SDK only — clients can't read/write it).
 *   Used for paid/abusable actions. Fails open: a database hiccup must
 *   never take the feature down with it.
 */

type MemEntry = { window: number; count: number };
const memory = new Map<string, MemEntry>();
const MEMORY_MAX_KEYS = 20000;

export function memoryLimit(key: string, limit: number, windowSec: number): boolean {
  const window = Math.floor(Date.now() / (windowSec * 1000));
  const entry = memory.get(key);
  if (!entry || entry.window !== window) {
    if (memory.size >= MEMORY_MAX_KEYS) memory.clear();
    memory.set(key, { window, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

// RTDB keys can't contain . $ # [ ] / — IPs (v6 colons are fine) and uids are mostly safe.
function safeKey(id: string): string {
  return id.replace(/[.$#\[\]\/]/g, '_').slice(0, 200) || 'unknown';
}

export async function rateLimit(bucket: string, id: string, limit: number, windowSec: number): Promise<boolean> {
  // Trusted server-to-server calls (SERVER_INTERNAL) are limited at their own entry point.
  if (id === '__server__') return true;
  // Same-instance bursts are rejected without a database round-trip.
  if (!memoryLimit(`${bucket}:${id}`, limit, windowSec)) return false;

  const window = Math.floor(Date.now() / (windowSec * 1000));
  try {
    const { database } = initializeFirebase();
    if (!database) return true;
    let allowed = true;
    await database.ref(`rateLimits/${safeKey(bucket)}/${safeKey(id)}`).transaction((cur: { w?: number; c?: number } | null) => {
      if (!cur || cur.w !== window) {
        allowed = true;
        return { w: window, c: 1 };
      }
      const c = (cur.c || 0) + 1;
      allowed = c <= limit;
      return { w: window, c };
    });
    return allowed;
  } catch (e) {
    reportServerError('src/lib/rate-limit.ts', e, { bucket });
    return true;
  }
}

export const RATE_LIMIT_MESSAGE = 'Too many requests. Please wait a moment and try again.';

export function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { success: false, error: RATE_LIMIT_MESSAGE },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

/** Client IP as seen by Vercel (first x-forwarded-for hop). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}
