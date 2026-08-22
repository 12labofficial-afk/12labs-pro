'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '@/context/studio-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, generateAvatarColor } from '@/lib/utils';
import { Play, Pause, Loader2, Link as LinkIcon, Download, Music, Archive, RefreshCw, AlertCircle, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import JSZip from 'jszip';
import type { GeneratedLine as GeneratedLineType } from '@/lib/types';
import { useAuth } from '@/context/auth-provider';
import { convertMp3ToWav } from '@/lib/audio-utils';


function DownloadOptions() {
    const { generatedLines, generatedAudio, projectName } = useStudio();
    const { user, isImpersonating } = useAuth();
    const { toast } = useToast();
    const [isDownloadingMp3, setIsDownloadingMp3] = useState(false);
    const [isProcessingWav, setIsProcessingWav] = useState(false);

    const isAdmin = user?.role === 'admin' || isImpersonating;
    const isEligibleForDualFormat = user?.hasMadeFirstPurchase || isAdmin;

    const onDownloadFormat = async (format: 'mp3' | 'wav') => {
        if (!generatedAudio) {
            toast({ variant: 'destructive', title: 'Final audio not available.'});
            return;
        }

        if (format === 'mp3') setIsDownloadingMp3(true);
        else setIsProcessingWav(true);

        let blobToDownload = generatedAudio;

        if (format === 'wav' && generatedAudio.type.includes('mpeg')) {
            toast({ title: 'Converting to WAV...', description: '12Labs local engine is processing your master file.' });
            try {
                blobToDownload = await convertMp3ToWav(generatedAudio);
            } catch (e) {
                toast({ variant: 'destructive', title: 'Conversion Failed' });
                setIsProcessingWav(false);
                return;
            }
        }

        const url = URL.createObjectURL(blobToDownload);
        const a = document.createElement('a');
        a.href = url;
        const safeName = projectName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'audio_project';
        a.download = `12labs_master_${safeName}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: 'Download Started' });
        
        setIsDownloadingMp3(false);
        setIsProcessingWav(false);
    };

    const onDownloadZip = async () => {
        toast({ title: 'Preparing ZIP...', description: 'Fetching all dialogue nodes.' });
        const zip = new JSZip();
        const validLines = generatedLines.filter((item): item is GeneratedLineType & { audioDataUri: string } => item.status === 'done' && !!item.audioDataUri);

        if (validLines.length === 0) {
            toast({ variant: 'destructive', title: 'Nothing to download.' });
            return;
        }

        await Promise.all(
            validLines.map(async (line, index) => {
                const response = await fetch(line.audioDataUri);
                const blob = await response.blob();
                const fileName = `${String(index + 1).padStart(3, '0')}_${line.characterName}_${line.dialogue.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}.wav`;
                zip.file(fileName, blob);
            })
        );

        zip.generateAsync({ type: 'blob' }).then((content) => {
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = '12labs_audio_nodes.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    };
    
    const generatedCount = generatedLines.filter(u => u.status === 'done').length;
    const totalCount = generatedLines.length;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="secondary" disabled={generatedCount === 0} className="h-9">
                    <Download className="mr-2 h-4 w-4" /> 
                    <span className="text-xs sm:text-sm">Download ({generatedCount}/{totalCount})</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Download Master File</h4>
                        <p className="text-sm text-muted-foreground">
                            {isEligibleForDualFormat ? 'Dual format enabled for your account.' : 'Upgrade for WAV lossless support.'}
                        </p>
                    </div>
                    <div className="grid gap-2">
                        <Button onClick={() => onDownloadFormat('mp3')} disabled={!generatedAudio || isDownloadingMp3 || isProcessingWav}>
                             {isDownloadingMp3 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music className="mr-2 h-4 w-4" />}
                             {isDownloadingMp3 ? 'Wait' : 'Download MP3'}
                        </Button>
                        {isEligibleForDualFormat && (
                            <Button onClick={() => onDownloadFormat('wav')} disabled={!generatedAudio || isProcessingWav || isDownloadingMp3} variant="outline">
                                {isProcessingWav ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Music className="mr-2 h-4 w-4" />}
                                {isProcessingWav ? 'Wait' : 'Download WAV'}
                            </Button>
                        )}
                        <Separator />
                        <Button onClick={onDownloadZip} variant="ghost" size="sm">
                             <Archive className="mr-2 h-4 w-4" /> Download Nodes (.zip)
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}


export function GeneratedLines() {
    const { generatedLines, retryLineGeneration } = useStudio();
    const { user, isImpersonating } = useAuth();
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const isAdmin = user?.role === 'admin' || isImpersonating;
    const canDownloadSingle = useMemo(() => {
        if (isAdmin) return true;
        if (!user) return false;
        const plans = user.purchasedPlans || {};
        return plans["899"] > 0 || plans["700"] > 0;
    }, [user, isAdmin]);

    useEffect(() => {
        audioRef.current = new Audio();
        const audio = audioRef.current;
        const onEnded = () => setPlayingIndex(null);
        audio.addEventListener('ended', onEnded);
        return () => {
            audio?.pause();
            audio?.removeEventListener('ended', onEnded);
        }
    }, []);

    const togglePlay = (index: number, url: string | undefined) => {
        const audio = audioRef.current;
        if (!audio || !url) return;
        if (playingIndex === index) {
            audio.pause();
            setPlayingIndex(null);
        } else {
            audio.src = url;
            audio.play();
            setPlayingIndex(index);
        }
    };

    const handleDownload = (url: string | undefined, line: GeneratedLineType) => {
        if (!url) return;
        const a = document.createElement('a');
        a.href = url;
        const format = url.toLowerCase().includes('.mp3') ? 'mp3' : 'wav';
        a.download = `12labs_${line.characterName}_${line.dialogue.slice(0, 15).replace(/\s/g, '_')}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <Card className="mt-8">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Dialogue Nodes</CardTitle>
                    <DownloadOptions />
                </div>
                <CardDescription>Individual audio fragments generated by the AI.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-96 pr-4 -mr-4">
                <div className="space-y-4">
                    {generatedLines.map((line, index) => {
                        const avatarColor = generateAvatarColor(line.characterName);
                        const isPlaying = playingIndex === index;

                        const isLinked = index > 0 &&
                                         line.status === 'done' &&
                                         line.audioDataUri &&
                                         generatedLines[index - 1].status === 'done' &&
                                         line.audioDataUri === generatedLines[index - 1].audioDataUri;

                        return (
                             <div key={line.id} className="p-4 border rounded-lg bg-muted/30 transition-shadow hover:shadow-md">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9 border">
                                            <AvatarFallback className={cn("font-bold", avatarColor.bg, avatarColor.text)}>
                                                {line.characterName.charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <p className="font-semibold">{line.characterName}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {line.status === 'generating' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                        {line.status === 'error' && (
                                            <div className='flex items-center gap-1'>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Badge variant="destructive" className="cursor-help flex items-center gap-1">
                                                                <AlertCircle className="h-3 w-3" /> Failed
                                                            </Badge>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="max-w-[250px] p-3 shadow-xl">
                                                            <p className="text-xs font-semibold mb-1">Generation Error:</p>
                                                            <p className="text-[10px] leading-relaxed text-destructive-foreground/90">{line.error || 'The AI engine encountered an unexpected error.'}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => retryLineGeneration(line.id)}>
                                                    <RefreshCw className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                        {line.status === 'done' && line.audioDataUri && (
                                            isLinked ? (
                                                <Badge variant="secondary" className="flex items-center gap-1.5 cursor-default">
                                                    <LinkIcon className="h-3 w-3" />
                                                    Linked
                                                </Badge>
                                            ) : (
                                                <>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => togglePlay(index, line.audioDataUri)}>
                                                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                                    </Button>
                                                    {canDownloadSingle && (
                                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownload(line.audioDataUri, line)}>
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </>
                                            )
                                        )}
                                    </div>
                                </div>
                                <p className="text-muted-foreground text-sm mt-3 pl-12 italic">&quot;{line.dialogue}&quot;</p>
                            </div>
                        )
                    })}
                </div>
                </ScrollArea>
            </CardContent>
        </Card>
    )
}
