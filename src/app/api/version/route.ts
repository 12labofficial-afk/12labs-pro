import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/app-version';

// Must always reflect what's ACTUALLY deployed right now, never a cached
// answer — that's the whole point of the check in app-version-gate.tsx.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { version: APP_VERSION },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } }
  );
}
