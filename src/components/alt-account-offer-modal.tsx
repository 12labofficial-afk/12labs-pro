'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Sparkles, Coins, ArrowRight, Gift, Copy, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function AltAccountOfferModal() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isFloatingBadgeVisible, setIsFloatingBadgeVisible] = useState(false);

    const dismissKey = user ? `twelve_labs_alt_offer_dismissed_${user.uid}` : '';

    useEffect(() => {
        if (authLoading || !user) return;

        // Trigger for restricted/alt accounts
        const isRestricted = user.isAltAccount || user.deviceRestricted;
        if (!isRestricted) return;

        // If user still needs onboarding, do NOT open the offer modal yet
        // as having both modals open blocks interactions and text input
        const needsOnboarding = !user.termsAcceptedAt || !user.age || !user.name;
        const onboardingDismissed = typeof window !== 'undefined' && sessionStorage.getItem('onboarding_dismissed') === 'true';
        if (needsOnboarding && !onboardingDismissed) {
            return;
        }

        // Check if user has dismissed popup in this session or permanently
        const isDismissed = sessionStorage.getItem(dismissKey) === 'true' || localStorage.getItem(dismissKey) === 'true';

        if (!isDismissed) {
            setOpen(true);
        } else {
            setIsFloatingBadgeVisible(false);
        }
    }, [user, authLoading, dismissKey]);

    const handleDismiss = () => {
        setOpen(false);
        setIsFloatingBadgeVisible(false);
        if (user) {
            sessionStorage.setItem(dismissKey, 'true');
            localStorage.setItem(dismissKey, 'true');
        }
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText('EXTRA10');
        setCopied(true);
        toast({ title: "Coupon Copied!", description: "EXTRA10 copied to clipboard." });
        setTimeout(() => setCopied(false), 2000);
    };

    const handleClaimOffer = () => {
        setOpen(false);
        router.push('/buy-credits?code=EXTRA10');
    };

    if (!user || (!user.isAltAccount && !user.deviceRestricted)) return null;

    if (!open) {
        return (
            <>
                {/* FLOATING BADGE - SHOWN WHEN MODAL IS CLOSED */}
                {isFloatingBadgeVisible && (
                    <div 
                        onClick={() => setOpen(true)}
                        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-3 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer transition-all duration-300 transform hover:scale-105 active:scale-95 animate-pulse"
                        id="floating-alt-offer-badge"
                    >
                        <Gift className="h-5 w-5 text-emerald-200" />
                        <span className="text-xs uppercase tracking-wider">SPECIAL OFFER</span>
                        <span className="bg-black/30 px-2 py-0.5 rounded text-emerald-100 text-xs font-mono font-bold">+10% & 2K BONUS</span>
                    </div>
                )}
            </>
        );
    }

    return (
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
            {/* Backdrop Overlay */}
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300 z-10"
                onClick={handleDismiss}
            />

            {/* Modal Box */}
            <div 
                className="relative max-w-sm w-[92vw] max-h-[92vh] overflow-y-auto rounded-[2rem] border border-emerald-500/30 shadow-2xl bg-[#141414] text-white z-20 flex flex-col animate-in fade-in zoom-in-95 duration-200 p-6"
                onClick={(e) => e.stopPropagation()}
                id="alt-offer-dialog"
            >
                {/* Explicit Close / Cross Button */}
                <button 
                    onClick={handleDismiss}
                    className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors z-30 cursor-pointer"
                    aria-label="Close modal"
                >
                    <X className="h-4 w-4" />
                </button>

                <div className="text-center space-y-2 pt-2">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                        <Gift className="h-6 w-6 animate-bounce" />
                    </div>
                    <h2 className="text-xl font-black uppercase tracking-tight text-white">
                        Exclusive Welcome Gift!
                    </h2>
                    <p className="text-xs text-gray-300 font-medium">
                        Get <span className="text-emerald-400 font-bold">10% Extra Credits</span> + <span className="text-emerald-400 font-bold">2,000 Welcome Bonus Credits</span> on your purchase!
                    </p>
                </div>

                <div className="my-4 space-y-3">
                    {/* Coupon Code Container */}
                    <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 px-1">
                            <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
                            <div>
                                <p className="text-[10px] uppercase font-bold text-emerald-400/80">Coupon Code</p>
                                <p className="text-lg font-mono font-black tracking-widest text-emerald-300">EXTRA10</p>
                            </div>
                        </div>
                        <Button 
                            size="sm" 
                            variant="outline"
                            onClick={handleCopyCode}
                            className="h-9 px-3 rounded-xl border-emerald-500/40 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-500 hover:text-black font-bold text-xs gap-1.5 transition-all shrink-0 cursor-pointer"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{copied ? 'Copied' : 'Copy'}</span>
                        </Button>
                    </div>

                    {/* Benefits Summary List */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-3 space-y-2 text-xs">
                        <div className="flex items-center gap-2 text-gray-200 font-bold">
                            <Coins className="h-4 w-4 text-amber-400 shrink-0" />
                            <span>+10% Extra Credits on any package</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-200 font-bold">
                            <Gift className="h-4 w-4 text-emerald-400 shrink-0" />
                            <span>+2,000 Welcome Bonus Credits included</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-2 pt-1">
                    <Button 
                        onClick={handleClaimOffer}
                        className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm h-12 shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                    >
                        <span>Buy Now & Claim Offer</span>
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}


