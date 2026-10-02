import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';
import { memoryLimit, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';

/**
 * SECURITY: Next.js Server Actions are exposed as callable network
 * endpoints. The client-side "admin only" UI gating does NOT stop
 * someone from calling an admin/seller server action directly with a
 * crafted request. Every action that reads/writes sensitive or
 * privileged data MUST verify the caller's Firebase ID token on the
 * server before doing anything — do not trust a plain userId/sellerId
 * string passed in as an argument.
 *
 * Usage in a server action:
 *
 *   'use server';
 *   import { requireAdmin } from '@/lib/auth-guard';
 *
 *   export async function deleteProductAdminAction(idToken: string, productId: string) {
 *     const guard = await requireAdmin(idToken);
 *     if (!guard.ok) return { success: false, message: guard.message };
 *     ...
 *   }
 *
 * On the client, pass the current user's fresh ID token:
 *   const idToken = await auth.currentUser.getIdToken();
 *   await deleteProductAdminAction(idToken, productId);
 */

const ADMIN_EMAILS = [
  'toonday378@gmail.com',
  'yrathod18495@gmail.com',
  'Yashsharma4638@gmail.com',
  'abcdtoon30@gmail.com',
  '12labofficial@gmail.com',
].map((e) => e.toLowerCase());

/**
 * Passed instead of an ID token by trusted server code (API routes that did
 * their own API-key auth, cron, other guarded actions). A local Symbol can't
 * be serialized into a server action call, so a browser can never send it.
 */
export const SERVER_INTERNAL: unique symbol = Symbol('server-internal');
export type AuthToken = string | typeof SERVER_INTERNAL | undefined | null;

type GuardResult =
  | { ok: true; uid: string; email: string | null; emailVerified: boolean }
  | { ok: false; message: string };

export async function requireUser(idToken: AuthToken): Promise<GuardResult> {
  if (idToken === SERVER_INTERNAL) return { ok: true, uid: '__server__', email: null, emailVerified: false };
  if (!idToken) return { ok: false, message: 'Not signed in.' };
  try {
    const { auth } = initializeFirebase();
    const decoded = await auth.verifyIdToken(idToken);
    // Global per-user ceiling on authenticated calls (per instance; the
    // shared RTDB limits on paid actions are in rate-limit.ts). Admins are
    // exempt so bulk admin tools that loop over users don't trip it.
    const isAdminEmail = decoded.email_verified === true && !!decoded.email && ADMIN_EMAILS.includes(decoded.email.toLowerCase());
    if (!isAdminEmail && !memoryLimit(`user:${decoded.uid}`, 300, 60)) {
      return { ok: false, message: RATE_LIMIT_MESSAGE };
    }
    return { ok: true, uid: decoded.uid, email: decoded.email || null, emailVerified: decoded.email_verified === true };
  } catch (e) {
        reportServerError('src/lib/auth-guard.ts:46', e);
    return { ok: false, message: 'Invalid or expired session. Please sign in again.' };
  }
}

export async function requireAdmin(idToken: AuthToken): Promise<GuardResult> {
  const result = await requireUser(idToken);
  if (!result.ok) return result;
  if (idToken === SERVER_INTERNAL) return result;

  try {
    const { auth } = initializeFirebase();
    const user = await auth.getUser(result.uid);
    const claimRole = (user.customClaims as any)?.role;
    const isAdminByClaim = claimRole === 'admin';
    // An unverified address proves nothing: anyone can sign up with an
    // email/password account using an admin's address if it's free.
    const isAdminByEmail = result.emailVerified && !!result.email && ADMIN_EMAILS.includes(result.email.toLowerCase());

    if (!isAdminByClaim && !isAdminByEmail) {
      return { ok: false, message: 'Admin access required.' };
    }
    return result;
  } catch (e) {
        reportServerError('src/lib/auth-guard.ts:66', e);
    return { ok: false, message: 'Could not verify admin access.' };
  }
}

/** The caller must be `userId` themselves, or an admin acting on their behalf. */
export async function requireSelfOrAdmin(idToken: AuthToken, userId: string): Promise<GuardResult> {
  const result = await requireUser(idToken);
  if (!result.ok) return result;
  if (idToken === SERVER_INTERNAL || result.uid === userId) return result;
  return requireAdmin(idToken);
}
