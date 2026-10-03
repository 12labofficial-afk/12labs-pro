import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';
import { webhookEventId, storeWebhookEvent, processStoredWebhookEvent, retryFailedWebhookEvents } from '@/lib/razorpay-events';

/**
 * Razorpay webhook — verify, store, acknowledge, then process.
 *
 * - Bad or missing signature  → 400 (not from Razorpay, or the secret is
 *   wrong; alerted so it gets fixed).
 * - Secret not configured     → 500 (server misconfigured; alerted).
 * - Verified event            → saved to webhookEvents, then 200 at once.
 *   Processing runs right after the response; if it fails the event stays
 *   'failed' and is retried by later deliveries, and the user's payment is
 *   also re-checked with Razorpay when they open the app.
 * - Could not save the event  → 500 so Razorpay delivers it again.
 *
 * Answering only after saving keeps the reply fast (no grant work before
 * it), so cold starts don't time deliveries out and disable the webhook.
 */

let lastSignatureAlert = 0;
function alertOnce(message: string) {
    if (Date.now() - lastSignatureAlert < 10 * 60 * 1000) return;
    lastSignatureAlert = Date.now();
    after(() => sendToTelegram(message).catch(() => null));
}

export async function POST(req: NextRequest) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    const text = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!secret) {
        console.error('[Razorpay Webhook] No webhook secret configured.');
        alertOnce(`🚨 <b>RAZORPAY WEBHOOK — NO SECRET ON SERVER</b>\nSet RAZORPAY_WEBHOOK_SECRET. Payments are still recovered when users open the app, but the webhook is failing.`);
        return NextResponse.json({ status: 'error', message: 'Webhook not configured' }, { status: 500 });
    }

    const expected = crypto.createHmac('sha256', secret).update(text).digest('hex');
    const valid = !!signature && signature.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
    if (!valid) {
        let eventName = 'unknown';
        try { eventName = JSON.parse(text)?.event || 'unknown'; } catch { /* not JSON */ }
        console.error('[Razorpay Webhook] Signature verification failed.');
        alertOnce(`🚨 <b>RAZORPAY WEBHOOK — BAD SIGNATURE</b>\n<b>Event:</b> ${escapeHtml(eventName)}\nRAZORPAY_WEBHOOK_SECRET doesn't match the secret in the Razorpay dashboard (or this request isn't from Razorpay).`);
        return NextResponse.json({ status: 'error', message: 'Invalid signature' }, { status: 400 });
    }

    let event: any;
    try {
        event = JSON.parse(text);
    } catch {
        return NextResponse.json({ status: 'error', message: 'Invalid JSON' }, { status: 400 });
    }

    const eventId = webhookEventId(req.headers.get('x-razorpay-event-id'), text);
    try {
        const isNew = await storeWebhookEvent(eventId, text, String(event?.event || 'unknown'));
        if (!isNew) return NextResponse.json({ status: 'duplicate' });
    } catch (e: any) {
        reportServerError('src/app/api/webhook/razorpay/route.ts:store', e, { eventId });
        // Not saved — let Razorpay deliver it again.
        return NextResponse.json({ status: 'error', message: 'Temporary failure' }, { status: 500 });
    }

    after(async () => {
        await processStoredWebhookEvent(eventId);
        // Self-healing: each delivery also retries a few earlier failures.
        await retryFailedWebhookEvents(3).catch((e: any) => reportServerError('src/app/api/webhook/razorpay/route.ts:retry', e));
    });
    return NextResponse.json({ status: 'accepted' });
}

export const maxDuration = 60;
