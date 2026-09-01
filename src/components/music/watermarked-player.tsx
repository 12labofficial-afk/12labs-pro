
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Check, Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn, getDisplayUrl } from '@/lib/utils';

interface WatermarkedPlayerProps {
    musicUrl: string;
    label: string;
    isSelected: boolean;
    onSelect: () => void;
    disabled?: boolean;
}

/**
 * 🌊 12LABS PRODUCTION PLAYER (v18.0 - SEEK OPTIMIZED)
 */
export function WatermarkedPlayer({ musicUrl, label, isSelected, onSelect, disabled }: WatermarkedPlayerProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [progress, setProgress] = useState(0);
    
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        const audio = new Audio(getDisplayUrl(musicUrl, false));
        audioRef.current = audio;
        audio.preload = "metadata";
        
        const updateProgress = () => {
            if (audio.duration && isFinite(audio.duration)) {
                setProgress((audio.currentTime / audio.duration) * 100);
            }
        };

        const onCanPlay = () => setIsReady(true);
        const onWaiting = () => setIsReady(false);
        const onEnded = () => setIsPlaying(false);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onMetadata = () => setIsReady(true);

        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('canplay', onCanPlay);
        audio.addEventListener('loadedmetadata', onMetadata);
        audio.addEventListener('waiting', onWaiting);
        audio.addEventListener('playing', onCanPlay);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);

        return () => { 
            audio.pause();
            audio.removeEventListener('timeupdate', updateProgress); 
            audio.removeEventListener('canplay', onCanPlay);
            audio.removeEventListener('loadedmetadata', onMetadata);
            audio.removeEventListener('waiting', onWaiting);
            audio.removeEventListener('playing', onCanPlay);
            audio.removeEventListener('ended', onEnded); 
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
        };
    }, [musicUrl]);

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current || !isReady) return;
        if (isPlaying) audioRef.current.pause(); 
        else audioRef.current.play().catch(() => {}); 
    };

    const handleSeek = (value: number[]) => {
        if (!audioRef.current) return;
        const currentDuration = audioRef.current.duration;
        if (!currentDuration || !isFinite(currentDuration)) return;
        
        const newTime = (value[0] / 100) * currentDuration;
        audioRef.current.currentTime = newTime;
        setProgress(value[0]);
    };

    return (
        <div 
            onClick={onSelect}
            className={cn(
                "flex items-center gap-5 p-5 sm:p-8 transition-all duration-500 cursor-pointer border-l-[6px]",
                isSelected 
                    ? "bg-primary/[0.03] border-primary shadow-inner" 
                    : "bg-transparent border-transparent hover:bg-muted/40"
            )}
        >
            <div className="relative shrink-0">
                <Button 
                    size="icon" 
                    variant="outline"
                    onClick={handleToggle}
                    disabled={disabled}
                    className={cn(
                        "h-16 w-16 rounded-full transition-all active:scale-90 border-2 shadow-xl",
                        isPlaying 
                            ? "bg-primary text-white border-primary/10" 
                            : "bg-white dark:bg-zinc-950 text-primary border-primary/5"
                    )}
                >
                    {!isReady && !isPlaying ? (
                        <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    ) : isPlaying ? (
                        <Pause className="h-7 w-7 fill-current" />
                    ) : (
                        <Play className="h-7 w-7 fill-current ml-1" />
                    )}
                </Button>
            </div>
            
            <div className="flex-1 min-w-0 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className={cn(
                        "text-[12px] font-black uppercase tracking-[0.2em] transition-colors",
                        isSelected ? "text-primary" : "text-muted-foreground/50"
                    )}>
                        {label}
                    </span>
                    <span className="text-[10px] font-black font-mono opacity-20 tabular-nums">
                        {Math.round(progress)}%
                    </span>
                </div>
                {/* 🛡️ INTERACTION SHIELD: Increased slider hit area and explicit stopPropagation */}
                <div className="relative w-full h-8 flex items-center" onClick={(e) => e.stopPropagation()}>
                    <Slider 
                        value={[progress]} 
                        max={100} 
                        step={0.1} 
                        onValueChange={handleSeek}
                        className="h-2 cursor-pointer"
                    />
                </div>
            </div>

            <div className="shrink-0 ml-4">
                <div className={cn(
                    "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-500",
                    isSelected 
                        ? "bg-primary border-primary text-white scale-110 shadow-2xl shadow-primary/30" 
                        : "bg-muted/10 border-muted-foreground/10 text-transparent"
                )}>
                    <Check className="h-6 w-6 stroke-[4px]" />
                </div>
            </div>
        </div>
    );
}
