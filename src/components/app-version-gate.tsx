'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/auth-provider';
import { sendUserChatMessage } from '@/app/admin/chat/actions';
import { APP_UPDATE_NOTES, APP_VERSION } from '@/lib/app-version';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * 🔔 Force-update prompt. Polls /api/version (always live, never cached)
 * against the APP_VERSION baked into THIS tab's already-loaded JS bundle.
 * Only a version bump (see src/lib/app-version.ts) ever makes these differ
 * — an ordinary deploy that doesn't touch that file is invisible to this
 * check, so it never fires on its own. A plain custom overlay rather than
 * the shared Dialog: this one is deliberately NOT dismissible (no X, no
 * outside-click, no Escape) since the entire point is to get a stale tab
 * onto the new build before it hits a stale-chunk fetch failure.
 *
 * Also doubles as a "tell us what's wrong" channel right at the moment a
 * user is most likely to have hit something — the message posts straight
 * into that user's Live Chat thread (same path the admin chat dock reads),
 * not a new feedback system.
 */
export function AppVersionGate() {
  const { user } = useAuth();
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const foundRef = useRef(false);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  useEffect(() => {
    const checkVersion = async () => {
      // Once an update is already known, there's nothing left to poll for —
      // stop hitting the endpoint every interval/tab-focus.
      if (checkingRef.current || foundRef.current || document.visibilityState !== 'visible') return;
      checkingRef.current = true;
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.version && data.version !== APP_VERSION) {
            foundRef.current = true;
            setNewVersion(data.version);
          }
        }
      } catch {
        // Network blip — not actionable, just try again next interval.
      } finally {
        checkingRef.current = false;
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', checkVersion);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', checkVersion);
    };
  }, []);

  // 🔴 FIX: this overlay blocks interaction visually, but nothing stopped
  // the page BEHIND it from still scrolling (touch/wheel passed straight
  // through to the body) — a real bug for a modal that's supposed to be
  // blocking. Locks body scroll only while the prompt is actually shown.
  useEffect(() => {
    if (!newVersion) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [newVersion]);

  const handleSendFeedback = async () => {
    const text = feedbackText.trim();
    if (!text) return;
    if (!user) {
      setFeedbackError('Feedback bhejne ke liye pehle login karein.');
      return;
    }
    setFeedbackSending(true);
    setFeedbackError('');
    try {
      const result = await sendUserChatMessage(
        user.uid,
        user.name || user.email || 'N/A',
        user.email || 'N/A',
        { text: `[Update v${APP_VERSION} → v${newVersion}] ${text}` },
        crypto.randomUUID()
      );
      if (!result.success) throw new Error(result.message);
      setFeedbackSent(true);
      setFeedbackText('');
    } catch (e: any) {
      setFeedbackError(e.message || 'Bhejne mein dikkat aayi, dobara try karein.');
    } finally {
      setFeedbackSending(false);
    }
  };

  if (!newVersion) return null;

  return (
    <div
      // 🔴 FIX: AlertDialog/Popover/Select are also z-[300] and render into
      // a portal appended at the END of <body> — since this component is
      // NOT portaled (it renders inline, early in the tree), any of those
      // open at the same time would paint OVER this "forced" update prompt
      // at an equal z-index. z-[400] guarantees this always wins.
      className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto bg-black/80 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-version-gate-title"
    >
      <div className="my-auto w-full max-w-[340px] max-h-full overflow-y-auto rounded-2xl border bg-background p-5 text-center shadow-lg">
        <div className="flex items-baseline justify-center space-x-1">
          <span className="text-2xl font-bold font-logo text-primary">12</span>
          <span className="text-2xl font-bold font-headline">Labs</span>
        </div>

        <div className="mx-auto mt-3 mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <RefreshCw className="h-5 w-5 text-primary" />
        </div>
        <h2 id="app-version-gate-title" className="text-base font-semibold">
          Naya Update Available
        </h2>

        <div className="mt-1.5 flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground">
          <span>v{APP_VERSION}</span>
          <ArrowRight className="h-3 w-3" />
          <span className="font-semibold text-primary">v{newVersion}</span>
        </div>

        {APP_UPDATE_NOTES.length > 0 && (
          <div className="mt-3 rounded-lg bg-muted/50 p-2.5 text-left">
            <p className="text-xs font-semibold text-muted-foreground">What's New</p>
            <ul className="mt-1.5 space-y-1">
              {APP_UPDATE_NOTES.map((note, i) => (
                <li key={i} className="text-[11px] leading-snug text-muted-foreground/80 flex gap-1.5">
                  <span className="text-primary">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button className="mt-4 w-full" onClick={() => window.location.reload()}>
          Update Now
        </Button>

        <div className="mt-3 border-t pt-3">
          {!feedbackOpen ? (
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Suggestion ya koi problem? Bataiye
            </button>
          ) : feedbackSent ? (
            <p className="text-xs font-medium text-primary">Dhanyavaad! Aapka message humein mil gaya.</p>
          ) : (
            <div className="text-left">
              <Textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Suggestion ya problem yahan likhein..."
                className="min-h-[64px] text-xs"
                autoFocus
              />
              {feedbackError && <p className="mt-1 text-[11px] font-medium text-destructive">{feedbackError}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setFeedbackOpen(false); setFeedbackError(''); }}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleSendFeedback} disabled={feedbackSending || !feedbackText.trim()}>
                  {feedbackSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
