'use client';

import { initializeFirebase } from '@/firebase';

/** Fresh Firebase ID token of the signed-in user, for server actions that verify the caller. */
export async function getIdToken(): Promise<string> {
  const user = initializeFirebase().auth?.currentUser;
  return user ? user.getIdToken() : '';
}
