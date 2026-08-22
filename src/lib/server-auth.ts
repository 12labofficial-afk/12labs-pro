import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { initializeFirebase } from '@/firebase/server';

export async function requireApiUser(request: NextRequest): Promise<{ uid: string; email?: string }> {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Error('Authentication required.');
  const token = header.slice(7).trim();
  if (!token) throw new Error('Authentication required.');

  const { auth } = initializeFirebase();
  if (!auth) throw new Error('Authentication service unavailable.');
  const decoded = await auth.verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email };
}

export async function requireActionUser(): Promise<{ uid: string; email?: string }> {
  const session = (await cookies()).get('__session')?.value;
  if (!session) throw new Error('Authentication required.');
  const { auth } = initializeFirebase();
  if (!auth) throw new Error('Authentication service unavailable.');
  return auth.verifySessionCookie(session, true);
}

export async function requireActionOwner(userId: string) {
  const user = await requireActionUser();
  if (!userId || user.uid !== userId) throw new Error('Forbidden.');
  return user;
}

export async function requireAdminAction() {
  const user = await requireActionUser();
  const adminEmails = new Set([
    'toonday378@gmail.com',
    'yrathod18495@gmail.com',
    'yashsharma4638@gmail.com',
    'abcdtoon30@gmail.com',
    '12labofficial@gmail.com',
  ]);
  if (user.role !== 'admin' && !adminEmails.has((user.email || '').toLowerCase())) {
    throw new Error('Admin access required.');
  }
  return user;
}