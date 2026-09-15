import { initializeFirebase } from '@/firebase';

/**
 * Best-effort read of the currently logged-in user's email, for attaching
 * to error reports. Never throws — returns 'anonymous' if Firebase isn't
 * initialized yet or no one is logged in, so callers can always show
 * *something* useful in the Telegram log.
 */
export function getCurrentUserEmail(): string {
  try {
    const { auth } = initializeFirebase();
    return auth?.currentUser?.email || 'anonymous';
  } catch {
    return 'anonymous';
  }
}
