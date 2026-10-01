'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { initializeFirebase } from '@/firebase';
import { ref, get, query, limitToLast } from 'firebase/database';
import { ArrowRight, Flame, Sparkles } from 'lucide-react';
import type { StoreProduct, SellerProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Shelf, CATEGORY_LABELS, trendingIds } from '@/components/store/store-discovery';
import { rankStoreProducts } from '@/lib/store-ranking';
import { getPublicSellerProfilesMap } from '@/app/store/[productId]/actions';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { reportClientError } from '@/lib/report-client-error';

const DAY_MS = 24 * 60 * 60 * 1000;
const SHELF_SIZE = 12;
const productHref = (id: string) => `/store/${id}`;

/**
 * Landing-page window into the store: the same cards as the store shelves
 * (category label, featured-style price pill, Trending/New/% OFF badges),
 * ranked with the store algorithm. Loads only when scrolled near.
 */
export function ProductMarquee() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [sellers, setSellers] = useState<Record<string, SellerProfile>>({});
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  const { database } = initializeFirebase();
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasStartedLoading(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!database || !hasStartedLoading) return;
    return onRtdbValue(ref(database, 'settings/pricing'), (snap) => {
      setGlobalDiscount(Number(snap.val()?.verifiedSellerGlobalDiscount || 0));
    });
  }, [database, hasStartedLoading]);

  useEffect(() => {
    if (!database || !hasStartedLoading) return;
    (async () => {
      try {
        const [snapshot, sellersMap] = await Promise.all([
          get(query(ref(database, 'storeProducts'), limitToLast(80))),
          getPublicSellerProfilesMap().catch(() => ({} as Record<string, SellerProfile>)),
        ]);
        const data = snapshot.val() || {};
        const list: StoreProduct[] = Object.entries(data)
          .filter(([, val]: [string, any]) => val && typeof val === 'object' && val.title && val.productType)
          .map(([id, val]: [string, any]) => ({ ...val, id: val.id || id }))
          .filter((p: any) => p.status !== 'sold' && !p.isSold && !p.buyerUid);
        setProducts(list);
        setSellers(sellersMap);
      } catch (error) {
        reportClientError('src/components/landing/product-marquee.tsx', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [database, hasStartedLoading]);

  const { trendingShelf, freshShelf, trending, categories } = useMemo(() => {
    const ranked = rankStoreProducts(products, { sellers, viewerKey: 'landing' });
    const now = Date.now();
    const trendingShelf = ranked.slice(0, SHELF_SIZE);
    const shown = new Set(trendingShelf.map((p) => p.id));
    const freshShelf = [...products]
      .filter((p) => !shown.has(p.id))
      .filter((p) => {
        const t = p.createdAt ? new Date(p.createdAt as any).getTime() : 0;
        return t > 0 && now - t < 14 * DAY_MS;
      })
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
      .slice(0, SHELF_SIZE);
    const counts: Record<string, number> = {};
    for (const p of products) counts[p.productType as string] = (counts[p.productType as string] || 0) + 1;
    const categories = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { trendingShelf, freshShelf: freshShelf.length >= 3 ? freshShelf : [], trending: trendingIds(products), categories };
  }, [products, sellers]);

  if (!hasStartedLoading) {
    return <section ref={sectionRef} className="h-72 w-full" />;
  }

  if (isLoading) {
    return (
      <section ref={sectionRef} className="w-full py-8">
        <div className="container flex gap-3 overflow-hidden px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-[68vw] max-w-[300px] shrink-0 space-y-2 sm:w-[280px]">
              <Skeleton className="aspect-video w-full rounded-2xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  const common = { sellers, globalDiscount, trending, onSelect: () => {}, hrefFor: productHref };

  return (
    <section ref={sectionRef} className="w-full overflow-hidden py-8 md:py-12">
      <div className="container px-0 md:px-6">
        <div className="mb-4 flex flex-col gap-3 px-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-primary">12Labs Store</p>
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Ready-made assets from creators</h2>
            <p className="mt-1 text-sm text-muted-foreground">Videos, scripts, characters and backgrounds — buy once, use right away.</p>
          </div>
          <Link
            href="/store"
            prefetch={false}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-transform active:scale-95"
          >
            Open store <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {categories.length > 1 && (
          <div className="mb-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categories.map(([type, n]) => (
              <Link
                key={type}
                href={`/store?category=${encodeURIComponent(type)}`}
                prefetch={false}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-bold transition-colors hover:border-primary/40"
              >
                {CATEGORY_LABELS[type] || type}
                <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{n}</span>
              </Link>
            ))}
          </div>
        )}

        <Shelf title="Trending in Store" icon={<Flame className="h-5 w-5" />} items={trendingShelf} seeAllHref="/store" {...common} />
        <Shelf title="Fresh drops" icon={<Sparkles className="h-5 w-5" />} items={freshShelf} seeAllHref="/store" {...common} />
      </div>
    </section>
  );
}
