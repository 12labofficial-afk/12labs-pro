import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

/**
 * 💳 PER-CHARACTER ENGINE RATE — single source of truth
 * --------------------------------------------------------
 * Both the website's HQ Studio (src/app/studio/actions.ts) and the public
 * API (src/app/api/v1/generate) charge through this SAME function, reading
 * the SAME RTDB path (`settings/pricing`) the admin pricing dashboard
 * writes to. There is deliberately no separate "API price" — whatever an
 * admin sets on the website is exactly what the API charges too, and a
 * rate change there takes effect on both surfaces at once, from the same
 * place, with no redeploy.
 */
export async function getEngineRate(
  engine: 'gemini' | 'elevenlabs'
): Promise<number> {
  const FALLBACK = { gemini: 1.2, elevenlabs: 2.5 } as const;
  try {
    const { database } = initializeFirebase();
    const snap = await database.ref('settings/pricing').get();
    const v = snap.val() || {};
    const key = engine === 'elevenlabs' ? 'elevenLabsNormal' : 'studioNormal';
    const rate = Number(v[key]);
    return Number.isFinite(rate) && rate > 0 ? rate : FALLBACK[engine];
  } catch (e) {
        reportServerError('src/lib/pricing.ts:25', e);
    // Never block a paid action on a settings read; fall back to the
    // documented default rather than charging 0.
    return FALLBACK[engine];
  }
}

/**
 * 💳 MUSIC GENERATION — flat fee, same settings/pricing RTDB node
 * (musicNormal/musicDiscounted keys), same isSponsor discount tier
 * src/app/thumbnail-generator/actions.ts already uses for its own flat
 * fee. Kept here (not billed from this Server Action — see
 * src/app/music-studio/actions.ts, now pure submission) purely for the
 * client-side "Not Enough Credits" estimate; server-files/
 * music_generation.py's Python get_music_cost() is the actual charge.
 */
export async function getMusicCost(isSponsor: boolean): Promise<number> {
  const FALLBACK = { normal: 2000, discounted: 1600 } as const;
  try {
    const { database } = initializeFirebase();
    const snap = await database.ref('settings/pricing').get();
    const v = snap.val() || {};
    const normal = Number(v.musicNormal);
    const discounted = Number(v.musicDiscounted);
    const validNormal = Number.isFinite(normal) && normal > 0 ? normal : FALLBACK.normal;
    const validDiscounted = Number.isFinite(discounted) && discounted > 0 ? discounted : FALLBACK.discounted;
    return isSponsor ? validDiscounted : validNormal;
  } catch (e) {
        reportServerError('src/lib/pricing.ts:getMusicCost', e);
    return isSponsor ? FALLBACK.discounted : FALLBACK.normal;
  }
}
