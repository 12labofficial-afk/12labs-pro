'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initializeFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';

/**
 * A drifting field of feature capsules under the hero.
 *
 * WHAT GOES IN HERE — and what never does.
 * Every phrase below is a BENEFIT the customer receives. None of them
 * name a vendor, a model, a provider, an API, an architecture, a
 * pipeline, or anything about how the product is built internally.
 * That's deliberate: "one-click voice generation" tells someone what
 * they get; naming the engine behind it tells competitors how to copy
 * it and tells customers nothing useful. If you add rows later, keep to
 * outcomes — capability, speed, support, price, reliability.
 *
 * Four rows drift at different speeds and in alternating directions, so
 * the capsules read as a loose crowd — some ahead, some behind — rather
 * than four tidy conveyor belts moving in lockstep.
 */

// Every line must be TRUE for every visitor today. Checked against the
// product: no "credits never expire" (Terms: 1 year / 30 days), no 24×7
// claim, no SEO/team/priority-queue features that don't exist, and
// commercial rights only from Pro up.
const ROW_1 = [
  'One-click voice generation ⚡',
  'Studio-grade output',
  'No watermarks',
  'Multi-character scripts',
  'Emotion & tone control',
  'Natural Hindi & Hinglish',
  'Pay only for what you use',
  'Unlimited downloads',
];

const ROW_2 = [
  'Automatic voice assignment',
  'Script writing built in',
  'Thumbnail generator',
  'Background music library',
  'Sound effects library',
  'Voice cloning',
  'Works on mobile & desktop',
  'Preview voices before you spend',
];

const ROW_3 = [
  'Full project history 📂',
  'Voice replacement in one tap',
  'Long scripts supported',
  'Export ready-to-upload audio',
  'Automatic quality checks',
  '2,000 free credits to start',
  'Commercial rights on Pro & above',
  'Zero setup required',
];

const ROW_4 = [
  'Human-like delivery 🎙️',
  'Consistent character voices',
  'Secure payments',
  'Promo codes & bonuses',
  'Transparent credit pricing',
  'Ready-made assets in the Store',
  'Store Tickets on bigger packs',
  'Built for Indian creators',
];

function Capsule({ label }: { label: string }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap select-none',
        'px-3 py-1.5 rounded-full',
        'text-[11px] sm:text-[13px] font-semibold',
        // A single light purple family — tinted background, matching
        // border, deeper text. One hue, three weights.
        'bg-violet-500/[0.07] dark:bg-violet-400/10',
        'border border-violet-500/15 dark:border-violet-300/15',
        'text-violet-900/80 dark:text-violet-100/85'
      )}
    >
      {label}
    </span>
  );
}

function MarqueeRow({
  items,
  reverse = false,
  duration,
  className,
}: {
  items: string[];
  reverse?: boolean;
  duration: number;
  className?: string;
}) {
  return (
    <div className={cn('flex overflow-hidden', className)} aria-hidden="true">
      <div
        className={cn(
          'flex items-center gap-2 shrink-0 [will-change:transform]',
          reverse ? 'anim-amb-marquee-x-rev' : 'anim-amb-marquee-x'
        )}
        style={{ animationDuration: `${duration}s` }}
      >
        {/* Rendered twice so the loop has no visible seam — the second
            copy is already on screen when the first scrolls off. */}
        {[...items, ...items].map((label, i) => (
          <Capsule key={`${label}-${i}`} label={label} />
        ))}
      </div>
    </div>
  );
}

const QUOTES_AUTOPLAY_MS = 4000;
// How long to wait after a manual prev/next tap before auto-play takes
// back over — long enough to read a couple more on purpose, short enough
// that it doesn't feel stuck if you just tap once and walk away.
const QUOTES_RESUME_AFTER_MS = 6000;

/**
 * Admin-added quotes get their own small carousel (not another auto-
 * scrolling row like the feature capsules) — a visitor can step through
 * them manually with the arrows. Auto-play resumes on its own once
 * there's been no manual interaction for a few seconds, so "manual mode"
 * is a temporary override, not a separate mode you have to turn back on.
 */
function QuotesCarousel({ quotes }: { quotes: string[] }) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isPaused || quotes.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % quotes.length);
    }, QUOTES_AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [isPaused, quotes.length]);

  // Reset to a valid index if the admin removes quotes while this is
  // sitting on one that no longer exists.
  useEffect(() => {
    if (index >= quotes.length) setIndex(0);
  }, [quotes.length, index]);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  if (quotes.length === 0) return null;

  const step = (delta: number) => {
    setIndex((i) => (i + delta + quotes.length) % quotes.length);
    // Manual tap: pause auto-play, then let it resume on its own once
    // there's been a quiet stretch — "activity band karo toh automatic
    // ho jaye" — rather than requiring an explicit toggle back on.
    setIsPaused(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setIsPaused(false), QUOTES_RESUME_AFTER_MS);
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 px-4">
      {quotes.length > 1 && (
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous quote"
          className="shrink-0 h-7 w-7 sm:h-8 sm:w-8 rounded-full border border-violet-500/20 bg-violet-500/[0.07] dark:bg-violet-400/10 flex items-center justify-center text-violet-700 dark:text-violet-200 hover:bg-violet-500/15 active:scale-90 transition-all"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <span
        key={index}
        className={cn(
          'min-w-0 max-w-[76vw] sm:max-w-md text-center break-words select-none',
          'px-4 py-2 rounded-full',
          'text-[13px] sm:text-sm font-semibold',
          'bg-violet-500/[0.07] dark:bg-violet-400/10',
          'border border-violet-500/15 dark:border-violet-300/15',
          'text-violet-900/80 dark:text-violet-100/85',
          'animate-in fade-in duration-300'
        )}
      >
        {quotes[index]}
      </span>

      {quotes.length > 1 && (
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next quote"
          className="shrink-0 h-7 w-7 sm:h-8 sm:w-8 rounded-full border border-violet-500/20 bg-violet-500/[0.07] dark:bg-violet-400/10 flex items-center justify-center text-violet-700 dark:text-violet-200 hover:bg-violet-500/15 active:scale-90 transition-all"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FeatureMarquee() {
  // Admin-added quotes (Admin Panel → Overview → Quotes tab), shown in
  // the QuotesCarousel below the auto-scrolling rows. Only rendered once
  // there's actually at least one, so an empty admin list never leaves a
  // gap on the page.
  const [customQuotes, setCustomQuotes] = useState<string[]>([]);

  useEffect(() => {
    const { database } = initializeFirebase();
    if (!database) return;
    const quotesRef = ref(database, 'settings/landingPage/quotes');
    const unsubscribe = onRtdbValue(quotesRef, (snapshot) => {
      const data = snapshot.val();
      setCustomQuotes(data ? Object.values(data).map(String) : []);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="relative w-full py-2">
      {/* Edges fade out so capsules enter and leave rather than being
          clipped mid-word at the viewport border. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28 z-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28 z-10 bg-gradient-to-l from-background to-transparent" />

      {/* Four auto-scrolling rows, four speeds, alternating directions. */}
      <div className="flex flex-col gap-2">
        <MarqueeRow items={ROW_1} duration={46} />
        <MarqueeRow items={ROW_2} duration={62} reverse />
        <MarqueeRow items={ROW_3} duration={54} />
        <MarqueeRow items={ROW_4} duration={70} reverse className="hidden sm:flex" />
      </div>

      {/* Admin-added quotes — a manual carousel, not another scrolling
          row, so visitors can actually step through them on purpose. */}
      {customQuotes.length > 0 && (
        <div className="pt-3">
          <QuotesCarousel quotes={customQuotes} />
        </div>
      )}

      {/* The visible list is decorative and aria-hidden, so the same
          information is offered once, plainly, to screen readers. */}
      <p className="sr-only">
        12Labs features: one-click voice generation, multi-character scripts with emotion
        control, natural Hindi and Hinglish, script writing, thumbnail generation, voice
        cloning, music and sound-effect libraries, full project history, and 2,000 free
        credits to start.
        {customQuotes.length > 0 ? ` ${customQuotes.join('. ')}.` : ''}
      </p>
    </div>
  );
}
