import type { NextRequest } from 'next/server';
import { GET as getVoiceCatalog } from '@/app/api/voices/route';
import { withCors, corsPreflight } from '@/lib/cors';

// Canonical public catalog alias. Keep /api/voices working for older clients.
export async function GET(request: NextRequest) {
  return withCors(await getVoiceCatalog(request));
}

export async function OPTIONS() {
  return corsPreflight();
}
