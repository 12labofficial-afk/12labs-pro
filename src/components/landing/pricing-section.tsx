'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { CheckCircle, Sparkles, Coins, ShieldCheck, MoveRight, Youtube, Zap, CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { plans, type Plan } from '@/lib/plans';
import { motion } from 'framer-motion';
import { TicketArt } from '@/components/store/store-ticket';

export function PricingSection() {
  const displayPlans = plans.filter((p) => !p.isTest);
  const railRef = useRef<HTMLDivElement>(null);
  // Tracks whether the rail has room left to scroll — the "Swipe to
  // compare" hint only makes sense while there's another card to reach.
  // Without this it kept telling people to swipe even after they'd
  // already swiped all the way to the last card.
  const [hasMoreToSwipe, setHasMoreToSwipe] = useState(true);

  const updateSwipeHint = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setHasMoreToSwipe(remaining > 12);
  }, []);

  useEffect(() => {
    updateSwipeHint();
    window.addEventListener('resize', updateSwipeHint);
    return () => window.removeEventListener('resize', updateSwipeHint);
  }, [updateSwipeHint, displayPlans.length]);

  return (
    <section id="pricing" className="w-full py-16 md:py-24 bg-background relative overflow-hidden border-t border-border/50">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-indigo-500/10 blur-[100px] pointer-events-none -z-10" />

      <div className="container px-4 md:px-6 mx-auto">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '300px 0px -5% 0px' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest"
          >
            <Coins className="w-3.5 h-3.5" /> Transparent Credit Pricing
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '300px 0px -5% 0px' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.05 }}
            className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-foreground font-headline"
          >
            Choose Your <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">Credit Pack</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '300px 0px -5% 0px' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
            className="max-w-[650px] mx-auto text-muted-foreground text-base sm:text-lg font-medium"
          >
            Fuel your creative AI studio with instant credits. No hidden fees, automated delivery.
          </motion.p>

          {/* Credit validity. Stated plainly and up front rather than
              buried in terms — the only condition is a full year of
              total inactivity, which almost nobody will hit. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '300px 0px -5% 0px' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.18 }}
            className="inline-flex items-start gap-2.5 max-w-[620px] mx-auto text-left px-4 py-2.5 rounded-2xl bg-primary/5 border border-primary/15"
          >
            <CalendarCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-muted-foreground font-medium leading-relaxed">
              <span className="text-foreground font-semibold">One-time credit pack purchases don&apos;t expire.</span>{' '}
              They stay in your account for as long as you keep using 12Labs. The weekly
              Consistent Creator plan below is different — its credits follow a 30-day cycle,
              as shown on that card.
            </p>
          </motion.div>
        </div>

        {/* Pricing cards — a horizontal snap rail, not a vertical grid.
            Stacked full-height cards were the single longest stretch of
            the landing page; side-scrolling keeps every plan one swipe
            apart instead of three screens apart. The negative margin lets
            cards run to the screen edge so it reads as scrollable. */}
        <div className="relative -mx-4 md:mx-0">
          <div
            ref={railRef}
            onScroll={updateSwipeHint}
            className={cn(
            "flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth items-stretch",
            "px-4 md:px-0 pb-4",
            // Hide the scrollbar chrome; the peeking next card is the affordance.
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            // Centre the rail on wide screens where all plans fit anyway.
            "lg:justify-center"
          )}>
          {displayPlans.map((plan, index) => {
            const finalPrice = plan.priceInRupees;
            const isFeatured = plan.isAutopay || plan.id === 'creator' || plan.profitAmount;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '300px 0px -5% 0px' }}
                transition={{ type: 'spring', stiffness: 300, damping: 22, delay: index * 0.08 }}
                whileHover={{ y: -6 }}
                className="snap-center shrink-0 self-start w-[78vw] max-w-[310px] sm:w-[300px]"
              >
                <Card
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-[26px] border bg-white/90 shadow-[0_18px_50px_-30px_rgba(37,99,235,0.45)] backdrop-blur transition-all duration-500 group hover:shadow-[0_24px_60px_-28px_rgba(37,99,235,0.55)] dark:bg-zinc-900/70",
                    plan.isAutopay
                      ? "border-indigo-300/60 bg-gradient-to-b from-indigo-50 to-white dark:from-indigo-950/30 dark:to-zinc-900"
                      : plan.bestValue
                      ? "border-amber-300/70 ring-1 ring-amber-300/50"
                      : "border-black/[0.06] dark:border-white/10"
                  )}
                >
                  {/* Accent bar */}
                  <div aria-hidden className={cn("h-1 w-full", plan.isAutopay ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500" : plan.bestValue ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-primary to-indigo-500")} />

                  {(plan.bestValue || plan.isAutopay || plan.profitAmount) && (
                    <span className={cn(
                      "absolute right-3 top-4 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow",
                      plan.profitAmount ? "bg-emerald-600" : plan.isAutopay ? "bg-indigo-600" : "bg-gradient-to-r from-amber-500 to-orange-500"
                    )}>
                      {plan.profitAmount ? `₹${plan.profitAmount} profit` : plan.isAutopay ? 'Monthly' : 'Best value'}
                    </span>
                  )}

                  <CardHeader className="space-y-0 p-5 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", plan.isAutopay ? "bg-indigo-500/10 text-indigo-600" : "bg-primary/10 text-primary")}>
                        <plan.icon className="h-[18px] w-[18px]" />
                      </div>
                      <CardTitle className="text-base font-extrabold tracking-tight">{plan.name}</CardTitle>
                    </div>

                    <div className="mt-3 flex items-baseline gap-1">
                      <span className={cn("text-[34px] font-black leading-none tracking-tight", plan.isAutopay ? "text-indigo-600 dark:text-indigo-400" : "text-foreground")}>
                        ₹{finalPrice.toFixed(0)}
                      </span>
                      {plan.isAutopay && <span className="text-sm font-semibold text-muted-foreground">/month</span>}
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                      <ShieldCheck className="h-3 w-3 text-primary" /> All-inclusive price
                    </p>

                    <div className={cn(
                      "mt-3 flex items-center gap-2 rounded-2xl px-3 py-2",
                      plan.isAutopay ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "bg-primary/[0.07] text-primary"
                    )}>
                      <Coins className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-black tracking-tight">
                        {plan.weeklyCredits
                          ? `${plan.weeklyCredits.toLocaleString()} credits / week`
                          : plan.id === 'pro'
                          ? '30,000 + 1,000 bonus credits'
                          : `${plan.credits.toLocaleString()} credits`}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-grow px-5 pb-4 pt-1">
                    <ul className="space-y-2">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          {feature.includes('Store Ticket') ? (
                            <TicketArt className="mt-0.5 w-7 flex-shrink-0" />
                          ) : (
                            <CheckCircle className={cn("mt-0.5 h-4 w-4 flex-shrink-0", plan.isAutopay ? "text-indigo-500" : "text-emerald-500")} />
                          )}
                          <span
                            className={cn(
                              "text-[13px] font-medium leading-snug text-muted-foreground",
                              (feature.includes('Full commercial') || feature.includes('Voice editing') || feature.includes('Bonus')) && "font-bold text-indigo-600 dark:text-indigo-400",
                              feature.includes('Store Ticket') && "rounded-md bg-purple-500/10 px-1.5 py-0.5 font-bold text-purple-700 dark:text-purple-300",
                            )}
                          >
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="px-5 pb-5 pt-0">
                    <Button
                      asChild
                      className={cn(
                        "anim-studio-sheen h-11 w-full rounded-2xl text-sm font-bold shadow-lg transition-transform duration-200 active:scale-95",
                        plan.isAutopay
                          ? "bg-gradient-to-r from-indigo-600 to-fuchsia-500 text-white shadow-indigo-600/25"
                          : plan.bestValue
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/25"
                          : "bg-gradient-to-r from-primary to-indigo-500 text-white shadow-primary/25"
                      )}
                    >
                      <Link href="/buy-credits" prefetch={false}>
                        <span className="relative z-[2]">{plan.isAutopay ? 'Start membership' : 'Get credits'}</span>
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
          </div>

          {/* Swipe hint — only while there's actually another card left to
              reach. Once the rail is scrolled all the way to the last
              plan, showing this was actively wrong. */}
          {hasMoreToSwipe && (
            <p className="lg:hidden text-center text-[11px] font-semibold text-muted-foreground/70 tracking-wide mt-1">
              Swipe to compare plans
            </p>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '300px 0px -5% 0px' }}
          className="flex items-center justify-center gap-2 mt-12 text-xs font-extrabold text-primary tracking-widest uppercase"
        >
          <Sparkles className="h-4 w-4 text-amber-500 animate-spin" style={{ animationDuration: '4s' }} />
          <span>Get 2,000 Free Credits Instantly On Signup</span>
        </motion.div>
      </div>
    </section>
  );
}
