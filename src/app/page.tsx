'use client';

import { useAuth } from '@/context/auth-provider';
import { HeroSection } from '@/components/landing/hero-section';
import { Footer } from '@/components/landing/footer';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { InstallPwaBanner } from '@/components/install-pwa-banner';
import { ProductMarquee } from '@/components/landing/product-marquee';
// The chat widget pulls in its own weight and is never needed for the
// first screen — load it lazily and don't server-render it. webpackPrefetch
// tells the browser to fetch this chunk in idle time right after the page
// loads (instead of only once React tries to render it), so opening a push
// notification (which lands on /?open_chat=true — see live-chat-widget.tsx)
// doesn't also have to wait on this download on top of everything else.
const LiveChatWidget = dynamic(() => import(/* webpackPrefetch: true */ '@/components/live-chat-widget').then(m => m.LiveChatWidget), { ssr: false });

// Below-the-fold sections load as their OWN chunks, not part of the
// initial page bundle. LazySection already delayed when they RENDER, but
// with static imports the browser still had to download every section's
// code up front — which is a big part of why the first paint was slow.
// next/dynamic makes each a separate file fetched only when needed.
// Hero, marquee and footer stay static: they're above the fold or tiny.
//
// 🔴 FIX: none of these had webpackPrefetch, unlike LiveChatWidget above —
// so the chunk request only started the instant LazySection's observer
// fired (150px before the section enters view), which most scroll speeds
// easily outrun. That's the "reach the bottom, then it suddenly loads"
// feeling — the browser was still downloading+parsing the chunk exactly
// when it needed to already be on screen. Prefetching in idle time right
// after the initial page load means the chunk is already cached by the
// time a visitor actually scrolls down to it, so mounting is instant.
const FeaturesSection = dynamic(() => import(/* webpackPrefetch: true */ '@/components/landing/features-section').then(m => m.FeaturesSection));
const DemoSection = dynamic(() => import(/* webpackPrefetch: true */ '@/components/landing/demo-section').then(m => m.DemoSection));
const PricingSection = dynamic(() => import(/* webpackPrefetch: true */ '@/components/landing/pricing-section').then(m => m.PricingSection));
const WhyChooseUsSection = dynamic(() => import(/* webpackPrefetch: true */ '@/components/landing/why-choose-us-section').then(m => m.WhyChooseUsSection));
const SellerCtaSection = dynamic(() => import(/* webpackPrefetch: true */ '@/components/landing/seller-cta-section').then(m => m.SellerCtaSection));
const FaqSection = dynamic(() => import(/* webpackPrefetch: true */ '@/components/landing/faq-section').then(m => m.FaqSection));
const CommunityCtaSection = dynamic(() => import(/* webpackPrefetch: true */ '@/components/landing/community-cta-section').then(m => m.CommunityCtaSection));
const FinalCtaSection = dynamic(() => import(/* webpackPrefetch: true */ '@/components/landing/final-cta-section').then(m => m.FinalCtaSection));

import { LazySection } from '@/components/lazy-section';

export default function LandingPage() {
    const { user } = useAuth();

    const organizationSchema = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: '12Labs',
        url: 'https://www.12labs.in',
        logo: 'https://res.cloudinary.com/dulnj3uns/image/upload/v1779601872/12labs/z8hs6j2vmghbigabi5q1.png',
        description: 'AI Voice Studio for Indian creators — Hindi & English AI voices, voice cloning, script generation, and a digital assets marketplace.',
    };

    const websiteSchema = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: '12Labs',
        url: 'https://www.12labs.in',
        potentialAction: {
            '@type': 'SearchAction',
            target: 'https://www.12labs.in/docs?q={search_term_string}',
            'query-input': 'required name=search_term_string',
        },
    };

    return (
        <div className="flex flex-col min-h-screen text-foreground bg-background">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
            />

            <main className="flex-1">
                <HeroSection user={user} />
                <ProductMarquee />
                <div className="max-w-none overflow-hidden">
                    <div className="sr-only">
                        Looking for 11 labs or eleven labs in India? 12Labs is the professional choice for Indian creators 
                        providing high quality AI voiceovers, voice cloning, and script studio. A powerful elevenlabs alternative.
                    </div>
                    {/* 🔴 FIX: these minHeight values were rough guesses, and
                        measuring each section's REAL rendered height (mobile
                        viewport) showed every single one was drastically
                        under-reserved — Demo alone grew from a 500px
                        placeholder to ~1650px of real content. LazySection's
                        box can only ever grow past minHeight, never shrink
                        below it, so an undersized guess means the box visibly
                        balloons the moment the section's data/chunk finishes
                        loading, shoving everything below it down mid-scroll —
                        that's the "space badal jaata hai, scroll kharab ho
                        jaata hai" jhatka. Values below are each section's
                        measured height plus a buffer for auth-state/data
                        variance, so the reserved space already matches reality
                        and nothing has to grow later. */}
                    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
                        <div className="flex flex-col gap-0">
                            <LazySection minHeight="700px">
                                <FeaturesSection />
                            </LazySection>
                            <LazySection minHeight="1700px">
                                <DemoSection />
                            </LazySection>
                            <LazySection minHeight="1250px">
                                <PricingSection />
                            </LazySection>
                            <LazySection minHeight="550px">
                                <CommunityCtaSection />
                            </LazySection>
                            <LazySection minHeight="1200px">
                                <WhyChooseUsSection />
                            </LazySection>
                            {(user?.isSeller || user?.role === 'admin') && (
                                <LazySection minHeight="650px">
                                    <SellerCtaSection />
                                </LazySection>
                            )}
                            <LazySection minHeight="650px">
                                <FinalCtaSection user={user} />
                            </LazySection>
                            <LazySection minHeight="1100px">
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
