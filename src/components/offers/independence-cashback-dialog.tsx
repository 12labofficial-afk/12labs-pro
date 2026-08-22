'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Gift,
  Sparkles,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  Flame,
  AlertCircle,
  HelpCircle,
  History,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Zap,
  Info
} from 'lucide-react';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { 
  getIndependenceOfferStatus, 
  claimIndependenceCashback, 
  IndependenceOfferStatus 
} from '@/app/actions/independence-offer';
import { 
  INDEPENDENCE_OFFER_CONFIG, 
  EARNING_START_MS, 
  EARNING_END_MS, 
  CLAIM_START_MS, 
  CLAIM_END_MS,
  shouldShowOfferUI
} from '@/lib/independence-offer';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  triggerVariant?: 'header' | 'banner' | 'icon-only' | 'custom';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

export function IndependenceCashbackDialog({
  className,
  triggerVariant = 'header',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children
}: Props) {
  const { user, openLoginModal, refreshUserProfile } = useAuth();
  const { toast } = useToast();

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const setIsOpen = isControlled ? (controlledOnOpenChange || (() => {})) : setUncontrolledOpen;

  // Server-synchronized state
  const [serverStatus, setServerStatus] = useState<IndependenceOfferStatus | null>(null);
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Live real-time user offer data from RTDB
  const [liveUserData, setLiveUserData] = useState<{
    accumulatedCredits: number;
    claimed: boolean;
    claimedAt: string | null;
    claimedAmount: number;
    history: Array<any>;
  } | null>(null);

  // Fetch status from server
  const fetchStatus = useCallback(async () => {
    try {
      let status: IndependenceOfferStatus | null = null;
      try {
        const url = user?.uid 
          ? `/api/offers/independence-status?userId=${encodeURIComponent(user.uid)}`
          : `/api/offers/independence-status`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          status = await res.json();
        }
      } catch (apiErr) {
        // Fallback to server action
        status = await getIndependenceOfferStatus(user?.uid).catch(() => null);
      }

      if (!status) {
        status = await getIndependenceOfferStatus(user?.uid).catch(() => null);
      }

      if (status) {
        setServerStatus(status);
        // Offset between verified server time and client Date.now()
        const offset = status.serverNow - Date.now();
        setServerTimeOffset(offset);

        if (status.userData) {
          setLiveUserData(status.userData);
        }
      }
    } catch (e) {
      console.error('[IndependenceCashback] Error fetching server status:', e);
    }
  }, [user?.uid]);

  useEffect(() => {
    fetchStatus();
    // Re-sync server status every 60 seconds
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Real-time listener on Firebase RTDB for instant updates
  useEffect(() => {
    if (!user?.uid) {
      setLiveUserData(null);
      return;
    }

    try {
      const { database } = initializeFirebase();
      if (!database) return;

      const userOfferRef = ref(database, `${INDEPENDENCE_OFFER_CONFIG.RTDB_PATH}/${user.uid}`);
      const unsubscribe = onValue(userOfferRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const historyArr: any[] = [];
          if (val.history && typeof val.history === 'object') {
            Object.keys(val.history).forEach((k) => {
              historyArr.push({ id: k, ...val.history[k] });
            });
            historyArr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          }

          setLiveUserData({
            accumulatedCredits: Number(val.accumulatedCredits || 0),
            claimed: Boolean(val.claimed),
            claimedAt: val.claimedAt || null,
            claimedAmount: Number(val.claimedAmount || 0),
            history: historyArr
          });
        }
      });

      return () => unsubscribe();
    } catch (e) {
      console.error('[IndependenceCashback] RTDB listener error:', e);
    }
  }, [user?.uid]);

  // Current server-synchronized timestamp
  const [currentSyncedTime, setCurrentSyncedTime] = useState<number>(() => Date.now() + serverTimeOffset);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSyncedTime(Date.now() + serverTimeOffset);
    }, 1000);
    return () => clearInterval(timer);
  }, [serverTimeOffset]);

  // Derived phase based on tamper-proof server-synced time
  const currentPhase = useMemo(() => {
    if (currentSyncedTime < EARNING_START_MS) return 'upcoming';
    if (currentSyncedTime >= EARNING_START_MS && currentSyncedTime <= EARNING_END_MS) return 'earning_active';
    if (currentSyncedTime > EARNING_END_MS && currentSyncedTime < CLAIM_START_MS) return 'claim_locked';
    if (currentSyncedTime >= CLAIM_START_MS && currentSyncedTime <= CLAIM_END_MS) return 'claim_unlocked';
    return 'expired';
  }, [currentSyncedTime]);

  // Countdown calculations
  const countdownData = useMemo(() => {
    let targetTime = 0;
    let label = '';

    if (currentPhase === 'upcoming') {
      targetTime = EARNING_START_MS;
      label = 'Starts in';
    } else if (currentPhase === 'earning_active') {
      targetTime = EARNING_END_MS;
      label = 'Offer ends in';
    } else if (currentPhase === 'claim_locked') {
      targetTime = CLAIM_START_MS;
      label = 'Claim unlocks in';
    } else if (currentPhase === 'claim_unlocked') {
      targetTime = CLAIM_END_MS;
      label = 'Claim expires in';
    } else {
      return { label: 'Offer concluded', days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
    }

    const diff = Math.max(0, targetTime - currentSyncedTime);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { label, days, hours, minutes, seconds, totalMs: diff };
  }, [currentPhase, currentSyncedTime]);

  const accumulatedCredits = liveUserData?.accumulatedCredits || 0;
  const isClaimed = liveUserData?.claimed || false;
  const claimedAmount = liveUserData?.claimedAmount || 0;

  // Handle Claim Button
  const handleClaim = async () => {
    if (!user) {
      openLoginModal?.();
      return;
    }

    if (currentPhase !== 'claim_unlocked') {
      toast({
        variant: 'destructive',
        title: 'Claim Locked',
        description: 'Cashback claim will unlock on 16 August at 12:00 AM IST.'
      });
      return;
    }

    if (accumulatedCredits <= 0) {
      toast({
        variant: 'destructive',
        title: 'No Cashback Accumulated',
        description: 'You did not use credits during the 14-15 August offer period.'
      });
      return;
    }

    setIsClaiming(true);
    try {
      let res: any = null;
      try {
        const apiRes = await fetch('/api/offers/independence-claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid })
        });
        if (apiRes.ok) {
          res = await apiRes.json();
        }
      } catch (err) {
        // Fallback to server action
      }

      if (!res) {
        res = await claimIndependenceCashback(user.uid);
      }

      if (res.success) {
        toast({
          title: '🎉 Cashback Claimed Successfully!',
          description: `+${(res.claimedCredits || accumulatedCredits).toLocaleString()} credits added to your account balance.`
        });
        await refreshUserProfile?.();
        await fetchStatus();
      } else {
        toast({
          variant: 'destructive',
          title: 'Claim Failed',
          description: res.error || 'Could not claim cashback. Please try again.'
        });
      }
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e.message || 'Something went wrong.'
      });
    } finally {
      setIsClaiming(false);
    }
  };

  // 🔒 STRICT VISIBILITY CHECK (16th August onwards & Claimed rule):
  // If user has already claimed OR 16th Aug has arrived and user has 0 accumulated credits, totally hide from UI.
  const isOfferVisible = shouldShowOfferUI(currentSyncedTime, accumulatedCredits, isClaimed);
  if (!isOfferVisible && !isOpen) {
    return null;
  }

  const isPost15th = currentSyncedTime > EARNING_END_MS;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* TRIGGER BUTTON */}
      {!children && (
        <DialogTrigger asChild>
          {triggerVariant === 'header' ? (
            <Button
              variant="outline"
              size="icon"
              title="100% Independence Day Cashback Offer"
              className={cn(
                "relative group h-8 w-8 rounded-full border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-emerald-500/15 hover:from-amber-500/25 hover:to-emerald-500/25 text-amber-600 dark:text-amber-400 transition-all duration-200 shadow-xs active:scale-95 flex items-center justify-center shrink-0",
                className
              )}
            >
              <Gift className="h-4 w-4 text-amber-500 animate-bounce group-hover:scale-110 transition-transform" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            </Button>
          ) : triggerVariant === 'banner' ? (
            <div
              role="button"
              className={cn(
                "cursor-pointer w-full p-3 sm:p-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-emerald-500/15 hover:border-amber-500/50 transition-all flex items-center justify-between gap-3 shadow-md",
                className
              )}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-500">
                  <Gift className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-gradient-to-r from-amber-600 to-orange-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.2">
                      {isPost15th ? '🎉 Claim Ready' : '🇮🇳 15 Aug Special'}
                    </Badge>
                    <span className="text-xs font-black uppercase text-foreground">
                      {isPost15th 
                        ? `Claim +${accumulatedCredits.toLocaleString()} Cashback Credits` 
                        : '100% Credit Cashback Offer'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                    {isPost15th 
                      ? (isClaimed ? 'You have successfully claimed your cashback.' : 'Your 100% credit cashback is ready to be claimed!') 
                      : 'Use credits on 14 & 15 Aug & get 100% back on 16 Aug!'}
                  </p>
                </div>
              </div>
              <Button size="sm" className="h-8 rounded-xl font-black text-[10px] uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white">
                {isPost15th ? 'Claim Cashback' : 'View Offer'} <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className={cn("relative rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-500/10", className)}
            >
              <Gift className="h-5 w-5 animate-bounce" />
              {accumulatedCredits > 0 && (
                <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
              )}
            </Button>
          )}
        </DialogTrigger>
      )}

      {children && <DialogTrigger asChild>{children}</DialogTrigger>}

      {/* MODAL CONTENT */}
      <DialogContent className="max-w-xl w-[95vw] max-h-[92vh] flex flex-col p-0 rounded-[2rem] border-border bg-card text-card-foreground shadow-2xl overflow-hidden">
        {/* Festive Header Banner */}
        <div className="relative p-6 sm:p-7 pb-5 border-b border-border bg-gradient-to-b from-amber-500/10 via-background to-muted/20 flex-shrink-0 overflow-hidden">
          {/* Subtle Indian Tricolor Decorative Strip */}
          <div className="absolute top-0 left-0 right-0 h-1.5 flex">
            <div className="flex-1 bg-[#FF9933]" />
            <div className="flex-1 bg-[#FFFFFF] dark:bg-[#DDDDDD]" />
            <div className="flex-1 bg-[#138808]" />
          </div>

          <DialogHeader className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-emerald-500/20 rounded-2xl border border-amber-500/30 text-amber-500 shadow-xs">
                <Gift className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-full">
                    🇮🇳 Independence Day Special
                  </Badge>
                  <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-500" /> Server Verified
                  </span>
                </div>
                <DialogTitle className="text-2xl sm:text-3xl font-black tracking-tight uppercase leading-none mt-1">
                  100% Credit <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 bg-clip-text text-transparent">Cashback</span>
                </DialogTitle>
              </div>
            </div>

            <DialogDescription className="text-xs sm:text-sm font-medium text-muted-foreground leading-relaxed pt-1">
              Jitne bhi credits aap <strong>14 se 15 August (raat 12 baje tak)</strong> use karenge, utne pure credits aapko <strong>100% cashback</strong> me vapas milenge!
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable Modal Body */}
        <div className="overflow-y-auto max-h-[calc(92vh-160px)] p-6 sm:p-7 space-y-6 custom-scrollbar">

          {/* 1. STATUS & COUNTDOWN CARD */}
          <div className="p-4 sm:p-5 rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/5 via-background to-emerald-500/5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {currentPhase === 'earning_active' ? (
                  <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    🔥 Earning Window Active
                  </Badge>
                ) : currentPhase === 'claim_locked' ? (
                  <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 px-3 py-1">
                    <Lock className="h-3 w-3" />
                    Cashback Saved (Claim Locked)
                  </Badge>
                ) : currentPhase === 'claim_unlocked' ? (
                  <Badge className="bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 px-3 py-1 animate-pulse">
                    <Unlock className="h-3 w-3" />
                    🎉 Claim Window Open (3 Days)
                  </Badge>
                ) : currentPhase === 'upcoming' ? (
                  <Badge className="bg-muted text-muted-foreground font-black text-[10px] uppercase tracking-wider px-3 py-1">
                    <Clock className="h-3 w-3 mr-1 inline" />
                    Offer Starts 14 August
                  </Badge>
                ) : (
                  <Badge className="bg-muted text-muted-foreground font-black text-[10px] uppercase tracking-wider px-3 py-1">
                    Offer Concluded
                  </Badge>
                )}
              </div>

              <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>IST: <strong>{serverStatus?.serverISTString || 'Syncing...'}</strong></span>
              </div>
            </div>

            {/* Live Countdown Display */}
            {countdownData.totalMs > 0 && (
              <div className="p-3.5 rounded-xl bg-background/80 border border-border flex items-center justify-between gap-3">
                <div className="text-xs font-black uppercase tracking-tight text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>{countdownData.label}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono font-black text-sm sm:text-base text-foreground">
                  <div className="bg-muted px-2 py-1 rounded-lg border border-border text-center min-w-[32px]">
                    {String(countdownData.days).padStart(2, '0')}<span className="text-[9px] text-muted-foreground ml-0.5">d</span>
                  </div>
                  <span>:</span>
                  <div className="bg-muted px-2 py-1 rounded-lg border border-border text-center min-w-[32px]">
                    {String(countdownData.hours).padStart(2, '0')}<span className="text-[9px] text-muted-foreground ml-0.5">h</span>
                  </div>
                  <span>:</span>
                  <div className="bg-muted px-2 py-1 rounded-lg border border-border text-center min-w-[32px]">
                    {String(countdownData.minutes).padStart(2, '0')}<span className="text-[9px] text-muted-foreground ml-0.5">m</span>
                  </div>
                  <span>:</span>
                  <div className="bg-muted px-2 py-1 rounded-lg border border-border text-center min-w-[32px] text-amber-500">
                    {String(countdownData.seconds).padStart(2, '0')}<span className="text-[9px] text-muted-foreground ml-0.5">s</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. ACCUMULATED CASHBACK STAT CARD */}
          <div className="relative p-6 sm:p-7 rounded-2xl border-2 border-dashed border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-background to-emerald-500/10 text-center space-y-3 overflow-hidden shadow-sm">
            <div className="flex items-center justify-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Your Accumulated 100% Cashback
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-4xl sm:text-5xl font-black tracking-tight text-foreground flex items-center justify-center gap-2">
                <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 bg-clip-text text-transparent">
                  {accumulatedCredits.toLocaleString()}
                </span>
                <span className="text-lg sm:text-xl font-black text-muted-foreground uppercase">
                  Credits
                </span>
              </div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {isClaimed ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> 100% Cashback Claimed (+{claimedAmount.toLocaleString()} Credits)
                  </span>
                ) : (
                  <span>Har 1 credit jo aap spend karenge, yahan 100% add hota jaayega</span>
                )}
              </p>
            </div>

            {/* Action / Claim Button */}
            <div className="pt-3">
              {!user ? (
                <Button
                  onClick={() => openLoginModal?.()}
                  className="w-full h-12 rounded-xl font-black text-xs uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                >
                  Sign In to Collect Cashback
                </Button>
              ) : isClaimed ? (
                <Button
                  disabled
                  className="w-full h-12 rounded-xl font-black text-xs uppercase tracking-widest bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 gap-2 cursor-default"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Already Claimed ({claimedAmount.toLocaleString()} Credits Added)
                </Button>
              ) : currentPhase === 'claim_unlocked' ? (
                <Button
                  onClick={handleClaim}
                  disabled={isClaiming || accumulatedCredits <= 0}
                  className="w-full h-12 rounded-xl font-black text-xs uppercase tracking-widest gap-2 bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 text-white hover:opacity-95 shadow-lg active:scale-98 transition-all animate-pulse"
                >
                  {isClaiming ? (
                    <span>Processing Claim...</span>
                  ) : (
                    <>
                      <Gift className="h-4 w-4" />
                      Claim {accumulatedCredits.toLocaleString()} Credits (100% Cashback)
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  disabled
                  variant="outline"
                  className="w-full h-12 rounded-xl font-black text-xs uppercase tracking-widest gap-2 border-border text-muted-foreground bg-muted/30 cursor-not-allowed"
                >
                  <Lock className="h-4 w-4 text-amber-500" />
                  <span>Claim Unlocks on 16 Aug, 12:00 AM IST</span>
                </Button>
              )}
            </div>
          </div>

          {/* 3. ACTIVITY / SPEND HISTORY */}
          {user && (liveUserData?.history?.length || 0) > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center justify-between w-full text-xs font-black uppercase tracking-wider text-foreground hover:text-primary transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-primary" />
                  Cashback Earning Activity ({liveUserData?.history?.length || 0} events)
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">
                  {showHistory ? 'Hide' : 'Show Details'}
                </span>
              </button>

              {showHistory && (
                <div className="p-3 rounded-xl bg-muted/20 border border-border max-h-[160px] overflow-y-auto custom-scrollbar space-y-2">
                  {liveUserData?.history.map((item, idx) => (
                    <div key={item.id || idx} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-background border border-border/50">
                      <div>
                        <p className="font-bold text-foreground truncate max-w-[200px] sm:max-w-[280px]">
                          {item.reason || 'Credit Usage'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.timestamp ? new Date(item.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : item.istDate}
                        </p>
                      </div>
                      <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-black text-[10px]">
                        +{item.amount?.toLocaleString()} 💎
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. RULES & TERMS GUIDE */}
          <div className="p-5 rounded-2xl border border-border bg-muted/20 space-y-3.5">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-black uppercase tracking-wider text-foreground">
                How It Works & Official Rules
              </span>
            </div>

            <ol className="space-y-2.5 text-xs text-muted-foreground font-medium list-decimal list-inside pl-1 leading-relaxed">
              <li>
                <strong>Spend Period (14 & 15 August)</strong>: 14 August 00:00 IST se lekar 15 August 23:59:59 IST (raat 12 baje) tak aap jitne bhi credits use karenge (Studio, Voices, Script, etc.), wo pure count honge.
              </li>
              <li>
                <strong>100% Refund</strong>: Jitne credits spend honge, exact 100% amount aapke Cashback Pool me jama ho jayega.
              </li>
              <li>
                <strong>Claim Timing (16 August 12:00 AM IST)</strong>: Cashback Claim karne ka button <strong>16 August ko raat 12:00 AM IST (Midnight)</strong> ko unlock hoga.
              </li>
              <li>
                <strong>3 Din Ki Validity</strong>: Unlocked hone ke baad aapke paas <strong>3 din (19 August 12:00 AM IST tak)</strong> ka time hoga cashback claim karne ke liye.
              </li>
              <li>
                <strong>Tamper-Proof & Anti-Cheat</strong>: Ye offer pure tareeqe se <strong>Server-Side Timestamps</strong> par chalta hai, isliye computer ya mobile ka date/time badalne se iska claim bypass nahi ho sakta.
              </li>
            </ol>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
