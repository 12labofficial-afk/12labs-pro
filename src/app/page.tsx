'use client';

import { useAuth } from '@/context/auth-provider';
import { Header } from '@/components/header';
import { HeroSection } from '@/components/landing/hero-section';
import { Footer } from '@/components/landing/footer';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { InstallPwaBanner } from '@/components/install-pwa-banner';
import { ProductMarquee } from '@/components/landing/product-marquee';
import { LiveChatWidget } from '@/components/live-chat-widget';

import { FeaturesSection } from '@/components/landing/features-section';
import { DemoSection } from '@/components/landing/demo-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { WhyChooseUsSection } from '@/components/landing/why-choose-us-section';
import { SellerCtaSection } from '@/components/landing/seller-cta-section';
import { FaqSection } from '@/components/landing/faq-section';
import { CommunityCtaSection } from '@/components/landing/community-cta-section';
import { FinalCtaSection } from '@/components/landing/final-cta-section';

import { LazySection } from '@/components/lazy-section';
import { IndependenceCashbackDialog } from '@/components/offers/independence-cashback-dialog';

export default function LandingPage() {
    const { user } = useAuth();

    return (
        <div className="flex flex-col min-h-screen text-foreground bg-background">
            <Header />

            <main className="flex-1">
                {/* 🇮🇳 Independence Day Offer Banner */}
                <div className="max-w-7xl mx-auto px-4 pt-4 sm:pt-6">
                    <IndependenceCashbackDialog triggerVariant="banner" />
                </div>

                <HeroSection user={user} />
                <ProductMarquee />
                <div className="max-w-none overflow-hidden">
                    <div className="sr-only">
                        Looking for 11 labs or eleven labs in India? 12Labs is the professional choice for Indian creators 
                        providing high quality AI voiceovers, voice cloning, and script studio. A powerful elevenlabs alternative.
                    </div>
                    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
                        <div className="flex flex-col gap-12 md:gap-20">
                            <LazySection minHeight="500px">
                                <FeaturesSection user={user} />
                            </LazySection>
                            <LazySection minHeight="500px">
                                <DemoSection />
                            </LazySection>
                            <LazySection minHeight="400px">
                                <PricingSection />
                            </LazySection>
                            <LazySection minHeight="250px">
                                <CommunityCtaSection />
                            </LazySection>
                            <LazySection minHeight="400px">
                                <WhyChooseUsSection />
                            </LazySection>
                            {(user?.isSeller || user?.role === 'admin') && (
                                <LazySection minHeight="400px">
                                    <SellerCtaSection />
                                </LazySection>
                            )}
                            <LazySection minHeight="300px">
                                <FinalCtaSection user={user} />
                            </LazySection>
                            <LazySection minHeight="400px">
                                <FaqSection />
                            </LazySection>
                        </div>
                    </Suspense>
                </div>
            </main>

            <Footer />
            
            <LiveChatWidget />
            <InstallPwaBanner />
        </div>
    );
}
