import type { StoreProduct, SellerProfile } from '@/lib/types';

/**
 * Store feed ranking. Score = how good the listing is × how relevant it is
 * to this viewer, then a diversity pass so one seller can't fill the top of
 * the feed.
 *
 * Signals
 * - Engagement: likes and views on a log scale (one viral item can't bury
 *   everything), plus like-rate smoothed with a prior so 1 like / 2 views
 *   doesn't beat 80 likes / 400 views.
 * - Freshness: exponential decay (half-life 10 days) and a launch boost for
 *   the first 48h so new listings get seen at all.
 * - Seller trust: verified badge, subscriber count (log).
 * - Deal: a real discount (originalPrice > price) gets a small nudge.
 * - Personal: sellers you subscribe to, and categories you buy/browse.
 * - Rotation: a per-viewer jitter that re-rolls every 4 hours — the order
 *   keeps changing (so the long tail gets exposure) but not on every reload.
 */

export interface RankingContext {
  sellers?: Record<string, SellerProfile | undefined>;
  followedSellerIds?: Set<string>;
  /** productType -> weight in [0, 1] (share of the viewer's interest). */
  categoryAffinity?: Record<string, number>;
  /** Stable per viewer (uid or 'anon'); seeds the daily rotation. */
  viewerKey?: string;
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ROTATION_SLOT_MS = 4 * 60 * 60 * 1000;
const FRESHNESS_HALF_LIFE_DAYS = 10;
const LIKE_RATE_PRIOR_LIKES = 2;
const LIKE_RATE_PRIOR_VIEWS = 40;

function hashToUnit(s: string): number {
  // FNV-1a -> [0, 1)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function scoreProduct(p: StoreProduct, ctx: RankingContext = {}): number {
  const now = ctx.now ?? Date.now();
  const likes = Math.max(0, Number((p as any).likes) || 0);
  const views = Math.max(0, Number((p as any).views) || 0);
  const created = p.createdAt ? new Date(p.createdAt as any).getTime() : now;
  const ageDays = Number.isFinite(created) ? Math.max(0, (now - created) / DAY_MS) : 30;

  // Engagement (0 .. ~10)
  const engagement = Math.log1p(likes) * 2 + Math.log1p(views) * 0.8;
  const likeRate = (likes + LIKE_RATE_PRIOR_LIKES) / (views + LIKE_RATE_PRIOR_VIEWS); // ~0.05 baseline
  const quality = engagement + Math.min(likeRate, 0.5) * 12;

  // Freshness (0 .. 10) + launch boost
  const freshness = 10 * Math.pow(0.5, ageDays / FRESHNESS_HALF_LIFE_DAYS);
  const launchBoost = ageDays < 2 ? 4 : 0;

  // Seller trust
  const seller = ctx.sellers?.[p.sellerId];
  const verified = (p as any).sellerIsVerified || seller?.isVerified ? 3 : 0;
  const sellerReach = Math.log1p(Number(seller?.followerCount) || 0) * 0.8;

  // Deal
  const original = Number((p as any).originalPrice) || 0;
  const price = Number(p.price) || 0;
  const deal = original > price && original > 0 ? Math.min(3, ((original - price) / original) * 6) : 0;

  const base = quality + freshness + launchBoost + verified + sellerReach + deal;

  // Personalisation multipliers
  let personal = 1;
  if (ctx.followedSellerIds?.has(p.sellerId)) personal *= 1.35;
  const affinity = ctx.categoryAffinity?.[p.productType as string] || 0;
  personal *= 1 + affinity * 0.5;

  // Rotation (±15%), re-rolled every ROTATION_SLOT_MS
  const slot = Math.floor(now / ROTATION_SLOT_MS);
  const jitter = 0.85 + hashToUnit(`${ctx.viewerKey || 'anon'}:${slot}:${p.id}`) * 0.3;

  return base * personal * jitter;
}

/**
 * Greedy re-rank: walk the score-sorted list and, when the next item is from
 * a seller who already appears in the last `window` slots, prefer the best
 * item from a different seller (if one is close enough in score).
 */
function diversify<T extends { item: StoreProduct; score: number }>(sorted: T[], window = 3, tolerance = 0.6): T[] {
  const pool = [...sorted];
  const out: T[] = [];
  while (pool.length) {
    const recent = new Set(out.slice(-window).map((e) => e.item.sellerId));
    let pick = 0;
    if (recent.has(pool[0].item.sellerId)) {
      const alt = pool.findIndex((e) => !recent.has(e.item.sellerId) && e.score >= pool[0].score * tolerance);
      if (alt > 0) pick = alt;
    }
    out.push(pool.splice(pick, 1)[0]);
  }
  return out;
}

export function rankStoreProducts(items: StoreProduct[], ctx: RankingContext = {}): StoreProduct[] {
  const scored = items.map((item) => ({ item, score: scoreProduct(item, ctx) }));
  scored.sort((a, b) => b.score - a.score);
  return diversify(scored).map((s) => s.item);
}

// ---- Featured (hero) picks ----

const HERO_SEEN_KEY = 'store_hero_seen';
const HERO_SEEN_TTL_MS = 2 * DAY_MS;

type SeenMap = Record<string, { n: number; t: number }>;

function readHeroSeen(now: number): SeenMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw: SeenMap = JSON.parse(localStorage.getItem(HERO_SEEN_KEY) || '{}');
    const out: SeenMap = {};
    for (const [id, v] of Object.entries(raw)) if (v && now - v.t < HERO_SEEN_TTL_MS) out[id] = v;
    return out;
  } catch {
    return {};
  }
}

/** Call once the hero has been shown, so the next visit leans to items this viewer hasn't seen. */
export function recordHeroImpressions(ids: string[], now = Date.now()): void {
  if (typeof window === 'undefined' || ids.length === 0) return;
  try {
    const seen = readHeroSeen(now);
    for (const id of ids) seen[id] = { n: (seen[id]?.n || 0) + 1, t: now };
    localStorage.setItem(HERO_SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage blocked — hero still rotates via the seed */
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks the hero slides from an already-ranked list. Changes on every visit
 * but stays quality-weighted:
 * - Pool = the top ~40% of the ranking (at least 4× the slot count), so a
 *   weak listing never lands in the hero.
 * - Weighted random draw (Efraimidis–Spirakis): higher rank = more likely,
 *   never certain. Fresh listings (<3 days) and real discounts get a lift.
 * - Items this viewer already saw in the hero lose weight each time
 *   (×0.5 per view, forgotten after 2 days), so repeat visits show new ones.
 * - Owned items are skipped; one slide per seller and at most two per
 *   category, relaxed only when the catalogue is too small.
 */
export function pickFeatured(
  ranked: StoreProduct[],
  opts: { count?: number; seed?: number; excludeIds?: Set<string>; now?: number } = {},
): StoreProduct[] {
  const count = opts.count ?? 5;
  const now = opts.now ?? Date.now();
  const rand = mulberry32(opts.seed ?? Math.floor(Math.random() * 2 ** 32));
  const seen = readHeroSeen(now);

  const eligible = ranked.filter(
    (p) => !opts.excludeIds?.has(p.id) && (p.previewImage || p.previews?.[0]?.url),
  );
  const source = eligible.length >= count ? eligible : ranked;
  const pool = source.slice(0, Math.max(count * 4, Math.ceil(source.length * 0.4)));

  const drawn = pool
    .map((p, rank) => {
      let w = 1 / (rank + 4);
      const created = p.createdAt ? new Date(p.createdAt as any).getTime() : 0;
      if (created && now - created < 3 * DAY_MS) w *= 1.6;
      const original = Number((p as any).originalPrice) || 0;
      if (original > (Number(p.price) || 0)) w *= 1.15;
      w *= Math.pow(0.5, seen[p.id]?.n || 0);
      return { p, key: Math.pow(rand(), 1 / w) };
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.p);

  const out: StoreProduct[] = [];
  const take = (strict: boolean) => {
    for (const p of drawn) {
      if (out.length >= count) return;
      if (out.includes(p)) continue;
      if (strict) {
        if (out.some((o) => o.sellerId === p.sellerId)) continue;
        if (out.filter((o) => o.productType === p.productType).length >= 2) continue;
      }
      out.push(p);
    }
  };
  take(true);
  take(false);
  return out;
}

// ---- Viewer interest (browser-side, per device) ----

const RECENT_TYPES_KEY = 'store_recent_types';

/** Call when a product page is opened. Keeps the last 30 categories viewed. */
export function recordProductView(productType?: string): void {
  if (!productType || typeof window === 'undefined') return;
  try {
    const list: string[] = JSON.parse(localStorage.getItem(RECENT_TYPES_KEY) || '[]');
    list.push(productType);
    localStorage.setItem(RECENT_TYPES_KEY, JSON.stringify(list.slice(-30)));
  } catch {
    /* storage blocked — personalisation just stays neutral */
  }
}

/** Purchases count 3× a view. Returns shares in [0, 1] per productType. */
export function buildCategoryAffinity(purchasedTypes: string[]): Record<string, number> {
  let viewed: string[] = [];
  if (typeof window !== 'undefined') {
    try {
      viewed = JSON.parse(localStorage.getItem(RECENT_TYPES_KEY) || '[]');
    } catch {
      viewed = [];
    }
  }
  const counts: Record<string, number> = {};
  for (const t of viewed) counts[t] = (counts[t] || 0) + 1;
  for (const t of purchasedTypes) counts[t] = (counts[t] || 0) + 3;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return {};
  const out: Record<string, number> = {};
  for (const [t, c] of Object.entries(counts)) out[t] = c / total;
  return out;
}
