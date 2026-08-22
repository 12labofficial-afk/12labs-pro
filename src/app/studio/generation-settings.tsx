
'use client';

import { useStudio } from '@/context/studio-provider';
import { useAuth } from '@/context/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, AlertTriangle, Sparkles, Clock, Coins, Play, Pause, FileText, Loader2, Cpu, Info } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import React, { useState, useEffect } from 'react';
import { initializeFirebase } from '@/firebase';
import { ref, onValue } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

const GENRE_IMAGES: Record<string, string> = {
  'horror': 'https://storage.12labs.in/Uploaded%20previews/horror_story_preview.webp',
  'documentary': 'https://storage.12labs.in/Uploaded%20previews/20260820_095435.jpg',
  'tooni chidiya': 'https://storage.12labs.in/Uploaded%20previews/tooni_chidiya_stories_preview-1.webp',
  'animals': 'https://storage.12labs.in/Uploaded%20previews/animals_story_preview.webp',
  'moral': 'https://storage.12labs.in/Uploaded%20previews/moral_story_preview.webp'
};

export function GenerationSettings() {
    const { user } = useAuth();
    const { 
        characters, 
        handleGeneration, 
        isGenerating, 
        hqProject, 
        isHqProjectLoading, 
        generatedAudio, 
        generatedAudioUrl,
        scriptAnalysis, 
        generationMode, 
        setGenerationMode, 
        isPaused, 
        togglePause,
        isFinalizing,
        projectName,
        generatedLines,
        isPremiumOnlyMode,
        showPremiumBlock,
        hqProjectId,
        selectedGenre,
        setSelectedGenre
    } = useStudio();
    const router = useRouter();
    const { toast } = useToast();

    const [isFastGenLocked, setIsFastGenLocked] = useState(false);
    const [isLoadingSettings, setIsLoadingSettings] = useState(true);
    const { database } = initializeFirebase();
    
    const isAdmin = user?.role === 'admin';
    const isSponsor = user?.isSponsor === true;
    const isPaidUser = user?.hasMadeFirstPurchase === true || (user?.totalInvestment || 0) > 0;
    
    // Limits updated: Cost > 5000 credits always use HQ for regular users.
    const isCostTooHighForFastGen = scriptAnalysis ? scriptAnalysis.cost > 5000 : false;

    useEffect(() => {
        if (!database) {
            setIsLoadingSettings(false);
            return;
        }
        const fastGenLockRef = ref(database, 'toolSettings/fast-generation');
        const unsubscribe = onValue(fastGenLockRef, (snapshot) => {
            const setting = snapshot.val();
            const locked = setting?.locked === true;
            
            // CRITICAL: Admin bypasses the global 'fast-generation' lock
            if (isAdmin) {
                setIsFastGenLocked(false);
            } else {
                setIsFastGenLocked(locked);
                if (locked && generationMode === 'fast') {
                    setGenerationMode('high-quality');
                }
            }
            setIsLoadingSettings(false);
        });

        return () => unsubscribe();
    }, [database, generationMode, setGenerationMode, isAdmin]);
    
    useEffect(() => {
        // High cost check still applies unless user is Admin/Sponsor
        if (scriptAnalysis && isCostTooHighForFastGen && generationMode === 'fast' && !isAdmin && !isSponsor) {
            setGenerationMode('high-quality');
            toast({
                title: 'Switched to SuperFast ⚡⚡',
                description: 'Fast Generation is limited to 5,000 credits.',
                variant: 'default',
            });
        }
    }, [scriptAnalysis, isCostTooHighForFastGen, generationMode, setGenerationMode, toast, isAdmin, isSponsor]);


    const allLinesDone = generatedLines.length > 0 && generatedLines.every(l => l.status === 'done');

    // 🔥 PURGE CHECK: Immediately return null if submission is active
    const isHqActive = hqProjectId || (hqProject && (hqProject.status === 'in_queue' || hqProject.status === 'processing'));
    if (!scriptAnalysis || isHqActive || isHqProjectLoading || generatedAudio || generatedAudioUrl || isFinalizing || allLinesDone) {
        return null;
    }
    
    if (isLoadingSettings) {
        return (
            <Card className="rounded-[2rem]">
                <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        )
    }

    const canAfford = user && user.credits >= scriptAnalysis.cost;
    const allVoicesAssigned = characters.length > 0 && characters.every(c => c.voice && c.voice.trim() !== '');
    const isProjectNameSet = projectName && projectName.trim() !== '';
    const isReady = allVoicesAssigned && isProjectNameSet;

    /** ⏱️ TIME ESTIMATION NODE */
    const estimatedTotalSeconds = scriptAnalysis.characterCount * 0.06;
    const estimatedMinutes = Math.floor(estimatedTotalSeconds / 60);
    const estimatedSeconds = Math.round(estimatedTotalSeconds % 60);
    const formattedTime = `${String(estimatedMinutes).padStart(2, '0')}:${String(estimatedSeconds).padStart(2, '0')}`;
    
    const originalCost = Math.round(scriptAnalysis.characterCount * 2);
    const currentCost = scriptAnalysis.cost;
    const isFastGenDisabled = isFastGenLocked || (isCostTooHighForFastGen && !isAdmin && !isSponsor);

    const handleStartClick = () => {
        if (isPremiumOnlyMode && !isAdmin && !isSponsor && !isPaidUser) {
            showPremiumBlock();
            return;
        }
        handleGeneration();
    };

    return (
        <Card className="border-none shadow-2xl bg-card overflow-hidden rounded-[2rem]">
            <CardHeader className="bg-primary/5 pb-6 border-b border-primary/10">
                <div className="flex items-center gap-4">
                     <div className="p-3 bg-primary/10 rounded-2xl shadow-inner">
                        <Zap className="h-6 w-6 text-primary"/>
                     </div>
                     <div>
                        <CardTitle className="text-xl font-black uppercase tracking-tight">Engine Core</CardTitle>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Select Generation Mode</p>
                     </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-8 pt-8">
                <div className="rounded-[2rem] border p-6 space-y-4 bg-muted/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <Sparkles className="h-24 w-24" />
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 px-1">
                        <span>Engine Metrics</span>
                        <Badge variant="outline" className="border-primary/20 text-primary font-black">STABLE</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Dialogues</p>
                            <p className="text-2xl font-black font-mono leading-none">{(scriptAnalysis?.dialogueCount || 0).toLocaleString()}</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Est. Runtime</p>
                            <p className="text-2xl font-black font-mono leading-none">{formattedTime}</p>
                        </div>
                    </div>
                    <Separator className="opacity-50" />
                     <div className="flex justify-between items-end">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Credit Cost</p>
                             <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-muted-foreground/50 line-through text-sm">{originalCost.toLocaleString()}</span>
                                <span className="font-mono font-black text-3xl text-primary leading-none">{currentCost.toLocaleString()}</span>
                                <Badge className="bg-destructive text-white text-[8px] font-black px-1.5 h-4 mb-2 animate-pulse">-40%</Badge>
                            </div>
                        </div>
                    </div>
                </div>

                {!isGenerating && !isPaused && (
                    <RadioGroup 
                        value={generationMode}
                        onValueChange={(value) => setGenerationMode(value as any)} 
                        className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
                    >
                        <Label 
                            htmlFor="high-quality" 
                            className={cn(
                                "flex items-start space-x-4 rounded-3xl border p-6 transition-all duration-500 cursor-pointer relative overflow-hidden shadow-sm",
                                "bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-purple-950/20 dark:via-background dark:to-blue-900/40",
                                "has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:checked]:scale-[1.02] has-[:checked]:shadow-2xl has-[:checked]:shadow-primary/10"
                            )}
                        >
                            <RadioGroupItem value="high-quality" id="high-quality" className="mt-1" />
                            <div className="font-normal flex-1 space-y-1">
                                <div className="font-black text-lg flex items-center gap-2 uppercase tracking-tight">SuperFast ⚡⚡</div>
                                <p className="text-xs text-muted-foreground font-semibold leading-relaxed opacity-80">Server-side neural rendering. Broadcast quality. Deep emotion. (Fast Cluster).</p>
                            </div>
                        </Label>

                        {!isFastGenDisabled && (
                            <Label 
                                htmlFor="fast" 
                                className={cn(
                                    "flex items-start space-x-4 rounded-3xl border p-6 transition-all duration-500 cursor-pointer relative overflow-hidden group shadow-sm",
                                    "bg-gradient-to-br from-orange-50 via-white to-green-50 dark:from-orange-950/20 dark:via-background dark:to-green-950/20",
                                    "has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:checked]:scale-[1.02] has-[:checked]:shadow-2xl has-[:checked]:shadow-primary/10"
                                )}
                            >
                                <RadioGroupItem value="fast" id="fast" className="mt-1" />
                                <div className="font-normal flex-1 space-y-1">
                                    <div className="font-black text-lg flex items-center gap-2 uppercase tracking-tight">
                                        Standard Fast
                                    </div>
                                    <p className="text-xs text-muted-foreground font-semibold leading-relaxed opacity-80">Browser-level live synthesis. Standard emotion. Delivery in 5-15m.</p>
                                </div>
                            </Label>
                        )}
                    </RadioGroup>
                )}

                {!isGenerating && !isPaused && generationMode === 'high-quality' && (
                    <div className="space-y-2.5 rounded-3xl border border-border/60 p-6 bg-muted/15 dark:bg-white/[0.01] animate-in fade-in slide-in-from-top-2 duration-300">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 text-primary animate-pulse" /> Select Genre
                        </Label>
                        <Select value={selectedGenre} onValueChange={(v) => setSelectedGenre(v)}>
                            <SelectTrigger className="h-12 rounded-xl bg-muted/20 font-bold border-primary/5 text-foreground">
                                <SelectValue placeholder="Select genre" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl bg-popover text-popover-foreground border border-border">
                                <SelectItem value="horror">Horror</SelectItem>
                                <SelectItem value="documentary">Documentary</SelectItem>
                                <SelectItem value="tooni chidiya">Tooni Chidiya</SelectItem>
                                <SelectItem value="animals">Animals</SelectItem>
                                <SelectItem value="moral">Moral</SelectItem>
                            </SelectContent>
                        </Select>
                        {GENRE_IMAGES[selectedGenre] && (
                            <div className="relative w-full aspect-[16/9] mt-3 rounded-2xl overflow-hidden border border-border/40 shadow-inner animate-in fade-in zoom-in-95 duration-300">
                                <Image 
                                    src={GENRE_IMAGES[selectedGenre]} 
                                    alt={`${selectedGenre} preview`} 
                                    fill 
                                    className="object-cover"
                                    referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-4">
                                    <span className="text-white text-xs font-black uppercase tracking-wider bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
                                        {selectedGenre}
                                    </span>
                                </div>
                            </div>
                        )}
                        <p className="text-[10px] text-muted-foreground font-semibold">Tuning voice synthesis specifically for this category.</p>
                    </div>
                )}

                {!canAfford && user && (
                     <div className="flex items-center gap-4 text-xs font-black text-destructive p-5 bg-destructive/10 rounded-[2rem] border border-destructive/20">
                        <AlertTriangle className="h-6 w-6 flex-shrink-0" />
                        <div className="space-y-1">
                            <p className="uppercase tracking-widest">Insufficient Credits ({user.credits}/{currentCost})</p>
                            <Button variant="link" className="p-0 h-auto text-[10px] font-black text-primary underline uppercase tracking-widest" onClick={() => router.push('/buy-credits')}>
                                Buy Credits
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter className="p-8 pt-0 flex flex-col gap-4">
                 {isGenerating ? (
                     <Button 
                        onClick={togglePause} 
                        variant="secondary"
                        className="w-full h-14 text-lg font-black rounded-2xl shadow-lg border-2 border-primary/10 uppercase transition-all active:scale-95 group"
                     >
                        <Pause className="mr-3 h-6 w-6 fill-current text-primary" />
                        PAUSE PRODUCTION
                     </Button>
                 ) : isPaused ? (
                    <Button 
                        onClick={togglePause} 
                        className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/30 btn-shine transition-all active:scale-95 group"
                    >
                        <Play className="mr-3 h-8 w-8 fill-current group-hover:scale-110 transition-transform" />
                        RESUME ENGINE
                    </Button>
                 ) : (
                    <Button 
                        onClick={handleStartClick} 
                        disabled={isFinalizing || !canAfford || !isReady || (isFastGenDisabled && generationMode === 'fast')} 
                        className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/30 btn-shine uppercase transition-all active:scale-95 group"
                    >
                        <div className="flex items-center justify-center w-full">
                            {isFinalizing ? (
                                <><Loader2 className="mr-3 h-8 w-8 animate-spin" /> FINALIZING MASTER...</>
                            ) : (
                                <div className="flex items-center gap-4">
                                    <Sparkles className="h-8 w-8 fill-current group-hover:rotate-12 transition-transform" />
                                    <span className="uppercase tracking-tighter">Start {generationMode === 'high-quality' ? 'SuperFast' : 'Generation'}</span>
                                </div>
                            )}
                        </div>
                    </Button>
                 )}

                {(!isReady && !isGenerating && !isPaused) && (
                    <div className="animate-history-blink flex flex-col items-center justify-center gap-1.5 p-3 rounded-[1.5rem] bg-destructive/10 text-destructive border border-destructive/20 w-full animate-in fade-in duration-500">
                        <div className="flex items-center gap-2">
                             <AlertTriangle className="h-4 w-4 shrink-0" />
                             <p className="text-[10px] font-black uppercase tracking-widest text-center">
                                VALIDATION ERROR
                             </p>
                        </div>
                        <p className="text-[9px] font-bold uppercase opacity-80">ENTER PROJECT NAME & ASSIGN VOICES</p>
                    </div>
                )}
            </CardFooter>
        </Card>
    );
}
