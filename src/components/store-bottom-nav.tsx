'use client';

import { Store, Plus, Heart, CheckSquare, FileText } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';

/**
 * YouTube Mobile Style Bottom Navigation
 * Updated with user requested labels and strict seller checks.
 */
export function StoreBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  
  // Hide store bottom nav on seller dashboard and seller console/upload pages
  const isDashboardPage = pathname === '/seller' || 
    pathname.startsWith('/seller/products') ||
    pathname.startsWith('/seller/sales') ||
    pathname.startsWith('/seller/settings') ||
    pathname.startsWith('/seller/add') ||
    pathname.startsWith('/seller/onboarding');

  // The bottom nav should only be visible on store pages and profile pages
  const visiblePaths = ['/store', '/seller', '/history', '/following', '/purchases'];
  const isVisible = visiblePaths.some(p => pathname.startsWith(p)) && !isDashboardPage;

  if (!isVisible) {
    return null;
  }
  
  const NavItem = ({ href, label, icon: Icon }: { href: string, label: string, icon: any }) => {
    const isActive = pathname === href || (href.includes('?') && pathname + window.location.search === href);
    
    return (
        <Link 
            href={href} 
            prefetch={false} 
            className={cn(
                "ios-glass-item flex flex-col items-center justify-center gap-1 transition-transform duration-300 ease-out active:scale-90 will-change-transform",
                isActive ? 'text-foreground' : 'text-muted-foreground'
            )}
        >
            <Icon className={cn("w-6 h-6", isActive ? "fill-current" : "")} />
            <span className="text-[10px] font-medium leading-none">{label}</span>
        </Link>
    );
  };

  return (
    <div className="ios-glass-nav md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md h-[4.5rem]">
      <div className="grid h-full grid-cols-5 max-w-md mx-auto">
        
        <NavItem href="/store" label="Home" icon={Store} />
        
        <NavItem href="/store?category=Hand Written Script" label="Scripts" icon={FileText} />

        {/* Center Upload Button - STRICT SELLER/ADMIN CHECK */}
        {(user?.isSeller || user?.role === 'admin') ? (
            <div className="flex items-center justify-center">
                <Link href="/seller/add" prefetch={false}>
                    <div className="ios-glass-center w-10 h-10 flex items-center justify-center rounded-full border-2 border-foreground hover:bg-muted transition-colors">
                        <Plus className="h-7 w-7 text-foreground" strokeWidth={1.5} />
                    </div>
                </Link>
            </div>
        ) : (
            <div aria-hidden="true" />
        )}

        <NavItem href="/following" label="Following" icon={Heart} />
        
        <NavItem href="/purchases" label="Purchases" icon={CheckSquare} />

      </div>
    </div>
  );
}
