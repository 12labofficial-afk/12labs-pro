import { plans } from '@/lib/plans';

/**
 * Store Tickets: bundled with the bigger credit packs. One ticket unlocks
 * ONE asset from a Verified Partner seller for free, whatever its price.
 * The seller is still paid in full (the platform covers it).
 */

/** Ticket art. Empty = the built-in CSS ticket is drawn instead. */
export const TICKET_IMAGE_URL = 'https://storage.12labs.in/Uploaded%20previews/twelve_labs_store_ticket.webp';

/** Tickets granted per plan purchase (plan.storeTickets). */
export function ticketsForPlan(planIdOrName?: string | null): number {
  if (!planIdOrName) return 0;
  const plan = plans.find((p) => p.id === planIdOrName || p.name === planIdOrName);
  return plan?.isAutopay ? 0 : plan?.storeTickets || 0;
}

/** Only Verified Partner listings can be bought with a ticket. */
export function isTicketEligible(sellerIsVerified?: boolean | null): boolean {
  return !!sellerIsVerified;
}

/** Tickets an autopay plan hands out with installment `week` (1-based). */
export function ticketsForWeek(planId: string | undefined | null, week: number): number {
  const plan = plans.find((p) => p.id === planId);
  return plan?.ticketWeeks?.filter((w) => w === week).length || 0;
}
