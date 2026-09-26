'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, ExternalLink, Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { getActiveAdForViewer, recordAdWatch } from '../actions';
import type { AdCampaign } from '@/lib/types';

const MIN_CLAIM_SECONDS = 30; // must watch at least this long before the claim button unlocks
const MAX_TRACKED_SECONDS = 20 * 60; // matches the server-side ceiling — no point counting past it

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith('/shorts/')) return `https://www.youtube.com/embed/${u.pathname.split('/')[2]}`;
    }
    if (host === 'youtu.be') {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    return url; // generic — try embedding as-is, most hosts allow it
  } catch {
    return null;
  }
}

export default function AdsEarnViewerPage() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [ad, setAd] = useState<AdCampaign | null>(null);
  const [ratePerMinute, setRatePerMinute] = useState(10);
  const [watchedSeconds, setWatchedSeconds] = useState(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimedCredits, setClaimedCredits] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadAd = async () => {
    if (!user?.uid) return;
    setLoading(true);
    setClaimedCredits(null);
    setWatchedSeconds(0);
    const result = await getActiveAdForViewer(user.uid);
    setAd(result.ad);
    setRatePerMinute(result.ratePerMinute);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.uid) loadAd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (!ad || claimedCredits !== null) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      setWatchedSeconds((s) => Math.min(s + 1, MAX_TRACKED_SECONDS));
    };
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ad, claimedCredits]);

  const handleClaim = async () => {
    if (!user?.uid || !ad) return;
    setIsClaiming(true);
    try {
      const result = await recordAdWatch(user.uid, ad.id, watchedSeconds);
      if (result.success) {
        setClaimedCredits(result.creditsEarned);
        if (result.creditsEarned > 0 && result.newCredits !== undefined) {
          setUser((prev) => (prev ? { ...prev, credits: result.newCredits! } : prev));
          toast({ title: 'Credits Earned!', description: `+${result.creditsEarned} credits added to your account.` });
        } else {
          toast({ title: 'Nothing left to claim', description: 'This ad ran out of budget just as you finished. Try another one!' });
        }
      } else {
        toast({ variant: 'destructive', title: 'Could not claim', description: result.error });
      }
    } finally {
      setIsClaiming(false);
    }
  };

  const estimatedCredits = Math.floor((watchedSeconds / 60) * ratePerMinute);
  const mm = String(Math.floor(watchedSeconds / 60)).padStart(2, '0');
  const ss = String(watchedSeconds % 60).padStart(2, '0');
  const embedUrl = ad?.videoUrl ? toEmbedUrl(ad.videoUrl) : null;

  return (
    <div className="container mx-auto max-w-2xl py-10 px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black uppercase tracking-tight">Watch &amp; Earn</h1>
        <p className="text-sm text-muted-foreground mt-1">Watch an advertiser's video and earn credits for the time you spend.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !ad ? (
        <Card className="rounded-3xl border-primary/10">
          <CardContent className="p-10 text-center space-y-4">
            <PlayCircle className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="font-semibold text-muted-foreground">No ads available right now. Check back in a bit!</p>
            <Button variant="outline" className="rounded-xl" onClick={loadAd}>
              <RefreshCw className="h-4 w-4 mr-2" /> Check Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl border-primary/10 overflow-hidden">
          <div className="aspect-video w-full bg-black">
            {embedUrl && (
              <iframe
                src={embedUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
          <CardContent className="p-6 space-y-5">
            <a href={ad.videoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary">
              <ExternalLink className="h-3.5 w-3.5" /> Video not loading? Open it directly
            </a>

            {claimedCredits !== null ? (
              <div className="text-center space-y-4 py-2">
                <div className="flex items-center justify-center gap-2 text-2xl font-black text-primary">
                  <Coins className="h-6 w-6" /> +{claimedCredits} Credits
                </div>
                <Button className="rounded-xl w-full" onClick={loadAd}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Watch Another Ad
                </Button>
                <Button variant="ghost" size="sm" onClick={() => router.push('/ads-earn')}>Back to Ads &amp; Earn</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-muted-foreground">Watch time: {mm}:{ss}</span>
                  <span className="text-sm font-bold text-primary flex items-center gap-1"><Coins className="h-4 w-4" /> ~{estimatedCredits} credits</span>
                </div>
                <Button className="w-full rounded-xl h-12" onClick={handleClaim} disabled={watchedSeconds < MIN_CLAIM_SECONDS || isClaiming}>
                  {isClaiming ? <Loader2 className="h-5 w-5 animate-spin" /> : watchedSeconds < MIN_CLAIM_SECONDS ? `Keep watching (${MIN_CLAIM_SECONDS - watchedSeconds}s more)` : 'Claim Credits'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
