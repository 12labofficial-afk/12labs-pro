'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Image as ImageIcon, Music, Bell, DollarSign, Quote } from 'lucide-react';
import { LandingAssetsManager } from '@/components/admin/landing-assets-manager';
import { MusicLibraryManager } from '@/components/admin/music-library-manager';
import { PushNotificationManager } from '@/components/admin/push-notification-manager';
import { BroadcastNotification } from '@/components/admin/broadcast-notification';
import { PricingSettingsManager } from '@/components/admin/pricing-settings-manager';
import { QuotesManager } from '@/components/admin/quotes-manager';

/**
 * Content & Growth admin page — split off from the main /admin
 * ("Operations") dashboard, which had grown to 7 tabs mixing user/backend
 * management with site content and marketing settings. This page groups
 * everything that's about what visitors SEE and are OFFERED: homepage
 * quotes, landing page assets, the music library, push/broadcast
 * messaging, and pricing.
 */
export default function AdminContentPage() {
  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto w-full px-1">
      <div className="space-y-0.5 px-2">
          <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">CONTENT <span className="text-primary italic">& GROWTH</span></h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-60">Site Content, Messaging & Pricing</p>
      </div>

      <Tabs defaultValue="quotes" className="w-full">
        <div className="sticky top-16 z-30 bg-background/95 backdrop-blur-md py-3 border-b mb-6 -mx-1 px-1">
            <ScrollArea className="w-full">
                <TabsList className="bg-muted/40 p-1 h-auto rounded-2xl border border-primary/10 inline-flex gap-1 w-max mx-auto">
                    {[
                        { value: 'quotes',    label: 'Quotes',    icon: <Quote className="h-4 w-4" /> },
                        { value: 'site',      label: 'Landing',   icon: <ImageIcon className="h-4 w-4" /> },
                        { value: 'music',     label: 'Music',     icon: <Music className="h-4 w-4" /> },
                        { value: 'push',      label: 'Messaging', icon: <Bell className="h-4 w-4" /> },
                        { value: 'pricing',   label: 'Pricing',   icon: <DollarSign className="h-4 w-4" /> },
                    ].map((t) => (
                        <TabsTrigger
                            key={t.value}
                            value={t.value}
                            className="rounded-xl px-3 sm:px-4 h-10 flex items-center gap-2 font-bold text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-colors"
                        >
                            {t.icon}
                            <span>{t.label}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>
                <ScrollBar orientation="horizontal" className="h-1.5" />
            </ScrollArea>
        </div>

        <TabsContent value="quotes" className="mt-4"><QuotesManager /></TabsContent>
        <TabsContent value="site" className="mt-4"><LandingAssetsManager /></TabsContent>
        <TabsContent value="music" className="mt-4"><MusicLibraryManager /></TabsContent>
        <TabsContent value="push" className="mt-4 space-y-8"><div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><PushNotificationManager /><BroadcastNotification /></div></TabsContent>
        <TabsContent value="pricing" className="mt-4"><PricingSettingsManager /></TabsContent>
      </Tabs>
    </div>
  );
}
