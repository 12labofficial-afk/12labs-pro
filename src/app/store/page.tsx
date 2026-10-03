
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Store, MoreVertical, Trash2, ShoppingCart, Gem, Play, Video, Clock, Eye, ChevronDown, ChevronUp, Package, Sparkles, X, Share2, Edit, CheckCircle, Search, Flame } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { initializeFirebase } from '@/firebase';
import { ref, get, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { StoreProduct, SellerProfile } from '@/lib/types';
import { cn, generateAvatarColor, getDisplayUrl } from '@/lib/utils';
import { useSearchParams, useRouter } from 'next/navigation';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useAuth } from '@/context/auth-provider';
import { useCart } from '@/context/cart-provider';
import { adminDeleteProduct, adminCleanCorruptedProducts } from './admin-actions';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { getProductDetails, getPublicSellerProfilesMap } from './[productId]/actions';
import { VerifiedBadge } from '@/components/verified-badge';
import ProductView from '@/components/store/product-view';
import { AdminEditProductDialog } from '@/components/store/admin-edit-product-dialog';
import { PurchaseHistory } from '@/components/history/purchase-history';
import { reportClientError } from '@/lib/report-client-error';

import { getIdToken } from '@/lib/id-token';
import { rankStoreProducts, buildCategoryAffinity } from '@/lib/store-ranking';
import { TicketPricePill, canUseTicket } from '@/components/store/store-ticket';
import { getMyFollowedSellerIds } from '@/app/seller/actions';
import { StoreDiscovery, CATEGORY_LABELS, trendingIds } from '@/components/store/store-discovery';
/**
 * Optimized Product Overlay Component for Zero-Lag Interaction
 */
function ProductOverlay({ 
    isOpen, 
    onClose, 
    isLoading, 
    product, 
    seller 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    isLoading: boolean; 
    product: StoreProduct | null; 
    seller: SellerProfile | null;
}) {
    // iOS-style sheet: pull the header (or the content once it's scrolled to
    // the top) down to dismiss. The offset is painted straight onto the
    // element — no React state per touch, so the heavy product page never
    // re-renders while dragging.
    const sheetRef = useRef<HTMLDivElement>(null);
    // State (not a ref) so the effect below runs once the portal has
    // actually mounted the header — it appears a render after isOpen flips.
    const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null);
    const drag = useRef<{ y: number; t: number; dy: number; active: boolean } | null>(null);
    const closingRef = useRef(false);

    const paint = (dy: number, animate: boolean) => {
        const el = sheetRef.current;
        if (!el) return;
        el.style.transition = animate ? 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
        el.style.transform = dy ? `translate3d(0, ${dy}px, 0)` : '';
    };

    const finishClose = () => {
        const el = sheetRef.current;
        if (el) el.style.animation = 'none'; // already off screen — skip the built-in slide-out
        onClose();
        closingRef.current = false;
    };

    const slideAwayAndClose = () => {
        if (closingRef.current) return;
        closingRef.current = true;
        const el = sheetRef.current;
        if (!el) return finishClose();
        el.style.transition = 'transform 240ms cubic-bezier(0.32, 0.72, 0, 1)';
        el.style.transform = 'translate3d(0, 100%, 0)';
        window.setTimeout(finishClose, 220);
    };

    useEffect(() => {
        if (!isOpen || !headerEl) return;
        const header = headerEl;
        const viewport = headerEl.closest('[role=dialog]')?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
        const targets = [header, viewport].filter(Boolean) as HTMLElement[];
        if (!targets.length) return;

        const onStart = (e: TouchEvent) => {
            if ((e.target as HTMLElement).closest('button, a, input, textarea, video, [role=radiogroup]')) return;
            const fromHeader = header?.contains(e.target as Node);
            if (!fromHeader && viewport && viewport.scrollTop > 0) return;
            drag.current = { y: e.touches[0].clientY, t: performance.now(), dy: 0, active: false };
        };
        const onMove = (e: TouchEvent) => {
            const d = drag.current;
            if (!d) return;
            const raw = e.touches[0].clientY - d.y;
            if (!d.active) {
                if (raw < 6) { if (raw < -6) drag.current = null; return; } // scrolling up — leave it alone
                d.active = true;
            }
            if (e.cancelable) e.preventDefault(); // we own this gesture now
            d.dy = Math.max(0, raw);
            paint(d.dy, false);
        };
        const onEnd = () => {
            const d = drag.current;
            drag.current = null;
            if (!d?.active) return;
            const velocity = d.dy / Math.max(1, performance.now() - d.t);
            if (d.dy > 140 || (d.dy > 40 && velocity > 0.5)) slideAwayAndClose();
            else paint(0, true);
        };

        targets.forEach((t) => {
            t.addEventListener('touchstart', onStart, { passive: true });
            t.addEventListener('touchmove', onMove, { passive: false });
            t.addEventListener('touchend', onEnd);
            t.addEventListener('touchcancel', onEnd);
        });
        return () => targets.forEach((t) => {
            t.removeEventListener('touchstart', onStart);
            t.removeEventListener('touchmove', onMove);
            t.removeEventListener('touchend', onEnd);
            t.removeEventListener('touchcancel', onEnd);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, headerEl]);

    if (!isOpen) return null;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent
                ref={sheetRef}
                onOpenAutoFocus={(e) => e.preventDefault()}
                side="bottom"
                className="flex h-[94dvh] w-full flex-col gap-0 overflow-hidden rounded-t-[28px] border-none bg-background p-0 shadow-2xl will-change-transform"
            >
                <SheetHeader className="sr-only">
                    <SheetTitle>{product?.title || 'Product Details'}</SheetTitle>
                    <SheetDescription>Viewing detailed information about {product?.title}</SheetDescription>
                </SheetHeader>

                {/* Grab bar + close — drag anywhere here */}
                <div ref={setHeaderEl} className="relative z-[60] shrink-0 touch-none select-none bg-background/85 px-4 pb-2 pt-2 backdrop-blur-xl">
                    <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/25" />
                    <div className="flex h-9 items-center justify-between gap-3">
                        <span className="truncate rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                            {isLoading ? 'Loading…' : (CATEGORY_LABELS as any)[product?.productType as string] || product?.productType}
                        </span>
                        <button
                            type="button"
                            aria-label="Close"
                            onClick={slideAwayAndClose}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform active:scale-90"
                        >
                            <X className="h-4 w-4" strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    {isLoading || !product ? (
                        <div className="space-y-5 p-4 animate-in fade-in duration-300">
                            <Skeleton className="aspect-video w-full rounded-[22px]" />
                            <Skeleton className="h-8 w-3/4 rounded-xl" />
                            <Skeleton className="h-6 w-1/3 rounded-xl" />
                            <Skeleton className="h-40 w-full rounded-[22px]" />
                        </div>
                    ) : (
                        <ProductView initialProduct={product} initialSeller={seller} />
                    )}
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

function ProductCard({ 
    product, 
    seller, 
    isPurchasedByMe,
    globalDiscount = 0,
    onSelect,
    onAdminAction,
    isTrending = false
}: { 
    product: StoreProduct, 
    seller?: SellerProfile, 
    isPurchasedByMe?: boolean,
    globalDiscount?: number,
    isTrending?: boolean,
    onSelect: (id: string) => void,
    onAdminAction: () => void 
}) {
    const { user } = useAuth(); 
    const { addToCart } = useCart(); 
    const { toast } = useToast();
    const [isExpanded, setIsExpanded] = useState(false); 
    const [isEditOpen, setIsEditOpen] = useState(false);
    const avatarColor = generateAvatarColor(product.sellerName || product.sellerId); 
    const isAdmin = user?.role === 'admin'; 
    const isVerified = seller?.isVerified || false;
    const displayImageUrl = getDisplayUrl(product.previewImage || product.previews?.[0]?.url); 
    const timeAgo = formatDistanceToNowShort(product.createdAt);
    
    const isSold = product.status === 'sold' || (product as any).isSold === true || Boolean((product as any).buyerUid);
    const isOwner = isPurchasedByMe || (user?.uid && (product as any).buyerUid === user.uid);

    const { effectivePrice, originalPrice, hasDiscount, discountPercentage, saveAmount } = useMemo(() => {
        const basePrice = Number(product.price || 0);
        const origPrice = Number(product.originalPrice || 0);

        let finalEffective = basePrice;
        let finalOriginal = origPrice > basePrice ? origPrice : basePrice;

        if (isVerified && globalDiscount > 0) {
            finalEffective = Math.floor(basePrice * (1 - globalDiscount / 100));
            finalOriginal = basePrice;
        } else if (origPrice > basePrice) {
            finalEffective = basePrice;
            finalOriginal = origPrice;
        }

        const isDisc = finalOriginal > finalEffective;
        const discountPct = isDisc ? Math.round(((finalOriginal - finalEffective) / finalOriginal) * 100) : 0;
        const saved = finalOriginal - finalEffective;

        return {
            effectivePrice: finalEffective,
            originalPrice: finalOriginal,
            hasDiscount: isDisc,
            discountPercentage: discountPct,
            saveAmount: saved
        };
    }, [product.price, product.originalPrice, isVerified, globalDiscount]);

    const handleAddToCart = (e: React.MouseEvent) => { 
        e.stopPropagation(); 
        addToCart({ ...product, price: effectivePrice, sellerIsVerified: isVerified } as any); 
    };

    const handleShare = (e: React.MouseEvent) => {
        e.stopPropagation();
        const shareUrl = `${window.location.origin}/store/${product.id}`;
        if (navigator.share) {
            navigator.share({
                title: product.title,
                text: product.description,
                url: shareUrl,
            }).catch((e: any) => {
        reportClientError('src/app/store/page.tsx:264', e);});
        } else {
            navigator.clipboard.writeText(shareUrl).then(() => {
                toast({ title: 'Link Copied', description: 'Product link copied to clipboard!' });
            }).catch((err) => {
        reportClientError('src/app/store/page.tsx:268', err);
                console.error('[Store] Clipboard write failed:', err);
                toast({ variant: 'destructive', title: 'Could not copy link', description: 'Please copy the URL manually.' });
            });
        }
    };

    const isStory = product.productType === 'YouTube Story';
    const isNewListing = !!product.createdAt && Date.now() - new Date(product.createdAt as any).getTime() < 2 * 24 * 60 * 60 * 1000;

    return (
        <div className="flex flex-col w-full bg-background mb-8 group animate-in fade-in duration-500">
            <div 
                onClick={() => onSelect(product.id)}
                className="relative block w-full aspect-video overflow-hidden bg-muted/30 cursor-pointer rounded-[2rem] border-primary/5 shadow-sm group-hover:shadow-xl transition-all duration-500"
            >
                <img src={displayImageUrl || 'https://res.cloudinary.com/dptryoeis/image/upload/v1772590885/c10h0lknqblj7kfxp5qr.png'} alt={product.title} className="w-full h-full object-contain disable-long-press-download transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                {!isSold && !isOwner && (isNewListing || isTrending || discountPercentage > 0) && (
                    <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-1">
                        {isNewListing && <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black uppercase text-white shadow">New</span>}
                        {isTrending && <span className="flex items-center gap-0.5 rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-black uppercase text-white shadow"><Flame className="h-3 w-3" />Trending</span>}
                        {discountPercentage > 0 && <span className="rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow">{discountPercentage}% OFF</span>}
                    </div>
                )}
                {isStory && (
                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center transition-opacity pointer-events-none z-10">
                        <div className="p-4 bg-white/20 backdrop-blur-xl rounded-full border border-white/40 shadow-2xl scale-100 group-hover:scale-110 transition-transform duration-500">
                            <Play className="h-10 w-10 text-white fill-current" />
                        </div>
                    </div>
                )}
                <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1 z-20">
                    {isOwner ? (
                        <Badge className="bg-emerald-600 text-white font-black text-[10px] px-3 h-8 border-none rounded-xl shadow-2xl leading-none flex items-center gap-1 uppercase">
                            <CheckCircle className="h-3 w-3" /> OWNED BY YOU
                        </Badge>
                    ) : isSold ? (
                        <Badge variant="destructive" className="font-black text-[10px] px-3 h-8 border-none rounded-xl shadow-2xl leading-none uppercase">
                            SOLD OUT
                        </Badge>
                    ) : canUseTicket({ tickets: user?.storeTickets, sellerVerified: isVerified, price: effectivePrice }) ? (
                        <TicketPricePill price={effectivePrice} size="md" />
                    ) : (
                        <span className="rounded-xl bg-white px-3 py-1.5 text-sm font-black text-black shadow-lg">
                            {hasDiscount && <span className="mr-1 text-xs font-medium text-black/50 line-through">₹{originalPrice}</span>}₹{effectivePrice}
                        </span>
                    )}
                </div>
                {isStory && product.duration && (
                    <div className="absolute bottom-3 left-3 z-20">
                        <Badge className="bg-black/90 text-white font-mono font-bold text-[10px] h-6 px-2 border-none rounded-lg flex items-center gap-1 leading-none">
                            <Video className="h-3 w-3" />{product.duration.replace(' Minutes', '')}
                        </Badge>
                    </div>
                )}
            </div>

            <div className="flex items-start gap-3 p-3 pt-4">
                <Link href={`/seller/${product.sellerId}`} className="shrink-0 pt-0.5">
                    <Avatar className="h-10 w-10 border shadow-sm transition-transform hover:scale-110">
                        <AvatarImage src={getDisplayUrl(seller?.profileImageUrl)} />
                        <AvatarFallback className={cn("font-bold text-xs", avatarColor.bg, avatarColor.text)}>{product.sellerName?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                </Link>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex justify-between items-start gap-2">
                        <div onClick={() => onSelect(product.id)} className="flex-1 cursor-pointer">
                            <h3 className="font-bold text-[15px] leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors">{product.title}</h3>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 shrink-0 rounded-full" onClick={(e) => e.stopPropagation()}>
                                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-2xl">
                                <DropdownMenuItem onClick={handleAddToCart} className="h-11 rounded-lg cursor-pointer font-bold">
                                    <ShoppingCart className="mr-3 h-4 w-4" /> Add to Cart
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleShare} className="h-11 rounded-lg cursor-pointer font-bold">
                                    <Share2 className="mr-3 h-4 w-4" /> Share Product
                                </DropdownMenuItem>
                                {isAdmin && (
                                    <>
                                        <DropdownMenuSeparator className="my-1" />
                                        <DropdownMenuItem 
                                            onClick={(e) => { e.stopPropagation(); setIsEditOpen(true); }} 
                                            className="h-11 rounded-lg cursor-pointer font-bold text-primary"
                                        >
                                            <Edit className="mr-3 h-4 w-4" /> Admin Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem 
                                            onClick={async (e) => { 
                                                e.stopPropagation(); 
                                                if(window.confirm('Delete this product?')) { 
                                                    await adminDeleteProduct(await getIdToken(), product.id); 
                                                    onAdminAction(); 
                                                } 
                                            }} 
                                            className="h-11 rounded-lg cursor-pointer text-destructive font-bold"
                                        >
                                            <Trash2 className="mr-3 h-4 w-4" /> Admin Delete
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="flex flex-wrap items-center text-xs text-muted-foreground font-medium">
                        <Link href={`/seller/${product.sellerId}`} className="hover:text-foreground flex items-center gap-1">
                            {product.sellerName}{isVerified && <VerifiedBadge className="h-3 w-3" />}
                        </Link>
                        <span className="mx-1.5">•</span>
                        <span>{timeAgo}</span>
                    </div>
                </div>
            </div>
            
            <div className="px-3 pb-4">
                <button className="w-full flex items-center justify-between p-2 px-3 bg-muted/40 rounded-xl group/summary cursor-pointer hover:bg-muted/60 transition-all text-left" onClick={() => setIsExpanded(!isExpanded)}>
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                        {isStory ? <Video className="h-3.5 w-3.5 text-red-600 shrink-0" /> : <Sparkles className="h-3.5 w-3.5 text-primary fill-current shrink-0" />}
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold truncate">
                                {isStory && <span className="text-red-600 mr-1">[READY VIDEO]</span>}
                                <span className="text-muted-foreground mr-1">{isStory ? 'Readymade Video' : product.productType} by {product.sellerName}:</span>
                                <span className="opacity-70 font-medium">{product.description}</span>
                            </p>
                        </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5 ml-2 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 ml-2 text-muted-foreground shrink-0" />}
                </button>
                {isExpanded && (
                    <div className="mt-2 px-2 animate-in fade-in slide-in-from-top-1 duration-300">
                        <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-3">{product.description}</p>
                        <button onClick={() => onSelect(product.id)} className="text-[10px] font-black text-primary uppercase tracking-widest mt-2 inline-block hover:underline">View Full Details</button>
                    </div>
                )}
            </div>

            {isAdmin && (
                <AdminEditProductDialog 
                    product={product} 
                    open={isEditOpen} 
                    onOpenChange={setIsEditOpen} 
                    onUpdate={onAdminAction} 
                />
            )}
        </div>
    );
}

function formatDistanceToNowShort(dateInput: any) {
    if (!dateInput) return 'recently';
    const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    if (!date || isNaN(date.getTime())) return 'recently';
    const now = new Date(); const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return 'just now'; const diffInMinutes = Math.floor(diffInSeconds / 60); if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60); if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24); if (diffInDays < 7) return `${diffInDays}d ago`;
    return `${Math.floor(diffInDays / 7)}w ago`;
}

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export default function StoreHomePage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]); 
  const [sellers, setSellers] = useState<Record<string, SellerProfile>>({}); 
  const [isLoading, setIsLoading] = useState(true); 
  const { database, firestore } = initializeFirebase(); 
  const [refreshKey, setRefreshKey] = useState(0); 
  const searchParams = useSearchParams(); 
  const selectedType = searchParams.get('category') || 'All';
  
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [activeProduct, setActiveProduct] = useState<StoreProduct | null>(null);
  const [activeSeller, setActiveSeller] = useState<SellerProfile | null>(null);
  const [isOverlayLoading, setIsOverlayLoading] = useState(false);
  const [purchasedProductIds, setPurchasedProductIds] = useState<Set<string>>(new Set());
  const [followedSellerIds, setFollowedSellerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.uid) { setFollowedSellerIds(new Set()); return; }
    getIdToken()
      .then((t) => getMyFollowedSellerIds(t))
      .then((ids) => setFollowedSellerIds(new Set(ids)))
      .catch((e: any) => reportClientError('src/app/store/page.tsx:followed', e));
  }, [user?.uid]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  // 🛍️ Lets a logged-in user view "what I've bought" right here in the
  // store, in a slide-up sheet, instead of navigating to a separate page.
  const [isPurchasesOpen, setIsPurchasesOpen] = useState(false);

  // Fetch global discount setting
  useEffect(() => {
    if (!database) return;
    const pricingRef = ref(database, 'settings/pricing');
    return onRtdbValue(pricingRef, (snap) => {
        if (snap.exists()) {
            setGlobalDiscount(Number(snap.val().verifiedSellerGlobalDiscount || 0));
        }
    });
  }, [database]);

  // Listen to current user's paid purchase history from storeHistory
  useEffect(() => {
    if (!user?.uid || !firestore) {
      setPurchasedProductIds(new Set());
      return;
    }
    try {
      const q = query(
        collection(firestore, 'storeHistory'),
        where('userId', '==', user.uid),
        where('status', '==', 'paid')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const ids = new Set<string>();
        snapshot.docs.forEach(doc => {
          const pId = doc.data().productId;
          if (pId) ids.add(pId);
        });
        setPurchasedProductIds(ids);
      }, (err) => console.error("Error fetching user purchases:", err));

      return () => unsubscribe();
    } catch (e) {
        reportClientError('src/app/store/page.tsx:509', e);
      console.error("Failed to query user store history:", e);
    }
  }, [user?.uid, firestore]);

  useEffect(() => { 
    if (!database) return; 
    const fetchData = async () => { 
        try { 
            const productsSnapshot = await get(ref(database, 'storeProducts'));
            // Public-safe, server-side lookup — strips payout/contact
            // fields before they ever reach the browser (this used to be
            // a raw client read of the entire sellerProfiles node).
            const sellersMap = await getPublicSellerProfilesMap();
            const data = productsSnapshot.val();
            
            let hasCorrupted = false;
            const validProducts: StoreProduct[] = [];

            if (data && typeof data === 'object') {
                for (const [id, val] of Object.entries(data)) {
                    const item = val as any;
                    if (item && typeof item === 'object' && item.title && item.productType) {
                        validProducts.push({ ...item, id: item.id || id });
                    } else {
                        hasCorrupted = true;
                    }
                }
            }

            setProducts(validProducts);
            setSellers(sellersMap);

            // Auto-clean corrupted ghost nodes in the background if found
            if (hasCorrupted) {
                adminCleanCorruptedProducts(await getIdToken()).catch((e: any) => { reportClientError('src/app/store/page.tsx:548', e); return null; });
            }
        } catch (err) {
        reportClientError('src/app/store/page.tsx:546', err);
            console.error("[Store] Failed to load products:", err);
        } finally { 
            setIsLoading(false); 
        } 
    }; 
    fetchData(); 
  }, [database, refreshKey]);

  const handleProductSelect = async (id: string) => {
    setSelectedProductId(id);
    setIsOverlayLoading(true);
    try {
        const { product, seller } = await getProductDetails(id);
        setActiveProduct(product);
        setActiveSeller(seller);
    } catch (e) {
        reportClientError('src/app/store/page.tsx:562', e);
        console.error("Failed to load product overlay:", e);
    } finally {
        setIsOverlayLoading(false);
    }
  };

  const handleCloseOverlay = () => {
    setSelectedProductId(null);
    setActiveProduct(null);
    setActiveSeller(null);
  };

  const rankedAll = useMemo(() => {

    // ONLY show fresh, available, unsold products in the store
    const visibleProducts = products.filter(product => {
      if (!product || !product.title || !product.productType) return false;

      const isSold = product.status === 'sold' || (product as any).isSold === true || Boolean((product as any).buyerUid);
      
      // If sold, do not show in store (purchased products belong in Purchase History/Library)
      if (isSold) return false;

      // Do not show items already bought by current user
      if (purchasedProductIds.has(product.id)) return false;

      return true;
    });

    const purchasedTypes = products
      .filter(p => purchasedProductIds.has(p.id))
      .map(p => p.productType as string);
    const affinity = buildCategoryAffinity(purchasedTypes);
    const ranked = rankStoreProducts(visibleProducts, {
      sellers,
      followedSellerIds,
      categoryAffinity: affinity,
      viewerKey: user?.uid || 'anon',
    });
    const topCategory = Object.entries(affinity).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { ranked, topCategory };
  }, [products, user, purchasedProductIds, sellers, followedSellerIds]);

  const [searchQuery, setSearchQuery] = useState('');
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const showDiscovery = selectedType === 'All' && !trimmedQuery;
  const trendingSet = useMemo(() => trendingIds(rankedAll.ranked), [rankedAll.ranked]);

  const filteredProducts = useMemo(() => {
    let list = rankedAll.ranked;
    if (selectedType !== 'All') list = list.filter(p => p.productType === selectedType);
    if (trimmedQuery) {
      list = list.filter(p => {
        const sellerName = sellers[p.sellerId]?.storeName || p.sellerName || '';
        return [p.title, sellerName, p.description, CATEGORY_LABELS[p.productType as string] || p.productType]
          .some(f => String(f || '').toLowerCase().includes(trimmedQuery));
      });
    }
    return list;
  }, [rankedAll.ranked, selectedType, trimmedQuery, sellers]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
        
        <div className="sticky top-[64px] z-40 bg-background/95 backdrop-blur-md border-b">
            <div className="flex items-center gap-2 px-4 pt-3">
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search scripts, videos, creators…"
                        className="h-10 w-full rounded-full border bg-muted/40 pl-9 pr-9 text-sm outline-none transition focus:border-primary/40 focus:bg-background"
                    />
                    {searchQuery && (
                        <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted">
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {user && (
                    <button
                        type="button"
                        onClick={() => setIsPurchasesOpen(true)}
                        aria-label="My Purchases"
                        title="My Purchases"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted/40 text-foreground transition-transform active:scale-90 hover:bg-muted"
                    >
                        <Package className="h-[18px] w-[18px]" />
                    </button>
                )}
            </div>
            <ScrollArea className="w-full">
                <div className="flex items-center gap-3 p-3 px-4">
                    {['All', 'YouTube Story', 'Hand Written Script', 'PC Character', 'Premium Background', 'Real Voice'].map((cat) => { 
                        const isActive = selectedType === cat; 
                        const label = cat === 'YouTube Story' ? 'Readymade Videos' : cat === 'Hand Written Script' ? 'Scripts' : cat === 'PC Character' ? 'Characters' : cat === 'Premium Background' ? 'Backgrounds' : cat; 
                        return (
                            <Link key={cat} href={`/store?category=${cat}`} replace className={cn("px-4 h-8 flex items-center rounded-lg text-sm font-bold whitespace-nowrap transition-colors", isActive ? "bg-foreground text-background" : "bg-muted hover:bg-muted/80")} scroll={false}>{label}</Link>
                        ); 
                    })}
                </div>
                <ScrollBar orientation="horizontal" className="invisible" />
            </ScrollArea>
        </div>

        <main className="flex-1 w-full max-w-screen-2xl mx-auto">
            {isLoading ? (
                <div className="p-8 space-y-8"><Skeleton className="aspect-video w-full rounded-[2rem]" /></div>
            ) : filteredProducts.length > 0 ? (
                <>
                {showDiscovery && (
                    <>
                        <StoreDiscovery
                            ranked={rankedAll.ranked}
                            sellers={sellers}
                            globalDiscount={globalDiscount}
                            followedSellerIds={followedSellerIds}
                            topCategory={rankedAll.topCategory}
                            onSelect={handleProductSelect}
                            ownedIds={purchasedProductIds}
                            ticketCount={user?.storeTickets || 0}
                        />
                        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                            <Gem className="h-4 w-4 text-primary" />
                            <h2 className="text-base font-black tracking-tight sm:text-lg">Explore more</h2>
                        </div>
                    </>
                )}
                {trimmedQuery && (
                    <p className="px-4 pt-4 text-sm text-muted-foreground">{filteredProducts.length} result{filteredProducts.length === 1 ? '' : 's'} for “{searchQuery.trim()}”</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-x-4">
                    {filteredProducts.map(p => (
                        <ProductCard 
                            key={p.id} 
                            product={p} 
                            seller={sellers[p.sellerId]} 
                            isPurchasedByMe={purchasedProductIds.has(p.id)}
                            globalDiscount={globalDiscount}
                            onSelect={handleProductSelect}
                            onAdminAction={() => setRefreshKey(k => k + 1)}
                            isTrending={trendingSet.has(p.id)}
                        />
                    ))}
                </div>
                </>
            ) : trimmedQuery ? (
                <div className="px-4 py-24 text-center text-muted-foreground"><Search className="mx-auto mb-3 h-10 w-10 opacity-40" />No results for “{searchQuery.trim()}”. Try another word.</div>
            ) : (
                <div className="text-center py-32 opacity-20"><Store className="mx-auto h-20 w-20" /><h3 className="mt-6 text-3xl font-black uppercase">Archives Empty</h3></div>
            )}
        </main>

        <ProductOverlay 
            isOpen={!!selectedProductId}
            onClose={handleCloseOverlay}
            isLoading={isOverlayLoading}
            product={activeProduct}
            seller={activeSeller}
        />

        {/* 🛍️ "My Purchases" — same PurchaseHistory component used on the
            dedicated /purchases page, shown inline here so a user browsing
            the store can check what they've already bought without leaving. */}
        <Sheet open={isPurchasesOpen} onOpenChange={setIsPurchasesOpen}>
            <SheetContent side="bottom" className="h-[90dvh] w-full p-0 border-none shadow-none bg-background overflow-hidden flex flex-col rounded-t-[2rem]">
                <SheetHeader className="p-4 border-b text-left">
                    <SheetTitle className="flex items-center gap-2 text-base font-black uppercase tracking-wide">
                        <Package className="h-5 w-5" /> My Purchases
                    </SheetTitle>
                    <SheetDescription className="sr-only">Everything you've bought from the store</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto p-4">
                    <PurchaseHistory />
                </div>
            </SheetContent>
        </Sheet>
    </div>
  );
}
