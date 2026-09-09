'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Mic, Radio, ShieldCheck, Zap, Globe2, Cpu, AudioWaveform, Sliders } from 'lucide-react';

export function HeroSection({ user }: { user: User | null }) {
  return (
    <section className="relative w-full min-h-[100vh] py-16 md:py-32 overflow-hidden flex flex-col items-center justify-center text-center px-4 font-['Poppins'] bg-background">
      {/* Enhanced Multi-Layer Background */}
      {/* Layer 1: Main Gradient Blob */}
      <div className="absolute top-[15%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[700px] bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.25)_0%,rgba(147,51,234,0.15)_35%,rgba(168,85,247,0.08)_70%,transparent_85%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.35)_0%,rgba(168,85,247,0.25)_40%,rgba(124,58,202,0.1)_70%,transparent_85%)] blur-3xl rounded-full pointer-events-none -z-10 animate-pulse" style={{ animationDuration: '8s' }} />

      {/* Layer 2: Secondary Gradient */}
      <div className="absolute -top-40 right-0 w-[600px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.12)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.15)_0%,transparent_70%)] blur-3xl rounded-full pointer-events-none -z-10" style={{ animationDelay: '1s' }} />

      {/* Layer 3: Cyber Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.04)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_70%_65%_at_50%_45%,#000_65%,transparent_100%)] pointer-events-none -z-10" />

      {/* Floating Animated Particles with Enhanced Movement */}
      <div className="absolute top-1/3 left-8 w-96 h-96 bg-blue-500/12 rounded-full blur-3xl pointer-events-none" style={{ animation: 'pulse 6s ease-in-out infinite' }} />
      <div className="absolute bottom-1/3 right-5 w-96 h-96 bg-purple-500/12 rounded-full blur-3xl pointer-events-none" style={{ animation: 'pulse 7s ease-in-out 1s infinite' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-72 h-72 bg-indigo-500/8 rounded-full blur-3xl pointer-events-none" style={{ animation: 'pulse 8s ease-in-out 2s infinite' }} />

      <div className="relative z-10 max-w-5xl mx-auto flex flex-col items-center">
        {/* Top Status Pill - Dark Luxury Glass */}
        <motion.div
          initial={{ opacity: 0, y: -15, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-card/80 dark:bg-zinc-900/90 border border-primary/20 dark:border-white/10 shadow-lg backdrop-blur-2xl text-xs sm:text-sm font-semibold text-foreground mb-8 hover:border-primary/40 transition-all cursor-default"
        >
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 dark:from-blue-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent font-extrabold uppercase tracking-wider text-[11px]">
            12Labs Voice Studio
          </span>
          <span className="text-muted-foreground/60">•</span>
          <span className="text-muted-foreground font-medium text-xs">Ultra-Fast AI Sound Engine</span>
        </motion.div>

        {/* Central Brand Orb with Audio Aura Ring */}
        <div className="relative mb-10 group">
          {/* Animated Glowing Outer Ring */}
          <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 opacity-40 blur-xl group-hover:opacity-70 transition-opacity duration-500 animate-pulse" />

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.1 }}
            whileHover={{ scale: 1.06, rotate: 1 }}
            className="relative w-[190px] h-[190px] sm:w-[220px] sm:h-[220px] rounded-full bg-[radial-gradient(circle_at_30%_30%,#3b82f6,#1d4ed8,#0f172a)] dark:bg-[radial-gradient(circle_at_30%_30%,#60a5fa,#2563eb,#020617)] flex items-center justify-center shadow-[0_0_90px_rgba(37,99,235,0.5),inset_0_8px_25px_rgba(255,255,255,0.7)] cursor-pointer select-none overflow-hidden border border-white/20"
          >
            {/* Glass Light Reflection Arc */}
            <div className="absolute top-[20px] left-[30px] w-[60px] h-[60px] rounded-full bg-white/40 blur-[8px] pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 pointer-events-none" />

            {/* Central Brand Number */}
            <h2 className="text-[85px] sm:text-[100px] font-black text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] font-logo leading-none select-none relative z-10 tracking-tighter">
              12
            </h2>

            {/* Sound Wave Overlay Ring */}
            <div className="absolute inset-2 rounded-full border border-white/10 border-dashed animate-spin-slow pointer-events-none" />
          </motion.div>
        </div>

        {/* Main Display Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.15 }}
          className="space-y-6 max-w-4xl"
        >
          <div className="space-y-3">
            <h1 className="text-[42px] sm:text-[72px] md:text-[96px] font-black tracking-tighter leading-[0.98] text-foreground font-headline">
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="block"
              >
                More <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 dark:from-blue-400 dark:via-purple-300 dark:to-pink-300 bg-clip-text text-transparent animate-pulse">Content</span>.
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="block"
              >
                Less <span className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 dark:from-purple-300 dark:via-indigo-300 dark:to-blue-400 bg-clip-text text-transparent">Effort</span>.
              </motion.span>
            </h1>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-lg sm:text-2xl text-muted-foreground/80 dark:text-zinc-300 font-medium max-w-2xl mx-auto leading-relaxed px-2 font-['Inter']"
          >
            Create <span className="font-bold text-foreground">professional content</span> in minutes, not hours. AI voice dubbing, cinematic scripts, and stunning visuals—all in one platform.
          </motion.p>

          {/* Primary & Secondary Action CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.4 }}
            className="pt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-5"
          >
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto h-14 px-10 text-base sm:text-lg font-bold rounded-xl shadow-2xl shadow-blue-500/40 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white transition-all duration-300 border border-blue-400/30 group relative overflow-hidden active:scale-95 hover:shadow-2xl hover:shadow-blue-500/60"
            >
              <Link href={user ? "/studio" : "/login"} className="flex items-center justify-center gap-3">
                <Sparkles className="w-5 h-5" />
                <span className="font-semibold">Get Started Free</span>
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full sm:w-auto h-14 px-8 text-base font-semibold rounded-xl border border-primary/30 hover:border-primary/60 bg-white/5 dark:bg-zinc-950/40 backdrop-blur-xl hover:bg-accent/40 text-foreground transition-all duration-300 active:scale-95 shadow-md hover:shadow-lg"
            >
              <Link href="/music-library" className="flex items-center justify-center gap-3">
                <Radio className="w-5 h-5 text-blue-500" />
                <span className="font-semibold">Browse Sound Library</span>
              </Link>
            </Button>
          </motion.div>

          {/* Feature Badge Bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="pt-12 flex flex-wrap items-center justify-center gap-3 sm:gap-5 text-xs sm:text-sm font-semibold"
          >
            <motion.div
              whileHover={{ y: -2 }}
              className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500/10 to-amber-500/5 dark:from-amber-500/20 dark:to-amber-500/10 border border-amber-500/30 shadow-sm hover:shadow-md transition-all text-amber-700 dark:text-amber-300"
            >
              <Zap className="w-4 h-4" />
              <span>Ultra-Fast Synthesis</span>
            </motion.div>
            <motion.div
              whileHover={{ y: -2 }}
              className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500/10 to-blue-500/5 dark:from-blue-500/20 dark:to-blue-500/10 border border-blue-500/30 shadow-sm hover:shadow-md transition-all text-blue-700 dark:text-blue-300"
            >
              <Globe2 className="w-4 h-4" />
              <span>70+ Languages</span>
            </motion.div>
            <motion.div
              whileHover={{ y: -2 }}
              className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/20 dark:to-emerald-500/10 border border-emerald-500/30 shadow-sm hover:shadow-md transition-all text-emerald-700 dark:text-emerald-300"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>100% Commercial License</span>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
