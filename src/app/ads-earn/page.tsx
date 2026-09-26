'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Megaphone, PlayCircle, Wallet } from 'lucide-react';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';

export default function AdsEarnPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCardClick = () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Session Required', description: 'Please sign in to continue.' });
      router.push('/login');
      return;
    }
    setIsDialogOpen(true);
  };

  return (
    <div className="container mx-auto max-w-2xl py-16 px-4">
      <Card
        onClick={handleCardClick}
        className="rounded-[2.5rem] border-primary/10 bg-gradient-to-br from-primary/5 via-background to-background shadow-lg hover:shadow-2xl hover:border-primary/30 transition-all duration-300 cursor-pointer group"
      >
        <CardContent className="p-12 text-center space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
            <Megaphone className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Ads &amp; Earn</h1>
          <p className="text-muted-foreground font-semibold max-w-sm mx-auto">
            Watch a video and earn credits, or run your own ad and reach real viewers.
          </p>
          <Button size="lg" className="rounded-xl h-12 px-8 font-black">Get Started</Button>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-3xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-center">You are a...</DialogTitle>
            <DialogDescription className="text-center">Pick how you'd like to use Ads &amp; Earn.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 pt-2">
            <button
              onClick={() => router.push('/ads-earn/viewer')}
              className="flex items-center gap-4 p-4 rounded-2xl border border-primary/10 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
            >
              <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
                <PlayCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold">Viewer</p>
                <p className="text-xs text-muted-foreground">Watch a video, earn credits.</p>
              </div>
            </button>
            <button
              onClick={() => router.push('/ads-earn/advertiser')}
              className="flex items-center gap-4 p-4 rounded-2xl border border-primary/10 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
            >
              <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold">Advertiser</p>
                <p className="text-xs text-muted-foreground">Fund a budget, run your video ad.</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
