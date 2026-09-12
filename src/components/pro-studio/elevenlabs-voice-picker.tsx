'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, Pause, Search, Sparkles, Library, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useDatabase } from '@/firebase';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { ref } from 'firebase/database';

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  preview_url?: string | null;
  labels?: Record<string, any>;
  category?: string;
  source?: 'account' | 'library';
}

interface ElevenLabsVoicePickerProps {
  selectedVoiceId?: string | null;
  onSelect: (voice: ElevenLabsVoice) => void;
  className?: string;
}

const RENDER_LIMIT = 60; // cap DOM rows per render — the library runs into the thousands

/**
 * Pure listener — no push, no request node. server-files/11.py refreshes
 * `11_voice_catalog` on its own schedule (startup + periodically) and
 * this just reads whatever is there right now.
 */
export function ElevenLabsVoicePicker({ selectedVoiceId, onSelect, className }: ElevenLabsVoicePickerProps) {
  const database = useDatabase();
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [query, setQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!database) return;
    const catalogRef = ref(database, '11_voice_catalog');
    const unsubscribe = onRtdbValue(catalogRef, (snapshot) => {
      const data = snapshot.val();
      const list: ElevenLabsVoice[] = Array.isArray(data?.voices) ? data.voices : [];
      setVoices(list);
      setStatus(list.length > 0 ? 'ready' : 'empty');
    }, 'pro-studio:11-voice-catalog');
    return () => unsubscribe();
  }, [database]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter((v) => {
      const haystack = [
        v.name,
        v.labels?.gender,
        v.labels?.accent,
        v.labels?.language,
        v.labels?.use_case,
        v.labels?.description,
        v.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [voices, query]);

  const visible = filtered.slice(0, RENDER_LIMIT);

  const togglePreview = (voice: ElevenLabsVoice) => {
    if (!voice.preview_url) return;
    if (playingId === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    audio.play().catch(() => {});
    audio.onended = () => setPlayingId(null);
    setPlayingId(voice.voice_id);
  };

  return (
    <div className={cn('rounded-xl border border-violet-500/20 bg-gradient-to-b from-violet-500/[0.03] to-transparent p-4 space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold tracking-tight">11Labs Voice Library</h3>
        {status === 'ready' && <Badge variant="outline" className="ml-auto text-xs border-violet-500/30 text-violet-500">{voices.length.toLocaleString()} voices</Badge>}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, accent, language, gender…"
          className="pl-8 h-9"
        />
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading voice library…
        </div>
      )}

      {status === 'empty' && (
        <div className="text-sm text-muted-foreground py-6 text-center">Voice library is empty right now — try again shortly.</div>
      )}

      {status === 'ready' && filtered.length === 0 && (
        <div className="text-sm text-muted-foreground py-6 text-center">No voices match "{query}".</div>
      )}

      {status === 'ready' && visible.length > 0 && (
        <div className="max-h-80 overflow-y-auto -mx-1 px-1 space-y-1.5">
          {visible.map((voice) => {
            const isSelected = selectedVoiceId === voice.voice_id;
            const isPlaying = playingId === voice.voice_id;
            return (
              <div
                key={voice.voice_id}
                onClick={() => onSelect(voice)}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors',
                  isSelected
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-border hover:border-violet-500/40 hover:bg-violet-500/[0.04]'
                )}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePreview(voice);
                  }}
                  disabled={!voice.preview_url}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-500 disabled:opacity-30"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{voice.name}</span>
                    {voice.source === 'account' ? (
                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <Library className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {[voice.labels?.gender, voice.labels?.accent, voice.labels?.language]
                      .filter(Boolean)
                      .slice(0, 3)
                      .map((label, i) => (
                        <span key={i} className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {label}
                          {i < 2 ? ' ·' : ''}
                        </span>
                      ))}
                  </div>
                </div>

                {isSelected && <Badge className="bg-violet-500 hover:bg-violet-500 text-white shrink-0">Selected</Badge>}
              </div>
            );
          })}
          {filtered.length > RENDER_LIMIT && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              Showing first {RENDER_LIMIT} of {filtered.length.toLocaleString()} matches — refine your search for more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
