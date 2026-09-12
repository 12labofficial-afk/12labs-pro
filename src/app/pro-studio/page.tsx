
'use client';

import { ProStudioProvider, useProStudio } from '@/context/pro-studio-provider';
import { ScriptEditor } from '@/components/pro-studio/script-editor';
import { CharacterAssignments } from '@/components/pro-studio/character-assignments';
import { GenerationSettings } from '@/components/pro-studio/generation-settings';
import { ElevenLabsVoicePicker, type ElevenLabsVoice } from '@/components/pro-studio/elevenlabs-voice-picker';
import { Sparkles, Zap, Loader2, Activity, Play, Pause, Music, Volume2, Lock } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { cn, getDisplayUrl } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useDatabase } from '@/firebase';
import { ref } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';

import { StudioDemoCard } from '@/components/studio/studio-demo-card';

// 🎙️ Which voice engine Pro Studio generates with. "gemini" is the
// existing Live-API engine (ScriptEditor/CharacterAssignments/
// GenerationSettings below, unchanged). "elevenlabs" is the new 11Labs
// Studio — same script-analysis pipeline (analyzeScript / scriptState
// come from the SAME useProStudio() context either way), different
// voice source + different look, per spec: analysis method stays
// shared, look and voice catalog do not.
type VoiceEngine = 'gemini' | 'elevenlabs';

function ProStudioContent() {
  const {
    scriptState, hqProject, hqProjectId, isGenerating, isAnalyzing,
    engine, setEngine, elevenLabsVoiceId, setElevenLabsVoiceId,
  } = useProStudio();
  // Picker needs the full voice object (name/preview) for display; only
  // the id actually gets sent to generation (context's elevenLabsVoiceId).
  const [elevenLabsVoice, setElevenLabsVoice] = useState<ElevenLabsVoice | null>(null);

  // 🔒 ADMIN TOGGLE — same toolSettings/{id}.locked switch as every other
  // tool on the admin Protocol Matrix (src/app/admin/page.tsx's
  // adminTools list, id: "11labs-studio"). Only gates the 11Labs TAB —
  // Pro Studio's existing Gemini flow is unaffected either way.
  const database = useDatabase();
  const [elevenLabsLocked, setElevenLabsLocked] = useState(false);
  useEffect(() => {
    if (!database) return;
    const lockRef = ref(database, 'toolSettings/11labs-studio/locked');
    const unsubscribe = onRtdbValue(lockRef, (snap) => setElevenLabsLocked(snap.val() === true));
    return () => unsubscribe();
  }, [database]);
  useEffect(() => {
    if (elevenLabsLocked && engine === 'elevenlabs') setEngine('gemini');
  }, [elevenLabsLocked, engine, setEngine]);

  // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
  // silently rendering the full Pro Studio (this page had no guard at all,
  // same bug that was previously fixed on /new-ai-studio — anyone could
  // open and use the editor while logged out).
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use Pro Studio.' });
      router.push('/login');
    }
  }, [authLoading, user, router, toast]);

  if (authLoading || !user) {
    return (
      <div className="relative min-h-screen bg-muted/30 pb-20 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Hardened Purge logic during submission or analysis
  const isHqActive = hqProjectId || (hqProject && (hqProject.status === 'in_queue' || hqProject.status === 'processing'));

  return (
    <div className="relative min-h-screen bg-muted/30 pb-20">
      <div className="container mx-auto max-w-7xl py-10 px-4">
        {!isHqActive && (
          <div className="mb-6 flex justify-center">
            <Tabs value={engine} onValueChange={(v) => setEngine(v as VoiceEngine)}>
              <TabsList>
                <TabsTrigger value="gemini" className="gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> Gemini Live
                </TabsTrigger>
                <TabsTrigger value="elevenlabs" disabled={elevenLabsLocked} className="gap-1.5">
                  {elevenLabsLocked ? <Lock className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />} 11Labs Studio
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {!isHqActive && (
            <div className="lg:col-span-2 space-y-8 animate-in fade-in slide-in-from-left-4 duration-700">
              {/* Same script editor / same analysis pipeline (useProStudio's
                  analyzeScript) regardless of engine — only the voice source
                  downstream of it differs. */}
              <ScriptEditor />
              {engine === 'elevenlabs' && (
                <ElevenLabsVoicePicker
                  selectedVoiceId={elevenLabsVoice?.voice_id}
                  onSelect={(v) => {
                    setElevenLabsVoice(v);
                    setElevenLabsVoiceId(v.voice_id);
                  }}
                />
              )}
            </div>
          )}

          <div className={cn(
              "space-y-8 mt-4 lg:mt-0 animate-in fade-in duration-700",
              isHqActive ? "lg:col-span-3 max-w-2xl mx-auto w-full" : "lg:col-span-1"
          )}>
            {scriptState === 'valid' || isHqActive ? (
              <div className="space-y-8 lg:sticky lg:top-24 pb-12">
                {!isHqActive && engine === 'gemini' && <CharacterAssignments />}
                {!isHqActive && engine === 'elevenlabs' && !elevenLabsVoice && (
                  <div className="rounded-lg border border-dashed border-violet-500/30 p-4 text-sm text-muted-foreground text-center">
                    Pick a voice from the 11Labs library on the left to continue.
                  </div>
                )}
                <GenerationSettings />
              </div>
            ) : (
                <StudioDemoCard 
                  title={engine === 'elevenlabs' ? '11LABS ENGINE READY' : 'PRO ENGINE READY'}
                  badgeText={engine === 'elevenlabs' ? 'FULL VOICE LIBRARY' : '50% CHEAPER NOW'}
                  subtitle="Analyze manuscript to initiate Neural Node" 
                />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProStudioPage() {
    return (
        <ProStudioProvider>
            <ProStudioContent />
        </ProStudioProvider>
    );
}
