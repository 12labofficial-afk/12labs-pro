import { NextResponse } from 'next/server';

// Unused by the app (hf-bridge calls the HF space's own /generate-text), but
// it was a public, unauthenticated proxy to our Vertex AI account.
export async function POST() {
    return NextResponse.json({ success: false, error: 'This endpoint is deprecated.' }, { status: 410 });
}
