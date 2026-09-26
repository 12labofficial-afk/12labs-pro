'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Loader2, IndianRupee, Coins, Eye, Clock, Link as LinkIcon } from 'lucide-react';
import { createAdBudgetOrder, confirmAdBudgetPayment, submitAdVideoLink } from '../actions';
import { initializeFirebase } from '@/firebase';
import { ref, query, orderByChild, equalTo } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { AdCampaign } from '@/lib/types';
import { reportClientError } from '@/lib/report-client-error';

const MIN_BUDGET = 50;
const MAX_BUDGET = 20000;

const STATUS_LABEL: Record<AdCampaign['status'], { label: string; className: string }> = {
  pending_link: { label: 'Awaiting video link', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  pending_review: { label: 'Under review', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  active: { label: 'Live', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
  rejected: { label: 'Rejected', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  exhausted: { label: 'Budget used up', className: 'bg-muted text-muted-foreground' },
};

function AdStatCard({ ad, onSubmitLink }: { ad: AdCampaign; onSubmitLink: (adId: string, url: string) => Promise<void>; }) {
  const [videoUrl, setVideoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const status = STATUS_LABEL[ad.status];
  const pctSpent = ad.budgetCredits > 0 ? Math.min(100, Math.round((ad.spentCredits / ad.budgetCredits) * 100)) : 0;

  const handleSubmit = async () => {
    if (!videoUrl.trim()) return;
    setIsSubmitting(true);
    await onSubmitLink(ad.id, videoUrl.trim());
    setIsSubmitting(false);
  };

  return (
    <Card className="rounded-2xl border-primary/10">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-bold"><IndianRupee className="h-3.5 w-3.5" /> {ad.budgetInr} budget</span>
          <Badge className={status.className}>{status.label}</Badge>
        </div>

        {(ad.status === 'pending_link' || ad.status === 'rejected') ? (
          <div className="space-y-2">
            {ad.status === 'rejected' && ad.rejectionReason && (
              <p className="text-xs text-destructive font-semibold">Reason: {ad.rejectionReason}</p>
            )}
            <div className="flex gap-2">
              <Input placeholder="Paste your video link..." value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="rounded-xl text-sm" />
              <Button size="sm" className="rounded-xl shrink-0" onClick={handleSubmit} disabled={isSubmitting || !videoUrl.trim()}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <a href={ad.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline break-all block">{ad.videoUrl}</a>
            <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {ad.viewCount} views</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {Math.round(ad.totalWatchSeconds / 60)} min watched</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${pctSpent}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold">{ad.spentCredits.toLocaleString()} / {ad.budgetCredits.toLocaleString()} credits paid out to viewers</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdsEarnAdvertiserPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { database } = initializeFirebase();

  const [budget, setBudget] = useState(500);
  const [isPaying, setIsPaying] = useState(false);
  const [myAds, setMyAds] = useState<AdCampaign[] | null>(null);

  useEffect(() => {
    if (!database || !user?.uid) return;
    const q = query(ref(database, 'ads'), orderByChild('advertiserId'), equalTo(user.uid));
    const unsub = onRtdbValue(q, (snap) => {
      const val = snap.val() || {};
      const list = Object.entries(val).map(([id, data]: [string, any]) => ({ id, ...data } as AdCampaign));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMyAds(list);
    }, 'ads-earn:my-ads');
    return () => unsub();
  }, [database, user?.uid]);

  const handleSubmitLink = async (adId: string, url: string) => {
    if (!user?.uid) return;
    const result = await submitAdVideoLink(adId, user.uid, url);
    if (result.success) {
      toast({ title: 'Submitted!', description: 'Your video is now waiting for admin review.' });
    } else {
      toast({ variant: 'destructive', title: 'Failed', description: result.error });
    }
  };

  const handlePayAndContinue = async () => {
    if (!user?.uid || !user.email) {
      toast({ variant: 'destructive', title: 'Session Required', description: 'Please sign in to continue.' });
      return;
    }
    if (typeof window === 'undefined' || !(window as any).Razorpay) {
      toast({ variant: 'destructive', title: 'Payment Module Loading', description: 'Please try again in a moment.' });
      return;
    }

    setIsPaying(true);
    try {
      const orderResult = await createAdBudgetOrder(user.uid, user.name, user.email, budget);
      if (!orderResult.success) throw new Error(orderResult.error);
      const order = orderResult.order;

      const options: any = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: '12Labs Ads & Earn',
        description: `Ad budget top-up — ₹${budget}`,
        handler: async function (response: any) {
          try {
            const confirmed = await confirmAdBudgetPayment({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });
            if (confirmed.success) {
              toast({ title: 'Budget Funded!', description: 'Now submit your video link below.' });
            } else {
              reportClientError('src/app/ads-earn/advertiser/page.tsx:confirm', new Error(confirmed.error || 'confirm failed'));
              toast({ title: 'Payment Received', description: 'Your ad is being set up. It will appear below in a moment.' });
            }
          } finally {
            setIsPaying(false);
          }
        },
        prefill: { name: user.name, email: user.email },
        theme: { color: '#2563eb' },
        modal: { ondismiss: () => setIsPaying(false) },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (error: any) {
      reportClientError('src/app/ads-earn/advertiser/page.tsx:pay', error);
      toast({ variant: 'destructive', title: 'Checkout Failed', description: error.message });
      setIsPaying(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl py-10 px-4 space-y-10">
      <div className="text-center">
        <h1 className="text-3xl font-black uppercase tracking-tight">Advertise &amp; Reach Viewers</h1>
        <p className="text-sm text-muted-foreground mt-1">Pick a budget, fund it, then share your video link.</p>
      </div>

      <Card className="rounded-3xl border-primary/10">
        <CardHeader>
          <CardTitle className="text-lg">Set Your Budget</CardTitle>
          <CardDescription>₹{MIN_BUDGET} minimum, ₹{MAX_BUDGET.toLocaleString()} maximum.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <span className="text-5xl font-black text-primary">₹{budget.toLocaleString()}</span>
          </div>
          <Slider
            value={[budget]}
            onValueChange={([v]) => setBudget(v)}
            min={MIN_BUDGET}
            max={MAX_BUDGET}
            step={50}
          />
          <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <span>₹{MIN_BUDGET}</span>
            <span>₹{MAX_BUDGET.toLocaleString()}</span>
          </div>
          <Button className="w-full h-12 rounded-xl font-black" onClick={handlePayAndContinue} disabled={isPaying}>
            {isPaying ? <Loader2 className="h-5 w-5 animate-spin" /> : `Pay ₹${budget.toLocaleString()} & Continue`}
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Your Ads</h2>
        {myAds === null ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : myAds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ads yet — fund a budget above to get started.</p>
        ) : (
          <div className="space-y-4">
            {myAds.map((ad) => <AdStatCard key={ad.id} ad={ad} onSubmitLink={handleSubmitLink} />)}
          </div>
        )}
      </section>
    </div>
  );
}
