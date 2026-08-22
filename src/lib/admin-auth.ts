import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { initializeFirebase } from '@/firebase/server';

const ADMIN_EMAILS = new Set([
  'toonday378@gmail.com',
  'yrathod18495@gmail.com',
  'yashsharma4638@gmail.com',
  'abcdtoon30@gmail.com',
  '12labofficial@gmail.com',
]);

export async function requireAdminPage() {
  const session = (await cookies()).get('__session')?.value;
  if (!session) redirect('/');
  try {
    const { auth } = initializeFirebase();
    const decoded = await auth.verifySessionCookie(session, true);
    const email = (decoded.email || '').toLowerCase();
    if (decoded.role !== 'admin' && !ADMIN_EMAILS.has(email)) redirect('/');
    return decoded;
  } catch {
    redirect('/');
  }
}