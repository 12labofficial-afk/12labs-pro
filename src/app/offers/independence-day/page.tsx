'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/header';
import { Footer } from '@/components/landing/footer';
import { IndependenceCashbackDialog } from '@/components/offers/independence-cashback-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Gift, 
  Sparkles, 
  Clock, 
  ShieldCheck, 
  Zap, 
  ArrowRight, 
  CheckCircle2, 
  Mic, 
  Music, 
  FilePenLine, 
  Sparkle,
  ShoppingBag,
  Layers,
  Flame,
  Info,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { INDEPENDENCE_OFFER_CONFIG, EARNING_END_MS } from '@/lib/independence-offer';

export default function IndependenceOfferPage() {
  const { user } = useAuth();
  const [accumulatedCredits, setAccumulatedCredits] = useState<number>(0);
  const [isClaimed, setIsClaimed] = useState<boolean>(false);
  const [hasChecked, setHasChecked] = useState(false);
  const isPost15th = Date.now() > EARNING_END_MS;

  useEffect(() => {
    if (!user?.uid) {
      setAccumulatedCredits(0);
      setIsClaimed(false);
      setHasChecked(true);
      return;
    }
    try {
      const { database } = initializeFirebase();
      if (!database) {
        setHasChecked(true);
        return;
      }
      const offerRef = ref(database, `${INDEPENDENCE_OFFER_CONFIG.RTDB_PATH}/${user.uid}`);
      const unsubscribe = onValue(offerRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          setAccumulatedCredits(Number(val?.accumulatedCredits || 0));
          setIsClaimed(Boolean(val?.claimed));
        } else {
          setAccumulatedCredits(0);
          setIsClaimed(false);
        }
        setHasChecked(true);
      });
      return () => unsubscribe();
    } catch (e) {
      setHasChecked(true);
    }
  }, [user?.uid]);

  const showZeroCreditsNotice = isPost15th && hasChecked && accumulatedCredits <= 0;

  return (
    <div className="flex flex-col min-h-screen text-foreground bg-background selection:bg-amber-500/20">
      <Header />

      {/* Tricolor Independence Celebration Top Glow */}
      <div className="relative w-full overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 flex z-30">
          <div className="flex-1 bg-[#FF9933]" />
          <div className="flex-1 bg-white" />
          <div className="flex-1 bg-[#138808]" />
        </div>

        {/* Ambient Glows */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24 relative z-10">
          {/* Hero Section */}
          <div className="text-center space-y-5 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-black uppercase tracking-widest animate-pulse">
              <span>🇮🇳</span>
              <span>15 August Independence Day Mahabachat</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black tracking-tight uppercase leading-tight">
              100% Credit <br />
              <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-600 bg-clip-text text-transparent">
                Cashback Festival
              </span>
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground font-medium leading-relaxed">
              {isPost15th
                ? 'Independence Day cashback claim window is active. Eligible users can claim their full 100% cashback below.'
                : 'Jitne bhi credits aap 14 & 15 August ko use karenge, pure ke pure 100% credits aapke account me 16 August ko 12:00 AM par vapas milenge!'}
            </p>

            {/* Main Interactive Cashback Dashboard & Claim Trigger */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              {isClaimed ? (
                <div className="w-full max-w-lg p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-center space-y-3 shadow-xs">
                  <div className="inline-flex p-3 rounded-full bg-emerald-500/20 text-emerald-500 mb-1">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-black uppercase tracking-tight text-emerald-600 dark:text-emerald-400">Cashback Already Claimed</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Aapka 100% Independence Day Cashback successfully claim ho chuka hai aur credits aapke wallet balance me add kar diye gaye hain.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <Button size="sm" variant="default" asChild className="rounded-xl font-bold">
                      <Link href="/studio">Open Studio</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild className="rounded-xl font-bold">
                      <Link href="/">Back to Home</Link>
                    </Button>
                  </div>
                </div>
              ) : showZeroCreditsNotice ? (
                <div className="w-full max-w-lg p-5 rounded-2xl border border-muted bg-card/70 text-center space-y-3 shadow-xs">
                  <div className="inline-flex p-3 rounded-full bg-amber-500/10 text-amber-500 mb-1">
                    <Info className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-black uppercase tracking-tight">Offer Period Concluded</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    14-15 August cashback earning window has ended. Only users who used credits during 14-15 August have claimable cashback.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <Button size="sm" variant="default" asChild className="rounded-xl font-bold">
                      <Link href="/studio">Open Studio</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild className="rounded-xl font-bold">
                      <Link href="/">Back to Home</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <IndependenceCashbackDialog triggerVariant="banner" className="max-w-xl w-full" />
              )}
            </div>
          </div>

          {/* Key Timeline Steps (3 Steps) */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <Card className="rounded-3xl border-border bg-card/60 backdrop-blur-md relative overflow-hidden shadow-sm hover:border-amber-500/40 transition-all">
              <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 font-black text-xs">
                    STEP 1
                  </Badge>
                  <Clock className="h-4 w-4 text-amber-500" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  14 & 15 August (Spend)
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Studio, Scripts, Voice Cloning ya Music tools par khul kar credits spend karein. Har 1 spend hua credit live track hoga.
                </p>
              </CardContent>
            </Card>

            {/* Step 2 */}
            <Card className="rounded-3xl border-border bg-card/60 backdrop-blur-md relative overflow-hidden shadow-sm hover:border-orange-500/40 transition-all">
              <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500" />
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30 font-black text-xs">
                    STEP 2
                  </Badge>
                  <Gift className="h-4 w-4 text-orange-500" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  16 Aug @ 12:00 AM (Unlock)
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  16 August raat 12:00 AM (Midnight) baje exact Cashback Claim button unlock ho jayega. Live countdown timer active hai.
                </p>
              </CardContent>
            </Card>

            {/* Step 3 */}
            <Card className="rounded-3xl border-border bg-card/60 backdrop-blur-md relative overflow-hidden shadow-sm hover:border-emerald-500/40 transition-all">
              <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-black text-xs">
                    STEP 3
                  </Badge>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  3 Din Tak Claim Valid
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  19 August 12:00 AM tak aap 1-click me pura 100% credit cashback apne wallet balance me add kar sakte hain.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Eligible Tools Banner Grid */}
          <div className="mt-16 space-y-6">
            <div className="text-center space-y-1.5">
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
                Where Can You Spend & Earn Cashback?
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                All 12Labs creator studios are 100% eligible for this Independence Day offer.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { title: 'Voice Studio', icon: Mic, path: '/studio', color: 'text-blue-500' },
                { title: 'Pro Studio', icon: Sparkles, path: '/pro-studio', color: 'text-amber-500' },
                { title: 'New AI Studio', icon: Zap, path: '/new-ai-studio', color: 'text-indigo-500' },
                { title: 'Script Studio', icon: FilePenLine, path: '/script-generator', color: 'text-orange-500' },
                { title: 'Music Studio', icon: Music, path: '/music-studio', color: 'text-pink-500' },
                { title: 'Store Assets', icon: ShoppingBag, path: '/store', color: 'text-emerald-500' },
              ].map((item, idx) => (
                <Link key={idx} href={item.path} className="group">
                  <div className="p-4 rounded-2xl border border-border bg-card/50 hover:bg-card hover:border-primary/40 transition-all flex flex-col items-center text-center space-y-2 group-hover:scale-105">
                    <item.icon className={`h-6 w-6 ${item.color}`} />
                    <span className="text-xs font-bold text-foreground">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground group-hover:text-primary font-bold">Launch &rarr;</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Anti-Tamper Security Assurance */}
          <div className="mt-16 p-6 sm:p-8 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 flex flex-col sm:flex-row items-center gap-6">
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 shrink-0">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="space-y-1.5 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h3 className="text-lg font-black uppercase tracking-tight text-foreground">
                  100% Server-Synced & Secure Protection
                </h3>
                <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-none text-[9px] font-bold">
                  TAMPER-PROOF
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                All offer timings, spend tracking, and claim unlock signals are strictly verified via atomic Indian Standard Time (IST) server timestamps.
              </p>
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
