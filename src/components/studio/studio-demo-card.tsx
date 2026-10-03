'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Volume2, Play, Pause, Radio } from 'lucide-react';
import { studioCard } from './studio-ui';
import { cn, getDisplayUrl } from '@/lib/utils';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { reportClientError } from '@/lib/report-client-error';

interface StudioDemoCardProps {
  title?: string;
  badgeText?: string;
  subtitle?: string;
}

interface AudioDemoItem {
  id: string;
  title: string;
  url: string;
  tag?: string;
}

const DEFAULT_DEMOS: AudioDemoItem[] = [
  {
    id: 'demo1',
    title: 'Clear Narration',
    tag: 'Hindi / English Voice',
    url: 'https://storage.12labs.in/hq_gen/ZXAjUAxPv2SA5e1e0N7avpEptCx2/PRO_1785243711529_KZUT6L_m9mw6uwv.mp3',
  },
  {
    id: 'demo2',
    title: 'Character Dialogue',
    tag: 'Multi-Role Scene',
    url: 'https://storage.12labs.in/hq_gen/ZXAjUAxPv2SA5e1e0N7avpEptCx2/PRO_1785243711529_KZUT6L_m9mw6uwv.mp3',
  },
  {
    id: 'demo3',
    title: 'Emotional Voiceover',
    tag: 'High Fidelity Output',
    url: 'https://storage.12labs.in/hq_gen/ZXAjUAxPv2SA5e1e0N7avpEptCx2/PRO_1785243711529_KZUT6L_m9mw6uwv.mp3',
  },
];

export function StudioDemoCard({
  title = "Your voices appear here",
  badgeText = "",
  subtitle = "Analyze a script to cast a voice for every character."
}: StudioDemoCardProps) {
  const { database } = initializeFirebase();
  const [demos, setDemos] = useState<AudioDemoItem[]>(DEFAULT_DEMOS);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!database) return;

    const audioDemosRef = ref(database, 'settings/landingPage/audioDemos');
    const unsubscribe = onRtdbValue(audioDemosRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const loaded: AudioDemoItem[] = [];

        if (data.demo1?.title) {
          loaded.push({
            id: 'demo1',
            title: data.demo1.title,
            tag: 'Narration Demo',
            url: data.demo1.fileId ? getDisplayUrl(data.demo1.fileId) : (data.demo1.url ? getDisplayUrl(data.demo1.url) : DEFAULT_DEMOS[0].url),
          });
        }
        if (data.demo2?.title) {
          loaded.push({
            id: 'demo2',
            title: data.demo2.title,
            tag: 'Dialogue Demo',
            url: data.demo2.fileId ? getDisplayUrl(data.demo2.fileId) : (data.demo2.url ? getDisplayUrl(data.demo2.url) : DEFAULT_DEMOS[1].url),
          });
        }
        if (data.demo3?.title) {
          loaded.push({
            id: 'demo3',
            title: data.demo3.title,
            tag: 'Emotional Demo',
            url: data.demo3.fileId ? getDisplayUrl(data.demo3.fileId) : (data.demo3.url ? getDisplayUrl(data.demo3.url) : DEFAULT_DEMOS[2].url),
          });
        }

        if (loaded.length > 0) {
          setDemos(loaded);
        }
      }
    });

    return () => unsubscribe();
  }, [database]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleTogglePlay = (demo: AudioDemoItem) => {
    if (activePlayingId === demo.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setActivePlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const newAudio = new Audio(demo.url);
    audioRef.current = newAudio;
    newAudio.onended = () => setActivePlayingId(null);
    newAudio.onerror = () => setActivePlayingId(null);

    newAudio.play().then(() => {
      setActivePlayingId(demo.id);
    }).catch((e: any) => {
        reportClientError('src/components/studio/studio-demo-card.tsx:129', e);
      setActivePlayingId(null);
    });
  };

  return (
    <section className={studioCard}>
      <div className="relative px-5 pb-5 pt-6 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(50%_80%_at_50%_0%,rgba(37,99,235,0.12),transparent)]" />
        <div className="anim-studio-float relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-indigo-500 text-white shadow-lg shadow-primary/30">
          <Sparkles className="h-6 w-6" />
        </div>
        <p className="relative mt-4 text-lg font-bold tracking-tight">{title}</p>
        <p className="relative mt-1 text-sm text-muted-foreground">{subtitle}</p>
        {badgeText && (
          <span className="relative mt-3 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{badgeText}</span>
        )}
      </div>

      <div className="border-t border-black/[0.05] p-3 dark:border-white/10">
        <p className="flex items-center gap-1.5 px-2 pb-2 text-xs font-semibold text-muted-foreground">
          <Radio className="h-3.5 w-3.5 text-primary" /> Listen to samples
        </p>
        <div className="space-y-1.5">
          {demos.map((demo) => {
            const isPlayingThis = activePlayingId === demo.id;
            return (
              <button
                key={demo.id}
                type="button"
                onClick={() => handleTogglePlay(demo)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all duration-300 active:scale-[0.99]',
                  isPlayingThis ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-muted/70 dark:hover:bg-white/5',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300',
                    isPlayingThis ? 'scale-105 bg-primary text-white shadow-md shadow-primary/30' : 'bg-primary/10 text-primary',
                  )}
                >
                  {isPlayingThis ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{demo.title}</span>
                  {demo.tag && <span className="block truncate text-xs text-muted-foreground">{demo.tag}</span>}
                </span>
                {isPlayingThis ? (
                  <span aria-hidden className="flex h-4 shrink-0 items-end gap-[3px] pr-1">
                    {[0, 1, 2, 3].map((b) => (
                      <span key={b} className="w-[3px] origin-bottom rounded-full bg-primary animate-[studio-eq_900ms_ease-in-out_infinite]" style={{ height: '100%', animationDelay: `${b * 120}ms` }} />
                    ))}
                  </span>
                ) : (
                  <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
