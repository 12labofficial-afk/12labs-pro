
'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useStudio } from '@/context/studio-provider';
import { useAuth } from '@/context/auth-provider';
import { studioCard, StudioCardHeader } from './studio-ui';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2, FileUp, Trash2, Copy, Check, FilePenLine, RotateCcw, Sparkles, Coins, AlertCircle, ShieldAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import mammoth from 'mammoth';
import { cn, formatCredits } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';


import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { reportClientError } from '@/lib/report-client-error';


export function ScriptEditor() {
  const { user } = useAuth();
  const { 
    script, setScript, cleanScript, analyzeScript, isAnalyzing, 
    scriptState, clearStudioState, includeEmotion, setIncludeEmotion,
    dailyAnalysisCount = 0, maxDailyAnalysisLimit = 2, pricing, activeRate
  } = useStudio();
  const { toast } = useToast();
  const [isCopied, setIsCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'original' | 'clean'>('clean');
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const isAnalyzed = scriptState === 'valid';

  // --- AI SCANNING & RANDOMIZED LOGIC ---
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [isThinking, setIsThinking] = useState(false);
  const scriptLines = useMemo(() => script.split('\n').filter(l => l.trim().length > 0), [script]);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const runRandomizedScan = useCallback((index: number) => {
    if (!isAnalyzing || index >= scriptLines.length) {
        setActiveLineIndex(-1);
        setIsThinking(false);
        return;
    }

    setActiveLineIndex(index);
    setIsThinking(false);

    // Randomize next step
    const rand = Math.random();
    let nextIndex = index + 1;
    let delay = 600 + Math.random() * 800; // Standard delay

    if (rand > 0.8) {
        // Multi-line jump (Speed up)
        nextIndex = Math.min(index + Math.ceil(Math.random() * 2), scriptLines.length - 1);
        delay = 400;
    } else if (rand < 0.15) {
        // Thinking pause
        setIsThinking(true);
        delay = 1500 + Math.random() * 1000;
    }

    // Contained Scroll: Only scroll the box, not the window
    lineRefs.current[index]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
    });

    timerRef.current = setTimeout(() => runRandomizedScan(nextIndex), delay);
  }, [isAnalyzing, scriptLines.length]);

  useEffect(() => {
    if (isAnalyzing) {
        runRandomizedScan(0);
    } else {
        if (timerRef.current) clearTimeout(timerRef.current);
        setActiveLineIndex(-1);
        setIsThinking(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isAnalyzing, runRandomizedScan]);

  useEffect(() => {
    if (isAnalyzed) {
        setIsTransitioning(true);
        setTimeout(() => {
            setViewMode('clean');
            setIsTransitioning(false);
        }, 300);
    }
  }, [isAnalyzed]);

  const handleToggleView = (mode: 'original' | 'clean') => {
      if (mode === viewMode) return;
      setIsTransitioning(true);
      setTimeout(() => {
          setViewMode(mode);
          setIsTransitioning(false);
      }, 300);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setScript(e.target?.result as string);
        toast({ title: 'File loaded successfully.' });
      };
      reader.readAsText(file);
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const result = await mammoth.extractRawText({ arrayBuffer });
          setScript(result.value);
          toast({ title: 'DOCX file loaded successfully.' });
        } catch (error) {
        reportClientError('src/components/studio/script-editor.tsx:139', error);
          console.error('Error parsing .docx file:', error);
          toast({ variant: 'destructive', title: 'Error reading .docx file.' });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast({ variant: 'destructive', title: 'Unsupported file type', description: 'Please upload a .txt or .docx file.' });
    }
    if (event.target) event.target.value = '';
  };
  
  const handleCopyToClipboard = () => {
    const textToCopy = isAnalyzed && viewMode === 'clean' ? cleanScript : script;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    toast({ title: 'Script copied!' });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const characterCount = script.length;
  const isMinCharCountValid = characterCount >= 100;
  const isMaxCharCountValid = characterCount <= 30000;
  // Admin panel sets a per-character cost multiplier (e.g. 1.3x). The counter
  // shown to the user should reflect that weighted/billable count, not the
  // raw pasted-text length — this stays in sync with the credits that will
  // actually be deducted. Anything derived from *real* characters (min/max
  // input limits, audio-runtime/minute estimates) must keep using the true
  // `characterCount` and never this weighted number.
  const billableCharacterCount = Math.ceil(characterCount * (activeRate ?? pricing?.normal ?? 1.2));

  const isSponsorOrAdmin = user?.isSponsor === true || user?.role === 'admin';
  const userCredits = Number(user?.credits ?? 0);
  const trimmedCount = script.trim().length;
  const requiredCredits = Math.ceil(trimmedCount * (activeRate ?? pricing?.normal ?? 1.2));
  const isNotEnoughCredits = !isSponsorOrAdmin && trimmedCount > 0 && userCredits < requiredCredits;
  const isDailyLimitReached = !isSponsorOrAdmin && dailyAnalysisCount >= maxDailyAnalysisLimit;
  const isAnalyzeDisabled = !script.trim() || isAnalyzing || !isMinCharCountValid || !isMaxCharCountValid || isNotEnoughCredits || isDailyLimitReached || isAnalyzed;
  const countIsBad = (!isMinCharCountValid && characterCount > 0 && !isAnalyzed) || !isMaxCharCountValid;
  const fillPct = Math.min(100, (characterCount / 30000) * 100);

  return (
    <section className={studioCard}>
      <StudioCardHeader
        icon={<FilePenLine className="h-5 w-5" />}
        title="Script"
        subtitle={isAnalyzing ? 'Reading your script…' : isAnalyzed ? 'Analyzed — characters and lines are ready' : 'Paste or import · min. 100 characters'}
        right={!isAnalyzed ? (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <Coins className="h-3.5 w-3.5" />
            <span className="tabular-nums">{formatCredits(userCredits)}</span>
          </div>
        ) : undefined}
      />

      {isAnalyzed && !isAnalyzing && (
        <div className="px-4 pt-3 sm:px-5">
          <div className="grid grid-cols-2 rounded-xl bg-muted/70 p-1 text-xs font-semibold dark:bg-white/5">
            {(['original', 'clean'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleToggleView(mode)}
                className={cn(
                  'rounded-lg py-2 transition-all duration-300',
                  viewMode === mode ? 'bg-white text-foreground shadow-sm dark:bg-white/15' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {mode === 'original' ? 'Original' : 'Cleaned'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 sm:p-4">
        {isAnalyzing ? (
          <div
            ref={scrollRef}
            className="h-[40vh] min-h-[280px] max-h-[560px] sm:h-[46vh] space-y-1.5 overflow-y-auto overscroll-contain rounded-2xl bg-slate-50 p-3 dark:bg-white/[0.03] sm:p-4"
          >
            {scriptLines.map((line, idx) => (
              <div
                key={idx}
                ref={el => { lineRefs.current[idx] = el; }}
                className={cn(
                  'break-words rounded-xl px-3 py-2 text-[15px] leading-relaxed transition-all duration-500',
                  activeLineIndex === idx
                    ? 'bg-primary/10 font-semibold text-foreground ring-1 ring-primary/25'
                    : 'text-foreground/55',
                )}
              >
                {activeLineIndex === idx && (
                  isThinking
                    ? <Loader2 className="mr-2 inline-block h-3.5 w-3.5 animate-spin text-primary" />
                    : <Sparkles className="mr-2 inline-block h-3.5 w-3.5 text-primary" />
                )}
                {line}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative">
            <Textarea
              placeholder={'Paste your script here…\n\nExample:\nNarrator: Ek chhota sa gaon tha…\nRaju: Maa, main school ja raha hoon!'}
              className={cn(
                'h-[40vh] min-h-[280px] max-h-[560px] sm:h-[46vh] resize-none rounded-2xl border-0 bg-slate-50 p-4 pb-12 text-[16px] leading-7 text-foreground shadow-none transition-all duration-300 placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0 dark:bg-white/[0.03] sm:p-5 sm:pb-12',
                isAnalyzed && 'cursor-default text-foreground/85',
                isTransitioning ? 'scale-[0.99] opacity-0' : 'scale-100 opacity-100',
              )}
              value={isAnalyzed && viewMode === 'clean' ? cleanScript : script}
              onChange={(e) => {
                if (isAnalyzed) return;
                setScript(e.target.value);
              }}
              readOnly={isAnalyzed}
            />
            {/* Length meter lives inside the editor's corner, so the toolbar
                never wraps when Copy appears. */}
            {!isAnalyzed && (
              <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/90 py-1 pl-2.5 pr-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-800/90">
                <div className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-muted min-[380px]:block">
                  <div className={cn('h-full rounded-full transition-all duration-500', countIsBad ? 'bg-destructive' : 'bg-primary')} style={{ width: `${fillPct}%` }} />
                </div>
                <span className={cn('whitespace-nowrap text-xs font-semibold tabular-nums', countIsBad ? 'text-destructive' : 'text-foreground')}>
                  {billableCharacterCount.toLocaleString()}
                  <span className="font-normal text-muted-foreground">/30k</span>
                </span>
                {characterCount > 0 ? (
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => setScript('')}
                    aria-label="Clear script"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : <span className="w-1.5" />}
              </div>
            )}
          </div>
        )}

        {isAnalyzed && !isAnalyzing && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCopyToClipboard}
              className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-transform active:scale-95 dark:border-white/10 dark:bg-white/5"
            >
              {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-primary" />}
              {isCopied ? 'Copied' : viewMode === 'clean' ? 'Copy cleaned script' : 'Copy original'}
            </button>
          </div>
        )}

        {/* Toolbar */}
        {!isAnalyzed && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Label htmlFor="file-upload" className={cn(isAnalyzing ? 'pointer-events-none opacity-40' : 'cursor-pointer')}>
              <span className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-transform active:scale-95 dark:border-white/10 dark:bg-white/5">
                <FileUp className="h-3.5 w-3.5 text-primary" /> Import
              </span>
            </Label>
            <input id="file-upload" type="file" className="hidden" accept=".txt,.docx" onChange={handleFileChange} disabled={isAnalyzed || isAnalyzing} />

            <label htmlFor="include-emotion-chk" className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-black/[0.06] bg-white px-3 py-1.5 text-xs font-semibold shadow-sm dark:border-white/10 dark:bg-white/5">
              <Checkbox
                id="include-emotion-chk"
                checked={includeEmotion}
                onCheckedChange={(val) => setIncludeEmotion(val as boolean)}
                disabled={isAnalyzing}
                className="h-4 w-4 rounded-[5px] border-border data-[state=checked]:border-primary data-[state=checked]:bg-primary"
              />
              Emotions
            </label>

            {characterCount > 0 && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCopyToClipboard}
                className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-transform active:scale-95 animate-in fade-in zoom-in-95 duration-200 dark:border-white/10 dark:bg-white/5"
              >
                {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-primary" />}
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            )}

          </div>
        )}
      </div>

      {/* Action */}
      <div className="space-y-3 border-t border-black/[0.05] p-4 dark:border-white/10 sm:p-5">
        {isAnalyzed ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-12 w-full rounded-2xl border-destructive/25 font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive">
                <RotateCcw className="mr-2 h-4 w-4" /> Start over
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Start a new script?</AlertDialogTitle>
                <AlertDialogDescription>This clears the current script, characters and any generated lines.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={clearStudioState}>Start over</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <>
            {isNotEnoughCredits && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-destructive/[0.06] px-3.5 py-3 text-sm font-medium text-destructive animate-in fade-in slide-in-from-bottom-1">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Not enough credits — top up or shorten the script.
              </div>
            )}
            {isDailyLimitReached && !isNotEnoughCredits && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-amber-500/10 px-3.5 py-3 text-sm font-medium text-amber-700 dark:text-amber-300 animate-in fade-in slide-in-from-bottom-1">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                Daily analysis limit reached ({dailyAnalysisCount}/{maxDailyAnalysisLimit}). Try again tomorrow.
              </div>
            )}
            <Button
              onClick={analyzeScript}
              disabled={isAnalyzeDisabled}
              className={cn(
                'anim-studio-sheen h-14 w-full rounded-2xl text-base font-bold transition-all duration-200 active:scale-[0.98]',
                isAnalyzeDisabled && !isAnalyzing
                  ? 'bg-muted text-muted-foreground shadow-none'
                  : 'bg-gradient-to-r from-primary to-indigo-500 text-white shadow-lg shadow-primary/30 hover:brightness-105',
              )}
            >
              {isAnalyzing ? (
                <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Analyzing script…</span>
              ) : isNotEnoughCredits ? (
                <span className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /> Not enough credits</span>
              ) : isDailyLimitReached ? (
                <span className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Daily limit reached</span>
              ) : (
                <span className="relative z-[2] flex items-center gap-2"><Wand2 className="h-5 w-5" /> Analyze with AI</span>
              )}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
