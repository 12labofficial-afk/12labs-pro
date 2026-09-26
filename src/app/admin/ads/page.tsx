'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, ExternalLink, IndianRupee, Coins, Eye, Clock, Check, X } from 'lucide-react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, query, orderByChild, equalTo } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import type { AdCampaign } from '@/lib/types';
import { approveAdAction, rejectAdAction } from './actions';

function PendingAdCard({ ad, onApprove, onReject }: { ad: AdCampaign; onApprove: (id: string) => Promise<void>; onReject: (id: string, reason: string) => Promise<void>; }) {
  const [isActing, setIsActing] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const handleApprove = async () => {
    setIsActing(true);
    await onApprove(ad.id);
    setIsActing(false);
  };

  const handleReject = async () => {
    if (!reason.trim()) return;
    setIsActing(true);
    await onReject(ad.id, reason.trim());
    setIsActing(false);
  };

  return (
    <Card className="rounded-2xl border-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold">{ad.advertiserName || 'Unknown Advertiser'}</CardTitle>
            <CardDescription className="text-xs">{ad.advertiserEmail}</CardDescription>
          </div>
          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider">
            {ad.submittedAt ? formatDistanceToNow(new Date(ad.submittedAt), { addSuffix: true }) : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <a
          href={ad.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-semibold text-primary underline break-all"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" /> {ad.videoUrl}
        </a>
        <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
          <span className="flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5" /> {ad.budgetInr}</span>
          <span className="flex items-center gap-1"><Coins className="h-3.5 w-3.5" /> {ad.budgetCredits.toLocaleString()} credits pool</span>
        </div>

        {!isRejecting ? (
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1 rounded-xl" onClick={handleApprove} disabled={isActing}>
              {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Approve</>}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 rounded-xl text-destructive border-destructive/30" onClick={() => setIsRejecting(true)} disabled={isActing}>
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <Textarea placeholder="Rejection reason..." value={reason} onChange={(e) => setReason(e.target.value)} className="text-xs min-h-[60px]" />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="flex-1 rounded-xl" onClick={handleReject} disabled={isActing || !reason.trim()}>
                {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Reject'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsRejecting(false)} disabled={isActing}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LiveAdCard({ ad }: { ad: AdCampaign }) {
  const pctSpent = ad.budgetCredits > 0 ? Math.min(100, Math.round((ad.spentCredits / ad.budgetCredits) * 100)) : 0;
  return (
    <Card className="rounded-2xl border-primary/10">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold truncate">{ad.advertiserEmail}</p>
          <Badge className={ad.status === 'exhausted' ? 'bg-muted text-muted-foreground' : 'bg-green-500/10 text-green-600 border-green-500/20'}>
            {ad.status}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {ad.viewCount} views</span>
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {Math.round(ad.totalWatchSeconds / 60)} min watched</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${pctSpent}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground font-semibold">{ad.spentCredits.toLocaleString()} / {ad.budgetCredits.toLocaleString()} credits paid out</p>
      </CardContent>
    </Card>
  );
}

export default function AdminAdsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { database } = initializeFirebase();
  const [pending, setPending] = useState<AdCampaign[] | null>(null);
  const [live, setLive] = useState<AdCampaign[] | null>(null);

  useEffect(() => {
    if (!database) return;
    const q = query(ref(database, 'ads'), orderByChild('status'), equalTo('pending_review'));
    const unsub = onRtdbValue(q, (snap) => {
      const val = snap.val() || {};
      const list = Object.entries(val).map(([id, data]: [string, any]) => ({ id, ...data } as AdCampaign));
      list.sort((a, b) => new Date(a.submittedAt || a.createdAt).getTime() - new Date(b.submittedAt || b.createdAt).getTime());
      setPending(list);
    }, 'admin-ads:pending');
    return () => unsub();
  }, [database]);

  useEffect(() => {
    if (!database) return;
    const q = query(ref(database, 'ads'), orderByChild('status'), equalTo('active'));
    const unsub = onRtdbValue(q, (snap) => {
      const val = snap.val() || {};
      const list = Object.entries(val).map(([id, data]: [string, any]) => ({ id, ...data } as AdCampaign));
      list.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
      setLive(list);
    }, 'admin-ads:live');
    return () => unsub();
  }, [database]);

  const handleApprove = async (adId: string) => {
    if (!user?.email) return;
    const result = await approveAdAction(adId, user.email);
    toast(result.success ? { title: 'Ad Approved' } : { variant: 'destructive', title: 'Failed', description: result.message });
  };

  const handleReject = async (adId: string, reason: string) => {
    if (!user?.email) return;
    const result = await rejectAdAction(adId, reason, user.email);
    toast(result.success ? { title: 'Ad Rejected' } : { variant: 'destructive', title: 'Failed', description: result.message });
  };

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4 space-y-10">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight">Ads Review</h1>
        <p className="text-sm text-muted-foreground">Approve or reject advertiser-submitted video links before they go live to viewers.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Pending Review {pending ? `(${pending.length})` : ''}</h2>
        {pending === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting on review.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pending.map((ad) => (
              <PendingAdCard key={ad.id} ad={ad} onApprove={handleApprove} onReject={handleReject} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Live Ads {live ? `(${live.length})` : ''}</h2>
        {live === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : live.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active ads right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {live.map((ad) => <LiveAdCard key={ad.id} ad={ad} />)}
          </div>
        )}
      </section>
    </div>
  );
}
