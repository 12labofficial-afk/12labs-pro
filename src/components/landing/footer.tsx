'use client';

import Link from 'next/link';
import { IndianFlagIcon } from '@/components/icons';
import React, { useState, useEffect, useMemo } from 'react';
import { initializeFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useAuth } from '@/context/auth-provider';
import { Instagram, Youtube, Mail, Send, MessageCircle, ArrowUpRight } from 'lucide-react';

const DEFAULT_WHATSAPP = 'https://chat.whatsapp.com/CbWx44GhFyt49jCiHteGSe';
const TELEGRAM = 'https://t.me/twelvelab';
const SUPPORT_EMAIL = 'mailto:12labofficial@gmail.com';

const mainTools = [
    { title: 'AI Voice Studio', link: '/studio' },
    { title: 'Digital Store', link: '/store' },
    { title: 'AI Script Studio', link: '/script-generator' },
];

const otherToolsBase = [
    { title: 'Voice Cloning', link: '/voice-cloning' },
    { title: 'Seller Hub', link: '/seller' },
];

const companyLinks = [
    { title: 'Ecosystem & Docs', link: '/docs' },
    { title: 'Contact & Support', link: '/contact' },
    { title: 'Terms of Service', link: '/terms' },
    { title: 'Privacy Policy', link: '/privacy' },
];

function FooterColumn({ title, links }: { title: string; links: { title: string; link: string }[] }) {
    return (
        <div>
            <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-foreground">{title}</h4>
            <ul className="space-y-2.5">
                {links.map((l) => (
                    <li key={l.title}>
                        <Link href={l.link} prefetch={false} className="text-sm text-muted-foreground transition-colors hover:text-primary">
                            {l.title}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function Footer() {
    const { user } = useAuth();
    const { database } = initializeFirebase();
    const [developerApiLocked, setDeveloperApiLocked] = useState(false);
    const [whatsappLink, setWhatsappLink] = useState(DEFAULT_WHATSAPP);

    useEffect(() => {
        if (!database) return;
        return onRtdbValue(ref(database, 'toolSettings/developer-api/locked'), (snapshot) => {
            setDeveloperApiLocked(snapshot.val() === true);
        });
    }, [database]);

    useEffect(() => {
        if (!database) return;
        return onRtdbValue(ref(database, 'settings/app/whatsappSupportLink'), (snapshot) => {
            const link = snapshot.val();
            if (typeof link === 'string' && link.startsWith('http')) setWhatsappLink(link);
        });
    }, [database]);

    const otherTools = useMemo(() => {
        const isAdmin = user?.role === 'admin';
        let tools = [...otherToolsBase];
        if (!isAdmin && !user?.isSeller) {
            tools = tools.filter(t => t.title !== 'Seller Hub');
        }
        // Regular users follow the admin lock; admins keep the API console
        // and docs visible for maintenance while the public API is off.
        if (isAdmin || !developerApiLocked) {
            tools.push({ title: 'Developer Platform', link: '/developer' });
            tools.push({ title: 'API Documentation', link: '/api-docs' });
        }
        return tools;
    }, [user, developerApiLocked]);

    return (
        <footer className="border-t bg-background">
            <div className="container px-4 py-10 md:px-6 md:py-14">
                {/* Community strip — same order as the support page: WhatsApp, Telegram, Email */}
                <div className="mb-10 flex flex-col gap-4 rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div>
                        <p className="text-lg font-black tracking-tight">Join 12Labs creators</p>
                        <p className="text-sm text-muted-foreground">Updates, help and new drops — talk to us anytime.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#25D366] px-4 text-sm font-bold text-white shadow-sm transition-transform active:scale-95">
                            <MessageCircle className="h-4 w-4" /> WhatsApp
                        </a>
                        <a href={TELEGRAM} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#229ED9] px-4 text-sm font-bold text-white shadow-sm transition-transform active:scale-95">
                            <Send className="h-4 w-4" /> Telegram
                        </a>
                        <a href={SUPPORT_EMAIL} className="inline-flex h-10 items-center gap-2 rounded-full border bg-background px-4 text-sm font-bold transition-transform active:scale-95">
                            <Mail className="h-4 w-4" /> Email
                        </a>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
                    <div className="col-span-2 space-y-4">
                        <Link href="/" className="flex items-baseline gap-1" prefetch={false}>
                            <span className="font-logo text-3xl font-bold text-primary">12</span>
                            <span className="font-logo text-3xl font-bold text-foreground">Labs</span>
                        </Link>
                        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                            Empowering Indian creators with next-generation AI tools.
                            Build your audience with the speed of light.
                        </p>
                        <div className="flex items-center gap-2">
                            <a href="https://www.instagram.com/12labofficial" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-pink-500/40 hover:text-pink-600">
                                <Instagram className="h-4 w-4" />
                            </a>
                            <a href="https://www.youtube.com/@12labofficial" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-600">
                                <Youtube className="h-4 w-4" />
                            </a>
                            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-green-500/40 hover:text-green-600">
                                <MessageCircle className="h-4 w-4" />
                            </a>
                            <a href={TELEGRAM} target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:border-sky-500/40 hover:text-sky-600">
                                <Send className="h-4 w-4" />
                            </a>
                        </div>
                    </div>
                    <FooterColumn title="Main Tools" links={mainTools} />
                    <FooterColumn title="More Tools" links={otherTools} />
                    <div className="col-span-2 md:col-span-1">
                        <FooterColumn title="Company" links={companyLinks} />
                        <Link href="/store" prefetch={false} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary">
                            Browse the store <ArrowUpRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>

                <div className="mt-10 space-y-4 border-t pt-6">
                    <div className="flex flex-col items-start justify-between gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
                        <p>&copy; {new Date().getFullYear()} 12Labs. All rights reserved.</p>
                        <p className="flex items-center gap-2 font-semibold">
                            Proudly built in India <IndianFlagIcon className="h-4 w-auto" />
                        </p>
                    </div>
                    <p className="text-[10px] leading-relaxed text-muted-foreground/70">
                        12Labs operates as a child company of Green Group Manufacturing. Green Group Manufacturing is the parent company of 12Labs. All intellectual property, including designs, content, branding, and source code, is protected by applicable laws. Unauthorized use, copying, or reproduction may result in legal action.
                    </p>
                </div>
            </div>
        </footer>
    );
}
