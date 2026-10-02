'use client';

import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TicketArt } from '@/components/store/store-ticket';

/**
 * "Current Store Tickets" pill for the Buy Credits header, same shape as the
 * credit-balance pill above it. The circular (i) button explains what a
 * ticket does, in place, without leaving the page.
 */
export function TicketBalance({ tickets = 0, used = 0, saved = 0 }: { tickets?: number; used?: number; saved?: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
    <div className="inline-flex items-center gap-2.5 rounded-full border border-purple-500/30 bg-purple-500/10 py-2 pl-5 pr-2.5 shadow-sm">
      <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Current Store Tickets:</span>
      <TicketArt className="w-10" />
      <span className="text-sm font-black tracking-tight text-purple-700 dark:text-purple-300">×{tickets}</span>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="What is a Store Ticket?"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/20 text-purple-700 transition-transform active:scale-90 dark:text-purple-300"
          >
            <Info className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 rounded-2xl p-4 text-sm" align="center">
          <p className="font-black">What is a Store Ticket?</p>
          <p className="mt-1 text-muted-foreground">
            1 ticket = 1 item from any <b className="text-foreground">Verified Partner</b> in the Store — free, whatever the price.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs font-semibold text-muted-foreground">
            <li>Pro — 1 ticket</li>
            <li>Business — 2 tickets</li>
            <li>Enterprise — 3 tickets</li>
            <li>Consistent Creator — Week 1 + Week 3</li>
          </ul>
          {used > 0 && (
            <p className="mt-3 rounded-full bg-emerald-500/10 px-3 py-1 text-center text-xs font-black text-emerald-700 dark:text-emerald-400">
              You've saved ₹{Math.round(saved).toLocaleString('en-IN')} with {used} ticket{used > 1 ? 's' : ''}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
      <p className="max-w-xs text-center text-[11px] font-semibold leading-snug text-muted-foreground">
        1 Store Ticket = 1 free item from any <b className="text-foreground">Verified Partner</b>, whatever the price
      </p>
    </div>
  );
}
