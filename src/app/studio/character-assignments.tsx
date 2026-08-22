
'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStudio } from '@/context/studio-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { voices } from '@/lib/voices';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, generateAvatarColor } from '@/lib/utils';
import { Play, Pause, ChevronsUpDown, Check } from 'lucide-react';
import type { Character } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


function VoicePicker({ 
    character, 
    onVoiceChange, 
    playingVoice, 
    onTogglePlay 
}: { 
    character: Character, 
    onVoiceChange: (voiceId: string) => void, 
    playingVoice: string | null, 
    onTogglePlay: (e: React.MouseEvent, voice: typeof voices[0]) => void 
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const getVoiceName = (voiceId: string) => {
        const voice = voices.find(v => v.id === voiceId);
        if (!voice) return 'Select a voice...';
        return `${voice.name} (${voice.gender})`;
    };

    const availableVoices = useMemo(() => {
        if (!search) return voices;

        return voices.filter(v => 
            v.name.toLowerCase().includes(search.toLowerCase()) ||
            v.gender.toLowerCase().startsWith(search.toLowerCase())
        );
    }, [search]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    {getVoiceName(character.voice)}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 z-[300]">
                <div className="p-2">
                    <Input
                        placeholder="Search voice..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9"
                    />
                </div>
                <ScrollArea className="h-60">
                    <div className="p-2 pt-0 space-y-1">
                    {availableVoices.map(voice => {
                        const isDisabled = (voice as any).disabled;
                        return (
                        <div key={voice.id} className={cn("flex items-center gap-2 rounded-md transition-colors", isDisabled ? "opacity-40 cursor-not-allowed bg-muted/20" : "hover:bg-accent group")}>
                             <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 flex-shrink-0"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTogglePlay(e, voice);
                                }}
                                disabled={!voice.demoUrl}
                            >
                               {playingVoice === voice.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                            <div 
                                className={cn("flex-grow text-sm py-2", isDisabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer")}
                                onClick={() => {
                                    if (isDisabled) return;
                                    onVoiceChange(voice.id);
                                    setOpen(false);
                                }}
                            >
                                {voice.name} ({voice.gender}) {isDisabled && <span className="text-[10px] text-destructive ml-1 uppercase font-bold">(Disabled)</span>}
                            </div>
                            <Check
                                className={cn(
                                    "ml-auto h-4 w-4 mr-3",
                                    character.voice === voice.id ? "opacity-100" : "opacity-0"
                                )}
                            />
                        </div>
                        );
                    })}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}

export function CharacterAssignments() {
  const { characters, handleVoiceChange, projectName, setProjectName, handleAgeChange } = useStudio();
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const ageColorClasses = {
    Kid: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800',
    Adult: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800',
    Old: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-400 dark:border-yellow-800'
  };

  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;
    const onEnded = () => setPlayingVoiceId(null);
    audio.addEventListener('ended', onEnded);
    return () => {
        audio?.pause();
        audio?.removeEventListener('ended', onEnded);
    }
  }, []);

  const toggleVoicePreview = (e: React.MouseEvent, voice: typeof voices[0]) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !voice.demoUrl) return;

    if (playingVoiceId === voice.id) {
        audio.pause();
        setPlayingVoiceId(null);
    } else {
        audio.pause(); // Stop any currently playing audio
        audio.src = voice.demoUrl;
        audio.play();
        setPlayingVoiceId(voice.id);
    }
  };

  if (characters.length === 0) return null;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Details</CardTitle>
        <CardDescription>
          Confirm your project's name and assign a voice to each character.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
                id="project-name"
                placeholder="e.g., 'The Jungle Story'"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="text-base"
            />
        </div>
        <Separator />
        <div className="space-y-4">
        {characters.map((char) => {
            const avatarColor = generateAvatarColor(char.name);
            const selectedVoice = voices.find(v => v.id === char.voice);
            return (
                <div key={char.id} className="rounded-lg border bg-background p-4 space-y-3 shadow-sm transition-all hover:shadow-md">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <div className="flex flex-grow items-center gap-3 min-w-0">
                            <Avatar className="h-9 w-9 flex-shrink-0">
                                <AvatarFallback className={cn("font-bold", avatarColor.bg, avatarColor.text)}>
                                    {char.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="truncate font-semibold text-foreground" title={char.name}>
                                {char.name}
                            </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                            <Select value={char.age} onValueChange={(newAge) => handleAgeChange(char.id, newAge as 'Kid' | 'Adult' | 'Old')}>
                                <SelectTrigger className={cn("h-7 w-auto px-2 text-xs font-semibold", ageColorClasses[char.age as keyof typeof ageColorClasses])}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Kid">Kid</SelectItem>
                                    <SelectItem value="Adult">Adult</SelectItem>
                                    <SelectItem value="Old">Old</SelectItem>
                                </SelectContent>
                            </Select>
                            {char.dialogueCount !== undefined && (
                                <Badge variant="secondary" className="flex-shrink-0 whitespace-nowrap">{char.dialogueCount} {char.dialogueCount === 1 ? 'line' : 'lines'}</Badge>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex-grow">
                            <VoicePicker
                                character={char}
                                onVoiceChange={(voiceId) => handleVoiceChange(char.id, voiceId)}
                                playingVoice={playingVoiceId}
                                onTogglePlay={toggleVoicePreview}
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 flex-shrink-0"
                            onClick={(e) => selectedVoice && toggleVoicePreview(e, selectedVoice)}
                            disabled={!selectedVoice?.demoUrl}
                        >
                            {playingVoiceId === selectedVoice?.id ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                        </Button>
                    </div>
                </div>
            );
        })}
        </div>
      </CardContent>
    </Card>
  );
}
