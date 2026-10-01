'use client';

import { useMemo, useRef } from 'react';
import Link from 'next/link';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronRight, Flame, Play, Sparkles, Tag, Users, Heart, Clapperboard, FileText, UserRound, ImageIcon } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { StoreProduct, SellerProfile } from '@/lib/types';
import { cn, generateAvatarColor, getDisplayUrl } from '@/lib/utils';
import { VerifiedBadge } from '@/components/verified-badge';

const FALLBACK_IMG = 'https://res.cloudinary.com/dptryoeis/image/upload/v1772590885/c10h0lknqblj7kfxp5qr.png';
const DAY_MS = 24 * 60 * 60 * 1000;

export const CATEGORY_LABELS: Record<string, string> = {
  'YouTube Story': 'Readymade Videos',
  'Hand Written Script': 'Scripts',
  'PC Character': 'Characters',
  'Premium Background': 'Backgrounds',
  'Real Voice': 'Real Voice',
};

/** Same pricing the main store card shows (verified-seller global discount or listed original price). */
export function priceInfo(product: StoreProduct, isVerified: boolean, globalDiscount: number) {
  const base = Number(product.price || 0);
  const orig = Number((product as any).originalPrice || 0);
  let effective = base;
  let original = orig > base ? orig : base;
  if (isVerified && globalDiscount > 0) {
    effective = Math.floor(base * (1 - globalDiscount / 100));
    original = base;
  }
  const discountPct = original > effective ? Math.round(((original - effective) / original) * 100) : 0;
  return { effective, original, discountPct };
}

function engagement(p: StoreProduct): number {
  return Math.log1p(Number((p as any).likes) || 0) * 2 + Math.log1p(Number((p as any).views) || 0);
}

function isNew(p: StoreProduct, now: number): boolean {
  const t = p.createdAt ? new Date(p.createdAt as any).getTime() : 0;
  return t > 0 && now - t < 2 * DAY_MS;
}

/** Top ~10% by engagement (at least one item if anyone has engagement). */
export function trendingIds(items: StoreProduct[]): Set<string> {
  const scored = items.map((p) => ({ id: p.id, e: engagement(p) })).filter((x) => x.e > 0).sort((a, b) => b.e - a.e);
  const n = Math.max(1, Math.ceil(scored.length * 0.1));
  return new Set(scored.slice(0, n).map((x) => x.id));
}

function CardBadges({ product, trending, discountPct, now }: { product: StoreProduct; trending: boolean; discountPct: number; now: number }) {
  return (
    <div className="absolute left-2 top-2 z-20 flex flex-wrap gap-1">
      {isNew(product, now) && <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black uppercase text-white shadow">New</span>}
      {trending && <span className="flex items-center gap-0.5 rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-black uppercase text-white shadow"><Flame className="h-3 w-3" />Trending</span>}
      {discountPct > 0 && <span className="rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow">{discountPct}% OFF</span>}
    </div>
  );
}

interface CommonProps {
  sellers: Record<string, SellerProfile>;
  globalDiscount: number;
  trending: Set<string>;
  onSelect: (id: string) => void;
}

function ShelfCard({ product, sellers, globalDiscount, trending, onSelect }: CommonProps & { product: StoreProduct }) {
  const seller = sellers[product.sellerId];
  const isVerified = !!seller?.isVerified;
  const { effective, original, discountPct } = priceInfo(product, isVerified, globalDiscount);
  const now = Date.now();
  const isStory = product.productType === 'YouTube Story';
  return (
    <button
      type="button"
      onClick={() => onSelect(product.id)}
      className="group w-[68vw] max-w-[300px] shrink-0 snap-start text-left sm:w-[280px]"
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted/40 shadow-sm transition-shadow group-hover:shadow-lg">
        <img
          src={getDisplayUrl(product.previewImage || product.previews?.[0]?.url) || FALLBACK_IMG}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 disable-long-press-download"
        />
        <CardBadges product={product} trending={trending.has(product.id)} discountPct={discountPct} now={now} />
        {isStory && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/40 p-2.5 backdrop-blur-sm"><Play className="h-5 w-5 fill-white text-white" /></span>
          </span>
        )}
        <span className="absolute bottom-2 right-2 flex items-center gap-1">
          {original > effective && <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80 line-through">₹{original}</span>}
          <span className="rounded-lg bg-primary px-2 py-1 text-xs font-black text-white shadow">₹{effective}</span>
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-bold leading-snug">{product.title}</p>
      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
        {seller?.storeName || product.sellerName}
        {isVerified && <VerifiedBadge className="h-3 w-3" />}
      </p>
    </button>
  );
}

function Shelf({ title, icon, items, seeAllHref, ...common }: CommonProps & { title: string; icon: React.ReactNode; items: StoreProduct[]; seeAllHref?: string }) {
  if (items.length === 0) return null;
  return (
    <section className="py-3">
      <div className="mb-2 flex items-center gap-2 px-4">
        <span className="text-primary">{icon}</span>
        <h2 className="text-base font-black tracking-tight sm:text-lg">{title}</h2>
        {seeAllHref && (
          <Link href={seeAllHref} scroll={false} className="ml-auto flex items-center text-xs font-bold text-primary">
            See all <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((p) => <ShelfCard key={p.id} product={p} {...common} />)}
      </div>
    </section>
  );
}

function Hero({ items, sellers, globalDiscount, onSelect }: CommonProps & { items: StoreProduct[] }) {
  const autoplay = useRef(Autoplay({ delay: 5000, stopOnInteraction: true }));
  if (items.length === 0) return null;
  return (
    <Carousel plugins={[autoplay.current]} opts={{ loop: true }} className="w-full px-4 pt-4">
      <CarouselContent>
        {items.map((p) => {
          const seller = sellers[p.sellerId];
          const { effective, original, discountPct } = priceInfo(p, !!seller?.isVerified, globalDiscount);
          const avatarColor = generateAvatarColor(p.sellerName || p.sellerId);
          return (
            <CarouselItem key={p.id}>
              <button type="button" onClick={() => onSelect(p.id)} className="group relative block aspect-[16/9] w-full overflow-hidden rounded-3xl text-left shadow-lg sm:aspect-[21/9] lg:aspect-auto lg:h-[380px]">
                <img
                  src={getDisplayUrl(p.previewImage || p.previews?.[0]?.url) || FALLBACK_IMG}
                  alt={p.title}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 disable-long-press-download"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md">
                  <Sparkles className="h-3 w-3" /> Featured
                </span>
                <span className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 sm:p-6">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-lg font-black leading-tight text-white sm:text-3xl">{p.title}</span>
                    <span className="mt-2 flex items-center gap-2 text-xs text-white/85">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={getDisplayUrl(seller?.profileImageUrl)} />
                        <AvatarFallback className={cn('text-[9px] font-bold', avatarColor.bg, avatarColor.text)}>{(p.sellerName || '?').charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{seller?.storeName || p.sellerName}</span>
                      {seller?.isVerified && <VerifiedBadge className="h-3 w-3" />}
                      <span className="opacity-60">· {CATEGORY_LABELS[p.productType as string] || p.productType}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {discountPct > 0 && <span className="rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">{discountPct}% OFF</span>}
                    <span className="rounded-xl bg-white px-3 py-1.5 text-sm font-black text-black shadow-lg">
                      {original > effective && <span className="mr-1 text-xs font-medium text-black/50 line-through">₹{original}</span>}₹{effective}
                    </span>
                  </span>
                </span>
              </button>
            </CarouselItem>
          );
        })}
      </CarouselContent>
    </Carousel>
  );
}

/**
 * The "All" tab front page: featured hero, then horizontal shelves the way
 * streaming/video apps do it, so there's always another row to scroll into.
 * Expects `ranked` already ordered by rankStoreProducts.
 */
export function StoreDiscovery({
  ranked, sellers, globalDiscount, followedSellerIds, topCategory, onSelect,
}: {
  ranked: StoreProduct[];
  sellers: Record<string, SellerProfile>;
  globalDiscount: number;
  followedSellerIds: Set<string>;
  topCategory?: string;
  onSelect: (id: string) => void;
}) {
  const trending = useMemo(() => trendingIds(ranked), [ranked]);
  const common = { sellers, globalDiscount, trending, onSelect };

  const shelves = useMemo(() => {
    const now = Date.now();
    const byEngagement = [...ranked].sort((a, b) => engagement(b) - engagement(a));
    const newest = [...ranked].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
    const deals = ranked.filter((p) => priceInfo(p, !!sellers[p.sellerId]?.isVerified, globalDiscount).discountPct > 0);
    const following = ranked.filter((p) => followedSellerIds.has(p.sellerId));
    const forYou = topCategory ? ranked.filter((p) => p.productType === topCategory) : [];
    const fresh = newest.filter((p) => now - new Date(p.createdAt as any).getTime() < 30 * DAY_MS);
    return { byEngagement, newest: fresh.length >= 4 ? fresh : newest, deals, following, forYou };
  }, [ranked, sellers, globalDiscount, followedSellerIds, topCategory]);

  const hero = ranked.slice(0, 5);
  const heroIds = new Set(hero.map((p) => p.id));
  // Skip hero items in Trending only when the catalogue is big enough that
  // the shelf still has real trending items left.
  const withoutHero = shelves.byEngagement.filter((p) => !heroIds.has(p.id));
  const trendingShelf = withoutHero.length >= 6 ? withoutHero : shelves.byEngagement;
  const cap = (xs: StoreProduct[]) => xs.slice(0, 12);
  const categoryIcon: Record<string, React.ReactNode> = {
    'YouTube Story': <Clapperboard className="h-4 w-4" />,
    'Hand Written Script': <FileText className="h-4 w-4" />,
    'PC Character': <UserRound className="h-4 w-4" />,
    'Premium Background': <ImageIcon className="h-4 w-4" />,
    'Real Voice': <Sparkles className="h-4 w-4" />,
  };

  return (
    <div className="pb-2">
      <Hero items={hero} {...common} />
      <div className="mt-2">
        <Shelf title="Trending now" icon={<Flame className="h-4 w-4" />} items={cap(trendingShelf)} {...common} />
        <Shelf title="From creators you follow" icon={<Users className="h-4 w-4" />} items={cap(shelves.following)} {...common} />
        {topCategory && (
          <Shelf
            title={`Because you like ${CATEGORY_LABELS[topCategory] || topCategory}`}
            icon={<Heart className="h-4 w-4" />}
            items={cap(shelves.forYou)}
            seeAllHref={`/store?category=${encodeURIComponent(topCategory)}`}
            {...common}
          />
        )}
        <Shelf title="Fresh drops" icon={<Sparkles className="h-4 w-4" />} items={cap(shelves.newest)} {...common} />
        <Shelf title="Deals" icon={<Tag className="h-4 w-4" />} items={cap(shelves.deals)} {...common} />
        {Object.keys(CATEGORY_LABELS).filter((c) => c !== topCategory).map((cat) => (
          <Shelf
            key={cat}
            title={CATEGORY_LABELS[cat]}
            icon={categoryIcon[cat]}
            items={cap(ranked.filter((p) => p.productType === cat))}
            seeAllHref={`/store?category=${encodeURIComponent(cat)}`}
            {...common}
          />
        ))}
      </div>
    </div>
  );
}
