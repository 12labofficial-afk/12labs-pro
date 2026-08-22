import { getISTDateString } from './utils';

export const INDEPENDENCE_OFFER_CONFIG = {
  OFFER_TITLE: '100% Independence Day Cashback',
  TAGLINE: '14 & 15 August Special Offer',
  // 14 August 2026 00:00:00 IST
  EARNING_START_ISO: '2026-08-14T00:00:00+05:30',
  // 15 August 2026 23:59:59 IST (Raat 12:00 baje tak)
  EARNING_END_ISO: '2026-08-15T23:59:59.999+05:30',
  // 16 August 2026 12:00:00 AM IST (Unlock time)
  CLAIM_START_ISO: '2026-08-16T00:00:00+05:30',
  // 19 August 2026 12:00:00 AM IST (Valid for 3 days)
  CLAIM_END_ISO: '2026-08-19T00:00:00+05:30',
  
  RTDB_PATH: 'independence_cashback_2026/users',
  FIRESTORE_COLLECTION: 'independenceCashback2026',
};

export const EARNING_START_MS = new Date(INDEPENDENCE_OFFER_CONFIG.EARNING_START_ISO).getTime();
export const EARNING_END_MS = new Date(INDEPENDENCE_OFFER_CONFIG.EARNING_END_ISO).getTime();
export const CLAIM_START_MS = new Date(INDEPENDENCE_OFFER_CONFIG.CLAIM_START_ISO).getTime();
export const CLAIM_END_MS = new Date(INDEPENDENCE_OFFER_CONFIG.CLAIM_END_ISO).getTime();

export type OfferPhase = 'upcoming' | 'earning_active' | 'claim_locked' | 'claim_unlocked' | 'expired';

export function getOfferPhase(serverNowMs: number = Date.now()): OfferPhase {
  if (serverNowMs < EARNING_START_MS) return 'upcoming';
  if (serverNowMs >= EARNING_START_MS && serverNowMs <= EARNING_END_MS) return 'earning_active';
  if (serverNowMs > EARNING_END_MS && serverNowMs < CLAIM_START_MS) return 'claim_locked';
  if (serverNowMs >= CLAIM_START_MS && serverNowMs <= CLAIM_END_MS) return 'claim_unlocked';
  return 'expired';
}

export function shouldShowOfferUI(
  serverNowMs: number = Date.now(), 
  userAccumulatedCredits: number = 0,
  isClaimed: boolean = false
): boolean {
  // If user has already claimed their cashback, hide the offer completely
  if (isClaimed) {
    return false;
  }
  // During upcoming or earning phase (up to 15 August 23:59:59 IST), show to everyone so they can earn
  if (serverNowMs <= EARNING_END_MS) {
    return true;
  }
  // Starting 16 August (Claim period), ONLY show to users who have accumulated cashback > 0 to claim
  return userAccumulatedCredits > 0;
}

