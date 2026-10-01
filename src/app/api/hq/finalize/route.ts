
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { completeProject } from '@/lib/complete-project';
import { reportServerError } from '@/lib/report-error';

/**
 * 🔒 HQ PRODUCTION FINALIZATION WEBHOOK (v3.9 - STABLE HANDSHAKE)
 * ---------------------------------------
 * This endpoint is called by the HQ Bridge Node once synthesis is complete.
 * Path: /api/hq/finalize
 * Protocol: Secure Lightweight POST Handshake
 */

export const dynamic = 'force-dynamic';

// This marks any user's project complete with a caller-supplied audio URL,
// so it was effectively public write access. Now requires the shared secret
// in HQ_FINALIZE_SECRET (header: x-hq-secret); disabled until it's set.
function hasValidSecret(request: NextRequest): boolean {
    const expected = process.env.HQ_FINALIZE_SECRET;
    const got = request.headers.get('x-hq-secret');
    if (!expected || !got) return false;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(got, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
    if (!hasValidSecret(request)) {
        return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }
    try {
        const userAgent = request.headers.get('user-agent') || 'Unknown';
        
        const body = await request.json().catch((e: any) => { reportServerError('src/app/api/hq/finalize/route.ts:20', e); return null; });
        if (!body) {
            return NextResponse.json({ success: false, error: "Empty payload node." }, { status: 400 });
        }

        // Lightweight parameters only to avoid payload issues
        const { projectId, userId, userEmail, projectName, audioUrl, usedBridge } = body;

        if (!projectId || !userId || !audioUrl) {
            return NextResponse.json({ success: false, error: "Missing required node identifiers." }, { status: 400 });
        }

        /**
         * 🏁 PRODUCTION FINALIZATION
         * Note: syncData is already saved directly by the bridge to Firestore.
         */
        const result = await completeProject(
            projectId,
            userId,
            projectName || "HQ Voiceover",
            audioUrl,
            undefined, // We don't pass syncData here to keep handshake fast
            "12Labs Neural Bridge",
            !!usedBridge
        );

        if (result.success) {
            return NextResponse.json({ 
                success: true, 
                message: "Production handshake secured. User notified." 
            });
        } else {
            return NextResponse.json({ success: false, error: result.message }, { status: 500 });
        }

    } catch (error: any) {
        reportServerError('src/app/api/hq/finalize/route.ts:54', error);
        console.error("[HQ Finalize] Critical Synchronizer Fault:", error.message);
        return NextResponse.json({ 
            success: false, 
            error: "Main server node synchronization error." 
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ 
        status: "operational", 
        node: "12Labs-HQ-Finalizer",
        protocol: "POST-Only"
    });
}
