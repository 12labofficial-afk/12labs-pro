'use client';

import { useState, useEffect, useMemo } from 'react';
import { useStudio } from '@/context/studio-provider';
import { useAuth } from '@/context/auth-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { isDialogueTooShort, MIN_DIALOGUE_WORDS } from '@/lib/dialogue-validation';
import { EmotionCapsules } from './emotion-capsules';
import { expandDialogueWithAiAction } from '@/app/studio/ai-fix-actions';
import { reportClientError } from '@/lib/report-client-error';
import { AlertTriangle, Sparkles, Loader2, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

interface ResolveDialoguesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onGenerateAnyway: () => void;
    onAllResolved: () => void;
}

/**
 * Pre-generate validation gate for the Studio's Generate button
 * (generation-settings.tsx). Too-short dialogue lines (see
 * lib/dialogue-validation.ts) tend to come out broken/unnatural from the
 * TTS engine, so this walks the user through fixing each one — manually,
 * or via a paid AI-Fix (Gemini 2.5 Flash Lite) — one at a time, with an
 * emotion capsule editor alongside, before letting generation proceed.
 * "Generate Anyway" is always available as an explicit override.
 */
export function ResolveDialoguesDialog({ open, onOpenChange, onGenerateAnyway, onAllResolved }: ResolveDialoguesDialogProps) {
    const { generatedLines, updateGeneratedLine } = useStudio();
    const { activeUid, activeUser, user, setUser } = useAuth();
    const { toast } = useToast();

    // Captured once when the dialog opens, so the progress count ("2 of 5")
    // stays stable as issues get resolved instead of shrinking under the user.
    const [trackedIds, setTrackedIds] = useState<string[]>([]);
    // 🔴 FIX: `current` used to always be `remainingIssues[0]` — the flow
    // could only ever move forward as lines got resolved, with no way to go
    // back and re-check/edit an earlier one. This indexes into `trackedIds`
    // directly so Previous/Next can move freely across every flagged line,
    // resolved or not.
    const [currentIndex, setCurrentIndex] = useState(0);
    const [text, setText] = useState('');
    const [emotion, setEmotion] = useState('Neutral');
    const [isAiFixing, setIsAiFixing] = useState(false);

    const remainingIssues = useMemo(
        () => generatedLines.filter((l) => trackedIds.includes(l.id) && isDialogueTooShort(l.dialogue)),
        [generatedLines, trackedIds]
    );
    const resolvedCount = trackedIds.length - remainingIssues.length;
    const currentId = trackedIds[currentIndex];
    const current = generatedLines.find((l) => l.id === currentId);
    const isCurrentStillShort = current ? isDialogueTooShort(current.dialogue) : false;

    useEffect(() => {
        if (!open) return;
        const ids = generatedLines.filter((l) => isDialogueTooShort(l.dialogue)).map((l) => l.id);
        setTrackedIds(ids);
        setCurrentIndex(0);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (current) {
            setText(current.dialogue);
            setEmotion(current.emotion || 'Neutral');
        }
    }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (open && trackedIds.length > 0 && remainingIssues.length === 0) {
            onOpenChange(false);
            onAllResolved();
        }
    }, [open, trackedIds.length, remainingIssues.length]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!current) return null;

    const goToPrevious = () => setCurrentIndex((i) => Math.max(0, i - 1));
    const goToNext = () => setCurrentIndex((i) => Math.min(trackedIds.length - 1, i + 1));

    const handleSaveAndNext = () => {
        if (isDialogueTooShort(text)) {
            toast({ variant: 'destructive', title: 'Still Too Short', description: `Needs at least ${MIN_DIALOGUE_WORDS} words.` });
            return;
        }
        updateGeneratedLine(current.id, { dialogue: text, emotion });
        // Jump to the next line (after this one) that's still flagged, so
        // Save & Next keeps skipping past ones already fixed — Previous/Next
        // below still let the user step through every line one at a time.
        for (let i = currentIndex + 1; i < trackedIds.length; i++) {
            const line = generatedLines.find((l) => l.id === trackedIds[i]);
            if (line && isDialogueTooShort(line.dialogue)) {
                setCurrentIndex(i);
                return;
            }
        }
    };

    const handleAiFix = async () => {
        if (!activeUid) return;
        // 🔴 FIX: this used to send `current.dialogue` — the line's ORIGINAL
        // flagged text — ignoring whatever the user had already typed into
        // the textarea below. Any edit made before pressing AI-Fix was
        // silently discarded, and for a line flagged for being empty, this
        // meant AI-Fix always failed with "Empty dialogue line" no matter
        // what the user typed, because it never looked at their input.
        if (!text.trim()) {
            toast({ variant: 'destructive', title: 'Nothing to Expand', description: 'Type at least a word or two first, then AI-Fix can expand it.' });
            return;
        }
        setIsAiFixing(true);
        try {
            // 🔴 FIX: this used to dump the ENTIRE script and let the server
            // blindly slice(0, 2000) chars off the front — for any line past
            // roughly the first 2000 characters (i.e. most lines in a script
            // long enough to have 40+ dialogues), the model never actually
            // saw that line's real neighbors, so it had no way to match the
            // ongoing tense/gender/continuity (e.g. "aa gaya" vs "aa gayi")
            // of the conversation actually happening around it. Send a
            // window of the ACTUAL surrounding lines instead, with the line
            // being fixed clearly marked.
            const lineArrayIndex = generatedLines.findIndex((l) => l.id === current.id);
            const CONTEXT_WINDOW = 5;
            const start = Math.max(0, lineArrayIndex - CONTEXT_WINDOW);
            const end = lineArrayIndex === -1 ? generatedLines.length : lineArrayIndex + CONTEXT_WINDOW + 1;
            const windowedContext = generatedLines
                .slice(start, end)
                .map((l) => (l.id === current.id ? `>>> ${l.characterName}: ${text} <<< (THIS IS THE LINE TO FIX)` : `${l.characterName}: ${l.dialogue}`))
                .join('\n');
            const result = await expandDialogueWithAiAction(activeUid, text, current.characterName, windowedContext);
            if (!result.success || !result.expandedText) throw new Error(result.error);
            setText(result.expandedText);
            if (result.newCredits !== undefined) setUser({ ...user, credits: result.newCredits } as any);
            toast({ title: 'AI-Fix Applied', description: 'Review the line below, then Save & Next.' });
        } catch (e: any) {
            reportClientError('src/components/studio/resolve-dialogues-dialog.tsx:handleAiFix', e);
            toast({ variant: 'destructive', title: 'AI-Fix Failed', description: e.message || 'Could not expand this line.' });
        } finally {
            setIsAiFixing(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Fix Dialogues Before Generating
                    </DialogTitle>
                    <DialogDescription>
                        These lines are too short for the AI voice to perform naturally. Fix each one, or generate anyway.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap gap-1 min-w-0">
                            {trackedIds.map((id, idx) => {
                                const line = generatedLines.find((l) => l.id === id);
                                const stillIssue = line ? isDialogueTooShort(line.dialogue) : false;
                                const isCurrent = currentIndex === idx;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setCurrentIndex(idx)}
                                        title={`Go to line ${idx + 1}`}
                                        className={cn(
                                            "h-2.5 w-2.5 rounded-full transition-transform hover:scale-125",
                                            stillIssue ? "bg-destructive" : "bg-green-500",
                                            isCurrent && "ring-2 ring-primary/40"
                                        )}
                                    />
                                );
                            })}
                        </div>
                        <Badge variant="outline" className="text-[10px] font-bold shrink-0 whitespace-nowrap">{resolvedCount} / {trackedIds.length} Resolved</Badge>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={goToPrevious} disabled={currentIndex === 0}>
                            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                        </Button>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Line {currentIndex + 1} of {trackedIds.length}
                        </span>
                        <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={goToNext} disabled={currentIndex === trackedIds.length - 1}>
                            Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                    </div>

                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <Badge className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-none text-[9px] font-black uppercase">{current.characterName}</Badge>
                            {isCurrentStillShort ? (
                                <Badge variant="outline" className="text-[9px] font-bold text-destructive border-destructive/30">Too Short</Badge>
                            ) : (
                                <Badge variant="outline" className="text-[9px] font-bold text-green-600 border-green-500/30">Resolved</Badge>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Increase this line's length</Label>
                            <Textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                className="min-h-[90px] rounded-xl"
                                placeholder="Add a few more words for natural delivery..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Emotion</Label>
                            <EmotionCapsules value={emotion} onChange={setEmotion} />
                        </div>

                        <div className="flex gap-2 pt-1">
                            <Button variant="outline" className="flex-1" onClick={handleAiFix} disabled={isAiFixing}>
                                {isAiFixing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                AI-Fix
                            </Button>
                            <Button className="flex-1" onClick={handleSaveAndNext} disabled={isAiFixing}>
                                Save &amp; Next <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-col gap-2 items-stretch">
                    <p className="text-[11px] text-muted-foreground text-center">
                        Warning: generating without fixing these lines may cause the AI voice to sound broken or unnatural on the flagged dialogue.
                    </p>
                    <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { onOpenChange(false); onGenerateAnyway(); }}>
                        Generate Anyway
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
