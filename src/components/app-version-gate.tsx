'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/app-version';

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
 */
export function AppVersionGate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    const checkVersion = async () => {
      if (checkingRef.current || document.visibilityState !== 'visible') return;
      checkingRef.current = true;
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.version && data.version !== APP_VERSION) {
            setUpdateAvailable(true);
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

  if (!updateAvailable) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-version-gate-title"
    >
      <div className="w-full max-w-sm rounded-lg border bg-background p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <RefreshCw className="h-6 w-6 text-primary" />
        </div>
        <h2 id="app-version-gate-title" className="text-lg font-semibold">
          Naya Update Available
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          12Labs ka naya version aa gaya hai. Aage badhne ke liye page ko update karein.
        </p>
        <Button className="mt-5 w-full" onClick={() => window.location.reload()}>
          Update Now
        </Button>
      </div>
    </div>
  );
}
