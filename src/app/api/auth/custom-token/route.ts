import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

import { rateLimit, tooManyRequests, clientIp } from '@/lib/rate-limit';
import { resolveDeveloperKey } from '@/lib/hf-proxy';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch((e: any) => { reportServerError('src/app/api/auth/custom-token/route.ts:7', e); return ({}); });
    const { uid, projectId, apiKey } = body;

    const authHeader = request.headers.get('authorization');
    const xApiKey = request.headers.get('x-api-key');

    const { auth, database } = initializeFirebase();

    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Firebase Admin Auth is not configured on the server.' },
        { status: 500 }
      );
    }

    // The token is minted ONLY for the identity the caller proves: a valid
    // Firebase ID token, or an existing enabled API key (its owner). A uid in
    // the body used to be accepted as-is (and also when the ID token failed
    // to verify), which let anyone mint a sign-in token for any account.
    let targetUid: string | null = null;

    if (!(await rateLimit('custom-token', clientIp(request.headers), 20, 60))) {
      return tooManyRequests(60);
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.slice('Bearer '.length);
      try {
        const decodedToken = await auth.verifyIdToken(idToken);
        targetUid = decodedToken.uid;
      } catch (err: any) {
        return NextResponse.json({ success: false, error: 'Invalid or expired ID token.' }, { status: 401 });
      }
    } else if (xApiKey) {
      const keyRecord = await resolveDeveloperKey(xApiKey);
      if (!keyRecord.exists || keyRecord.disabled || !keyRecord.userId) {
        return NextResponse.json({ success: false, error: 'Invalid or disabled API key.' }, { status: 401 });
      }
      targetUid = keyRecord.userId;
    }

    if (uid && targetUid && uid !== targetUid) {
      return NextResponse.json({ success: false, error: 'uid does not match the authenticated caller.' }, { status: 403 });
    }

    if (!targetUid) {
      return NextResponse.json(
        { success: false, error: 'A valid Bearer ID token or x-api-key is required.' },
        { status: 401 }
      );
    }

    // Custom claims attached to token
    const additionalClaims: Record<string, any> = {
      developer: true,
      timestamp: Date.now(),
    };

    if (projectId) additionalClaims.projectId = projectId;
    if (apiKey) additionalClaims.apiKey = apiKey;

    // Generate custom Firebase Auth token using Firebase Admin SDK
    const customToken = await auth.createCustomToken(targetUid, additionalClaims);

    return NextResponse.json(
      {
        success: true,
        customToken,
        uid: targetUid,
        projectId: projectId || null,
        expiresIn: 3600,
        createdAt: new Date().toISOString(),
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        },
      }
    );
  } catch (error: any) {
        reportServerError('src/app/api/auth/custom-token/route.ts:76', error);
    console.error('Error generating custom Firebase Auth token:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate custom token' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}
