'use client';

import Link from 'next/link';
import { ArrowRight, BadgeCheck } from 'lucide-react';
import { TicketArt } from '@/components/store/store-ticket';

/**
 * Buy Credits page: how many Store Tickets the user holds, what they've
 * saved with them, and how tickets work. Shown to everyone signed in —
 * with 0 tickets it doubles as the explainer for the bigger packs.
 */
export function TicketWallet({ tickets = 0, used = 0, saved = 0 }: { tickets?: number; used?: number; saved?: number }) {
  return (
    <section className="mx-auto mb-10 max-w-3xl">
      <div className="relative overflow-hidden rounded-[2rem] border-2 border-amber-400/40 bg-gradient-to-br from-amber-50 via-background to-orange-50 p-5 shadow-sm dark:from-amber-500/10 dark:via-background dark:to-orange-500/5 sm:p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <div className="relative w-56 shrink-0 text-[15px]">
            <TicketArt />
            {tickets > 0 && (
              <span className="absolute -right-2 -top-2 flex h-9 min-w-9 items-center justify-center rounded-full bg-foreground px-2 text-sm font-black text-background shadow-lg">
                ×{tickets}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-black uppercase tracking-widest text-amber-600">Store Tickets</p>
            <p className="text-2xl font-black tracking-tight">
              {tickets > 0 ? `You have ${tickets} ticket${tickets > 1 ? 's' : ''}` : 'No tickets yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              1 ticket = 1 item from any <span className="inline-flex items-center gap-0.5 font-bold text-foreground"><BadgeCheck className="h-3.5 w-3.5 text-primary" />Verified Partner</span> — free, whatever the price.
            </p>
            {used > 0 && (
              <p className="mt-2 inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-400">
                You've saved ₹{Math.round(saved).toLocaleString('en-IN')} with {used} ticket{used > 1 ? 's' : ''}
              </p>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] font-bold sm:justify-start">
              <span className="rounded-full border bg-background px-2.5 py-1">Pro · 1 ticket</span>
              <span className="rounded-full border bg-background px-2.5 py-1">Business · 2 tickets</span>
              <span className="rounded-full border bg-background px-2.5 py-1">Enterprise · 3 tickets</span>
              <span className="rounded-full border bg-background px-2.5 py-1">Consistent Creator · Week 1 + Week 3</span>
            </div>
            {tickets > 0 && (
              <Link href="/store" prefetch={false} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 text-sm font-black text-amber-950 shadow-lg shadow-amber-500/30 transition-transform active:scale-95">
                Use in store <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
