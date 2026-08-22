import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/server';

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  try {
    const { auth } = initializeFirebase();
    const decoded = await auth.verifyIdToken(header.slice(7).trim());
    const session = await auth.createSessionCookie(header.slice(7).trim(), {
      expiresIn: 1000 * 60 * 60 * 24 * 5,
    });
    const response = NextResponse.json({ success: true, uid: decoded.uid });
    response.cookies.set('__session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 5,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Invalid authentication token.' }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('__session', '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}