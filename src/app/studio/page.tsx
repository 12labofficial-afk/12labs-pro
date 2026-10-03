'use client';

import { StudioProvider, useStudio } from '@/context/studio-provider';
import { ScriptEditor } from '@/components/studio/script-editor';
import { CharacterAssignments } from '@/components/studio/character-assignments';
import { GenerationProgress } from '@/components/studio/generation-progress';
import { GenerationSettings } from '@/components/studio/generation-settings';
import { GeneratedLines } from '@/components/studio/generated-lines';
import { Loader2, FileText, Users, AudioLines, Check } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { getDisplayUrl, cn } from '@/lib/utils';
import { useAuth } from '@/context/auth-provider';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

import { StudioDemoCard } from '@/components/studio/studio-demo-card';

// Force dynamic execution for production stability
export const dynamic = 'force-dynamic';

const STEPS = [
  { n: 1, label: 'Script', icon: FileText },
  { n: 2, label: 'Voices', icon: Users },
  { n: 3, label: 'Generate', icon: AudioLines },
] as const;

function StudioTopBar({ progress, active, canOpen, onOpen }: {
  progress: number;
  active: number;
  canOpen: (n: number) => boolean;
  onOpen: (n: number) => void;
}) {
  return (
    <div className="anim-studio-rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-none tracking-tight sm:text-4xl">
          Voice <span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">Studio</span>
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Script in, studio-quality voices out.</p>
      </div>

      {/* Step tracker — tap a step to jump to it. Three equal segments,
          always fits a 320px screen. */}
      <ol className="grid w-full grid-cols-3 gap-1.5 rounded-2xl border border-black/[0.06] bg-white/80 p-1.5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 sm:w-auto sm:min-w-[340px]">
        {STEPS.map(({ n, label, icon: Icon }) => {
          const isActive = active === n;
          const done = progress > n && !isActive;
          const enabled = canOpen(n);
          return (
            <li key={n} className="min-w-0">
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onOpen(n)}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex w-full min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all duration-300 active:scale-95 disabled:cursor-default disabled:active:scale-100',
                  isActive ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25' : done ? 'text-primary hover:bg-primary/5' : enabled ? 'text-muted-foreground hover:bg-muted' : 'text-muted-foreground/60',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} /> : <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StudioContent() {
  const { 
    scriptState, generatedLines, hqProject, hqProjectId, isHqProjectLoading, 
    generatedAudio, generatedAudioUrl, generationMode, isGenerating, isFinalizing, characters
  } = useStudio();
  
  // 🛡️ HARDENED PURGE LOGIC
  const isHqActive = hqProjectId || (hqProject && (hqProject.status === 'in_queue' || hqProject.status === 'processing'));
  const isHqReady = hqProject?.status === 'completed' && !!hqProject.audioUrl;
  const isStandardAudioReady = !isGenerating && !isFinalizing && (!!generatedAudio || !!generatedAudioUrl || (generatedLines.length > 0 && generatedLines.every(l => l.status === 'done')));
  const isAudioReady = isHqReady || isStandardAudioReady;

  const hasResult = !!(isHqActive || isAudioReady || (isGenerating && generationMode === 'high-quality'));

  // The user can step back from the result to the script / cast without
  // losing it. Any new submission or a reset brings the result view back.
  const [viewSetup, setViewSetup] = useState(false);
  const [focusStep, setFocusStep] = useState<1 | 2 | null>(null);
  useEffect(() => { setViewSetup(false); setFocusStep(null); }, [hqProjectId]);
  const showResult = hasResult && !viewSetup;

  // 4 = everything done: all three steps show a check.
  const progress = isAudioReady ? 4 : isHqActive || isGenerating ? 3 : scriptState === 'valid' ? 2 : 1;
  const active = showResult ? 3 : focusStep ?? (scriptState === 'valid' ? 2 : 1);

  const canOpen = (n: number) => n === 1 || (n === 2 ? scriptState === 'valid' && characters.length > 0 : hasResult);
  const openStep = (n: number) => {
    if (n === 3) {
      setViewSetup(false);
      setFocusStep(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setViewSetup(hasResult);
    setFocusStep(n as 1 | 2);
    window.setTimeout(() => {
      if (n === 2) document.getElementById('character-assignments-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 60);
  };

  // Lines list belongs to the setup screens, not the finished result.
  const showGeneratedLines = generatedLines.length > 0 && !showResult;

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden bg-[#f6f8fc] pb-24 text-foreground dark:bg-zinc-950">
      {/* Background: one soft wash + a fine grid. Static — nothing here
          animates, so it never costs a repaint while you type. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(37,99,235,0.14),transparent_70%)] dark:bg-[radial-gradient(60%_60%_at_50%_0%,rgba(59,130,246,0.18),transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] dark:[background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)]" />
      </div>

      <div className="container relative z-10 mx-auto max-w-6xl space-y-6 px-4 pb-10 pt-6 sm:pt-8">
        <StudioTopBar progress={progress} active={active} canOpen={canOpen} onOpen={openStep} />

        {hasResult && viewSetup && (
          <button
            type="button"
            onClick={() => openStep(3)}
            className="anim-studio-rise flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-left text-sm font-semibold text-emerald-700 transition-transform active:scale-[0.99] dark:text-emerald-300"
          >
            <span className="min-w-0 truncate">{isAudioReady ? 'Your audio is ready' : 'Your audio is being created'}</span>
            <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs text-white">Open</span>
          </button>
        )}

        {/* key forces a clean unmount/remount instead of React trying to
            reconcile ScriptEditor/CharacterAssignments/StudioDemoCard against
            each other when several flags (Firestore hqProject snapshot +
            isGenerating) flip in the same render — this was the likely source
            of the insertBefore/removeChild NotFoundError crashes on /studio. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3" key={showResult ? 'result' : 'editor'}>
          
          {/* PURGE EDITOR ON HQ SUBMISSION OR WHEN AUDIO IS READY */}
          {!showResult && (
            <div className="anim-studio-rise min-w-0 space-y-6 lg:col-span-2">
              <ScriptEditor />
            </div>
          )}

          <div className={cn(
              "anim-studio-rise min-w-0 space-y-6",
              showResult ? "lg:col-span-3 max-w-2xl mx-auto w-full" : "lg:col-span-1"
          )}>
            {(scriptState === 'valid' || showResult) ? (
              <div className="space-y-6 pb-12 lg:sticky lg:top-24">
                {/* PURGE ASSIGNMENTS ON HQ SUBMISSION OR WHEN AUDIO IS READY */}
                {!showResult && <CharacterAssignments forceSetup={hasResult} />}

                {/* Re-generating is only offered once the previous job has finished. */}
                <GenerationSettings forceSetup={!showResult && hasResult && isAudioReady} />
                
                {/* Progress bar card for standard fast mode only while generating */}
                {generationMode === 'fast' && (isGenerating || isFinalizing) && <GenerationProgress />}
              </div>
            ) : (
                <StudioDemoCard />
            )}
          </div>

        </div>

        {/* Dialogues placed at the very bottom below Generate button & all controls */}
        {showGeneratedLines && (
          <div className="anim-studio-rise w-full min-w-0 pt-2">
            <GeneratedLines />
          </div>
        )}

      </div>
    </div>
  );
}

export default function StudioPage() {
    // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
    // silently rendering the full studio (previously this page had no guard
    // at all, so anyone could open and use the editor while logged out).
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        if (!authLoading && !user) {
            toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use the AI Studio.' });
            router.push('/login');
        }
    }, [authLoading, user, router, toast]);

    if (authLoading || !user) {
        return (
            <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <StudioProvider>
            <StudioContent />
        </StudioProvider>
    );
}
