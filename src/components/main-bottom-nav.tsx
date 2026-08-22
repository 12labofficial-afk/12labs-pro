'use client';

import React, { Suspense, useState, useEffect, useRef } from 'react';
import { Home, Store, Library, Mic, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';

/**
 * Universal Mobile Bottom Navigation
 * Aligned with the user's requested 5-item set: HOME, STORE, STUDIO, LIBRARY, SUPPORT.
 * Features a premium glass effect, primary color highlight, and indicator dot.
 */
function MainBottomNavContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [swipeIndex, setSwipeIndex] = useState<number | null>(null);
  const [showLiquid, setShowLiquid] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const swipeStart = useRef<{ x: number; index: number } | null>(null);
  const swipeIndexRef = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const hideLiquidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Restricted pages where nav is hidden
  const hiddenPaths = [
    '/login', 
    '/forgot-password', 
    '/verify-email', 
    '/admin', 
    '/seller',
    '/maintenance',
    '/store',
    '/following',
    '/purchases',
    '/history'
  ];

  useEffect(() => {
    const handleChatOpen = () => setIsChatOpen(true);
    const handleChatClose = () => setIsChatOpen(false);

    window.addEventListener('live-chat-open', handleChatOpen);
    window.addEventListener('live-chat-close', handleChatClose);

    return () => {
      window.removeEventListener('live-chat-open', handleChatOpen);
      window.removeEventListener('live-chat-close', handleChatClose);
    };
  }, []);
  
  // CRITICAL: Hide navigation for guests, restricted pages, OR when chat is open
  const isHidden = loading || !user || isChatOpen || hiddenPaths.some(p => pathname.startsWith(p));

  if (isHidden) return null;

  const navItems = [
    { href: '/', label: 'HOME', icon: Home },
    { href: '/store', label: 'STORE', icon: Store },
    { href: '/studio', label: 'STUDIO', icon: Mic, isCenter: true },
    { href: '/music-library', label: 'LIBRARY', icon: Library },
    { href: '/contact', label: 'SUPPORT', icon: MessageCircle },
  ];

  const getIndexFromPointer = (clientX: number) => {
    const rect = navRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(navItems.length - 1,
      Math.floor(((clientX - rect.left) / rect.width) * navItems.length)));
  };

  const handleSwipeStart = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const index = getIndexFromPointer(event.clientX);
    swipeStart.current = { x: event.clientX, index };
    swipeIndexRef.current = index;
    didSwipe.current = false;
    setSwipeIndex(index);
    setShowLiquid(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSwipeMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!swipeStart.current) return;
    if (Math.abs(event.clientX - swipeStart.current.x) < 8) return;
    didSwipe.current = true;
    setShowLiquid(true);
    const nextIndex = getIndexFromPointer(event.clientX);
    swipeIndexRef.current = nextIndex;
    setSwipeIndex(nextIndex);
  };

  const handleSwipeEnd = (event: React.PointerEvent<HTMLElement>) => {
    if (!swipeStart.current) return;
    const selectedIndex = swipeIndexRef.current ?? swipeStart.current.index;
    const wasSwipe = didSwipe.current;
    swipeStart.current = null;
    swipeIndexRef.current = null;

    if (wasSwipe) {
      event.preventDefault();
      router.push(navItems[selectedIndex].href);
    }

    if (hideLiquidTimer.current) clearTimeout(hideLiquidTimer.current);
    hideLiquidTimer.current = setTimeout(() => {
      setShowLiquid(false);
      setSwipeIndex(null);
    }, 380);
  };

  const NavItem = ({ href, label, icon: Icon, isCenter = false }: { href: string, label: string, icon: any, isCenter?: boolean }) => {
    const isActive = href === '/' 
      ? pathname === '/' 
      : pathname.startsWith(href);

    if (isCenter) {
        return (
            <div className="flex items-center justify-center">
                <Link href={href} prefetch={false} className="relative group">
                    <div className={cn(
                        "ios-glass-center w-12 h-12 flex items-center justify-center rounded-full transition-all duration-500 active:scale-90",
                        isActive 
                            ? "bg-primary text-white shadow-primary/20 scale-110" 
                            : "bg-muted/50 text-foreground hover:bg-primary/10 hover:text-primary"
                    )}>
                        <Icon className="w-7 h-7" strokeWidth={isActive ? 3 : 2} />
                    </div>
                    {isActive && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
                    )}
                </Link>
            </div>
        );
    }

    return (
        <Link 
            href={href} 
            prefetch={false} 
            className={cn(
        "flex flex-col items-center justify-center gap-1 transition-transform duration-200 ease-out active:scale-90 relative will-change-transform",
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
        >
            <div className={cn(
                "transition-transform duration-200 ease-out flex items-center justify-center",
                isActive ? "scale-110 -translate-y-0.5" : ""
            )}>
                <Icon className={cn("w-6 h-6", isActive ? "stroke-[2.5px]" : "stroke-[2px]")} />
            </div>
            <span className={cn(
                "text-[8px] font-black uppercase tracking-widest transition-all duration-300", 
                isActive ? "opacity-100" : "opacity-40"
            )}>
                {label}
            </span>
            {isActive && (
                <div className="absolute -bottom-1.5 w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
            )}
        </Link>
    );
  };

  return (
    <nav
      ref={navRef}
      className="ios-glass-nav md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-1.5rem)] max-w-md h-[4.5rem]"
      onPointerDown={handleSwipeStart}
      onPointerMove={handleSwipeMove}
      onPointerUp={handleSwipeEnd}
      onPointerCancel={handleSwipeEnd}
      onClickCapture={(event) => {
        if (didSwipe.current) {
          event.preventDefault();
          event.stopPropagation();
          didSwipe.current = false;
        }
      }}
      aria-label="Mobile navigation. Swipe across the dock to change sections."
    >
      {showLiquid && swipeIndex !== null && (
        <div
          className="liquid-swipe-indicator"
          style={{ left: `${((swipeIndex + 0.5) / navItems.length) * 100}%` }}
          aria-hidden="true"
        />
      )}
      <div className="relative z-[1] grid h-full grid-cols-5 items-center px-1 max-w-md mx-auto">
        
        <NavItem {...navItems[0]} />
        
        <NavItem {...navItems[1]} />
        
        <NavItem {...navItems[2]} />

        <NavItem {...navItems[3]} />
        
        <NavItem {...navItems[4]} />

      </div>
    </nav>
  );
}

export function MainBottomNav() {
  return (
    <Suspense fallback={null}>
      <MainBottomNavContent />
    </Suspense>
  );
}
