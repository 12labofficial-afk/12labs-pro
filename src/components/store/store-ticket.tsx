'use client';

import { Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TICKET_IMAGE_URL } from '@/lib/tickets';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * The ticket itself. Uses TICKET_IMAGE_URL when set; otherwise draws a
 * gold admission-style ticket (notched sides, perforation, stub).
 */
export function TicketArt({ className, label = 'STORE TICKET' }: { className?: string; label?: string }) {
  if (TICKET_IMAGE_URL) {
    return <img src={TICKET_IMAGE_URL} alt="Store ticket" className={cn('block h-auto w-full select-none object-contain', className)} draggable={false} />;
  }
  return (
    <div
      className={cn(
        'relative flex aspect-[2.2/1] w-full select-none overflow-hidden rounded-xl bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-500 text-amber-950 shadow-lg shadow-amber-500/30',
        className,
      )}
      aria-label="Store ticket"
    >
      <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background" />
      <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background" />
      <div className="flex flex-1 flex-col justify-center pl-4 pr-2">
        <span className="text-[0.55em] font-black uppercase tracking-[0.25em] opacity-70">12Labs</span>
        <span className="text-[1em] font-black uppercase leading-none tracking-tight">{label}</span>
      </div>
      <div className="flex w-[28%] items-center justify-center border-l-2 border-dashed border-amber-950/30">
        <Ticket className="h-[45%] w-[45%] -rotate-12" />
      </div>
    </div>
  );
}

/** Small inline ticket chip used inside price pills. */
export function TicketChip({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-amber-400 to-orange-500 py-0.5 pl-0.5 pr-1.5 text-[10px] font-black uppercase text-amber-950 shadow', className)}>
      <TicketArt className="w-6 text-[4px]" />
      Ticket
    </span>
  );
}

/**
 * Price pill for a ticket-eligible item: the normal price struck through,
 * then FREE with the ticket chip. Same shape as the featured price pill.
 */
export function TicketPricePill({ price, size = 'sm', className }: { price: number; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl bg-white font-black text-black shadow-lg',
        size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <span className={cn('font-medium text-black/50 line-through', size === 'md' ? 'text-xs' : 'text-[10px]')}>₹{price}</span>
      <span className="text-emerald-600">FREE</span>
      <TicketChip />
    </span>
  );
}

/** "Can this viewer use a ticket on this item?" */
export function canUseTicket(opts: { tickets?: number; sellerVerified?: boolean; price: number; owned?: boolean; sold?: boolean }) {
  return (opts.tickets || 0) > 0 && !!opts.sellerVerified && opts.price > 0 && !opts.owned && !opts.sold;
}

/**
 * "Use 1 ticket on this item?" — a ticket can't be given back, so every
 * redeem button asks first instead of spending it on a stray tap.
 */
export function TicketConfirmDialog({
  open,
  onOpenChange,
  itemTitle,
  price,
  ticketsLeft,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemTitle: string;
  price: number;
  ticketsLeft: number;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm rounded-3xl">
        <AlertDialogHeader>
          <div className="mx-auto mb-1 w-28"><TicketArt className="text-[8px]" /></div>
          <AlertDialogTitle className="text-center">Use 1 Store Ticket?</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            <span className="font-semibold text-foreground">{itemTitle}</span> will be added to your purchases for free
            (you save ₹{price}). You'll have {Math.max(0, ticketsLeft - 1)} ticket{ticketsLeft - 1 === 1 ? '' : 's'} left.
            A used ticket can't be returned.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-500 font-bold text-white hover:brightness-105">
            Yes, use ticket
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
