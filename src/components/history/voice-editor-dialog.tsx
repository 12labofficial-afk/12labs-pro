'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { safeClone, safeJsonStringify } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
    Play, Pause, 
    MicVocal, Loader2, X, 
    Undo2, Redo2, Archive, 
    Sparkles, 
    SlidersHorizontal,
    RotateCcw,
    Zap,
    RefreshCw,
    Edit,
    Check,
    Trash2,
    ChevronsUpDown,
    User,
    Activity,
    Download,
    Cpu,
    Volume2,
    AlertTriangle,
    Save,
    History as HistoryIcon,
    FileAudio,
    Plus,
    ArrowRight,
    Coins,
    ShieldCheck,
    ArrowDown,
    ChevronDown,
    ChevronUp,
    Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Project, Character } from '@/lib/types';
import { cn, getDisplayUrl, localSaveFile } from '@/lib/utils';
import { audioBufferToWav, convertMp3ToWav } from '@/lib/audio-utils';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { initializeFirebase } from '@/firebase';
import { ref, get, set, onValue } from 'firebase/database';
import { 
    regenerateLineWithCreditsAction,
    createCharacterVoiceReplacementJobAction
} from '@/app/studio/actions';
import { useAuth } from '@/context/auth-provider';
import { Textarea } from '@/components/ui/textarea';
import { voices } from '@/lib/voices';
import { proVoices } from '@/lib/pro-voices';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface VoiceEditorDialogProps {
    project: Project;
    children: React.ReactNode;
}

interface HistoryItem {
    data: any;
    description: string;
}

interface ReplacementEntry {
    id: string;
    charName: string;
    newVoiceId: string;
}

function VoicePicker({ 
    currentVoiceId, 
    onVoiceChange, 
    playingVoice, 
    onTogglePlay,
    projectType
}: { 
    currentVoiceId: string, 
    onVoiceChange: (v: string) => void, 
    playingVoice: string | null, 
    onTogglePlay: any,
    projectType?: string
}) {
    const [open, setOpen] = useState(false);
    
    // 🔥 CONTEXT-AWARE VOICE LIST: Pro Studio uses proVoices, others use voices
    const activeVoicesList = (projectType as string) === 'pro-studio' ? proVoices : voices;

    const groupedVoices = useMemo(() => {
        return {
            male: activeVoicesList.filter(v => v.gender === 'Male'),
            female: activeVoicesList.filter(v => v.gender === 'Female'),
            neutral: activeVoicesList.filter(v => v.gender !== 'Male' && v.gender !== 'Female')
        };
    }, [activeVoicesList]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between h-10 px-3 rounded-xl border-primary/10 bg-background/50">
                    <span className="truncate font-bold text-xs">
                        {activeVoicesList.find(v => v.id === currentVoiceId)?.name || 'Assign persona...'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent disablePortal className="w-[95vw] sm:w-[650px] p-0 rounded-2xl shadow-3xl border-primary/10 overflow-hidden z-[300]">
                <div className="flex flex-row h-72 divide-x border-primary/5">
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-1.5 text-[10px] font-black uppercase bg-primary/5 border-b shrink-0">Female</div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                                {groupedVoices.female.map(v => {
                                    const isDisabled = (v as any).disabled;
                                    return (
                                        <div 
                                            key={v.id} 
                                            className={cn(
                                                "flex items-center gap-1 p-1 rounded-lg transition-colors",
                                                isDisabled ? "opacity-40 cursor-not-allowed bg-muted/20" : "hover:bg-muted/50 cursor-pointer",
                                                currentVoiceId === v.id && "bg-primary/5"
                                            )} 
                                            onClick={() => { 
                                                if (isDisabled) return;
                                                onVoiceChange(v.id); 
                                                setOpen(false); 
                                            }}
                                        >
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-7 w-7 rounded-full shrink-0" 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTogglePlay(e, v);
                                                }}
                                            >
                                                {playingVoice === v.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                            </Button>
                                            <span className="text-[11px] font-bold truncate flex-1">{v.name}</span>
                                            {isDisabled && <span className="text-[8px] font-black uppercase py-0.5 px-1.5 border border-destructive/20 text-destructive rounded bg-destructive/5 font-sans shrink-0">Disabled</span>}
                                            {currentVoiceId === v.id && <Check className="h-3 w-3 text-primary shrink-0" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-3 py-1.5 text-[10px] font-black uppercase bg-blue-500/5 border-b shrink-0">Male</div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                                {groupedVoices.male.map(v => {
                                    const isDisabled = (v as any).disabled;
                                    return (
                                        <div 
                                            key={v.id} 
                                            className={cn(
                                                "flex items-center gap-1 p-1 rounded-lg transition-colors",
                                                isDisabled ? "opacity-40 cursor-not-allowed bg-muted/20" : "hover:bg-muted/50 cursor-pointer",
                                                currentVoiceId === v.id && "bg-primary/5"
                                            )} 
                                            onClick={() => { 
                                                if (isDisabled) return;
                                                onVoiceChange(v.id); 
                                                setOpen(false); 
                                            }}
                                        >
                                            <Button 
                                                size="icon" 
                                                variant="ghost" 
                                                className="h-7 w-7 shrink-0" 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTogglePlay(e, v);
                                                }}
                                            >
                                                {playingVoice === v.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                            </Button>
                                            <span className="text-xs font-bold truncate flex-grow">{v.name}</span>
                                            {isDisabled && <span className="text-[8px] font-black uppercase py-0.5 px-1.5 border border-destructive/20 text-destructive rounded bg-destructive/5 font-sans shrink-0">Disabled</span>}
                                            {currentVoiceId === v.id && <Check className="h-3 w-3 text-primary shrink-0" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function VoiceEditorDialog({ project, children }: VoiceEditorDialogProps) {
    const { toast } = useToast();
    const { user, setUser } = useAuth();
    const { database } = initializeFirebase();
    const [open, setOpen] = useState(false);
    
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);
    const [syncData, setSyncData] = useState<any>(null);
    const [silenceGap] = useState(800); 
    
    const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
    const [isMerging, setIsMerging] = useState(false);
    const [isStale, setIsStale] = useState(false); 
    const [activeNodeIndex, setActiveNodeIndex] = useState<number | null>(null);
    const [isMasterPlaying, setIsMasterPlaying] = useState(false);
    
    const [editingNodeIndex, setEditingNodeIndex] = useState<number | null>(null);
    const [nodeTextDraft, setNodeTextDraft] = useState('');
    const [editVoiceId, setEditVoiceId] = useState('');
    const [isRegeneratingIndex, setIsRegeneratingIndex] = useState<number | null>(null);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [localNodePlayingIndex, setLocalNodePlayingIndex] = useState<number | null>(null);

    const [replacements, setReplacements] = useState<ReplacementEntry[]>([]);
    const [selectedVoiceForChar, setSelectedVoiceForChar] = useState<Record<string, string>>({});
    const [swappingChar, setSwappingChar] = useState<string | null>(null);
    const [isProcessingSwap, setIsProcessingSwap] = useState(false);
    const [isZipping, setIsZipping] = useState(false);
    const [swapProgress, setSwapProgress] = useState(0);
    const [isSwapHubOpen, setIsSwapHubOpen] = useState(true);
    const [activeEditingJob, setActiveEditingJob] = useState<any>(null);
    const [activeVoiceReplacementJob, setActiveVoiceReplacementJob] = useState<any>(null);

    const copyToClipboard = (url: string | null | undefined, label: string) => {
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
            toast({
                title: 'Copied to Clipboard!',
                description: `${label} link has been copied successfully.`,
            });
        }).catch(() => {
            toast({
                variant: 'destructive',
                title: 'Copy Failed',
                description: 'Failed to copy URL automatically.',
            });
        });
    };

    // 🔄 Realtime listener for RTDB voice_replacement
    useEffect(() => {
        if (!project?.id) return;
        const { database: rtdb } = initializeFirebase();
        if (!rtdb) return;

        const voiceReplacementRef = ref(rtdb, `voice_replacement/${project.id}`);
        const unsubscribe = onValue(voiceReplacementRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setActiveVoiceReplacementJob(data);
                if (data.status === 'pending' || data.status === 'processing') {
                    setIsProcessingSwap(true);
                    setSwapProgress(data.progress || 10);
                } else if (data.status === 'completed') {
                    setIsProcessingSwap(false);
                    setSwapProgress(100);
                    if (data.editedAudioUrl) {
                        setMergedAudioUrl(getDisplayUrl(data.editedAudioUrl));
                    }
                } else if (data.status === 'failed') {
                    setIsProcessingSwap(false);
                    setSwapProgress(0);
                    toast({ variant: 'destructive', title: 'Voice Swap Failed', description: data.error || 'Server reported failure.' });
                }
            } else {
                setActiveVoiceReplacementJob(null);
            }
        });
        return () => unsubscribe();
    }, [project?.id, toast]);

    // 🔄 Realtime listener for RTDB editingjobs
    useEffect(() => {
        if (!project?.id) return;
        const { database: rtdb } = initializeFirebase();
        if (!rtdb) return;

        const jobsRef = ref(rtdb, 'editingjobs');
        const unsubscribe = onValue(jobsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                let matchingJob: any = null;
                Object.values(data).forEach((j: any) => {
                    if (j.projectId === project.id && (j.status === 'pending' || j.status === 'processing')) {
                        matchingJob = j;
                    }
                });
                setActiveEditingJob(matchingJob);
                if (matchingJob) {
                    setSwapProgress(matchingJob.progress || 0);
                    setIsProcessingSwap(true);
                }
            } else {
                setActiveEditingJob(null);
            }
        });
        return () => unsubscribe();
    }, [project?.id]);

    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [future, setFuture] = useState<HistoryItem[]>([]);
    
    const masterPlayerRef = useRef<HTMLAudioElement | null>(null);
    const nodeRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const calibrationAudioRef = useRef<HTMLAudioElement | null>(null);
    const nodePlayerRef = useRef<HTMLAudioElement | null>(null);
    const overrideBufferCache = useRef<Record<number, AudioBuffer>>({});

    const fetchAudioArrayBuffer = async (rawUrl: string): Promise<ArrayBuffer> => {
        if (!rawUrl) throw new Error("Audio URL is empty");

        // Handle base64 data URIs directly without fetch call
        if (rawUrl.startsWith('data:')) {
            const parts = rawUrl.split(',');
            const base64Data = parts[1] || parts[0];
            const binaryString = window.atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        }

        // First try same-origin proxy endpoint (/api/download) to prevent browser CORS "Failed to fetch" errors
        const proxyUrl = `/api/download?url=${encodeURIComponent(rawUrl)}&inline=1`;
        try {
            const proxyResponse = await fetch(proxyUrl);
            if (proxyResponse.ok) {
                return await proxyResponse.arrayBuffer();
            }
        } catch (proxyErr) {
            console.warn("Audio proxy fetch failed, trying direct URL fallback...", proxyErr);
        }

        // Fallback to direct fetch
        const resolvedUrl = getDisplayUrl(rawUrl);
        const directResponse = await fetch(resolvedUrl);
        if (!directResponse.ok) {
            throw new Error(`Audio fetch failed with status ${directResponse.status}`);
        }
        return await directResponse.arrayBuffer();
    };

    const decodeDataUri = async (uri: string, index?: number): Promise<AudioBuffer> => {
        if (index !== undefined && overrideBufferCache.current[index]) return overrideBufferCache.current[index];
        const buffer = await fetchAudioArrayBuffer(uri);
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(buffer);
        if (index !== undefined) overrideBufferCache.current[index] = decoded;
        return decoded;
    };

    const mergeAudio = useCallback(async () => {
        if (!audioBuffer || !syncData || !syncData.dialogues || !syncData.timeline || !open) return;
        setIsMerging(true);
        try {
            const newDecodedOverrides: Record<number, AudioBuffer> = {};
            await Promise.all(syncData.dialogues.map(async (dialogue: any, idx: number) => {
                if (dialogue.audioOverridden && dialogue.useOverride !== false) {
                    try { newDecodedOverrides[idx] = await decodeDataUri(dialogue.audioOverridden, idx); } catch (e) {}
                }
            }));
            let elapsed = 0;
            const newNodeTimelines = syncData.dialogues.map((dialogue: any, idx: number) => {
                const pace = syncData.characterSettings?.[dialogue.character]?.speed || 1.0;
                const isOverridden = dialogue.audioOverridden && dialogue.useOverride !== false;
                let baseDuration = isOverridden ? (newDecodedOverrides[idx]?.duration || 0) : (syncData.timeline?.[idx]?.duration || 0);
                const effectiveDuration = baseDuration / pace;
                const start = elapsed; const end = start + effectiveDuration;
                elapsed = end + (silenceGap / 1000);
                return { start, end, duration: effectiveDuration, baseDuration };
            });
            const totalDuration = newNodeTimelines.length > 0 ? newNodeTimelines[newNodeTimelines.length - 1].end : 0;
            const ctx = new OfflineAudioContext(audioBuffer.numberOfChannels || 1, Math.ceil(totalDuration * audioBuffer.sampleRate), audioBuffer.sampleRate);
            for (let i = 0; i < syncData.dialogues.length; i++) {
                const dialogue = syncData.dialogues[i]; const nodeTimeline = newNodeTimelines[i];
                const pace = syncData.characterSettings?.[dialogue.character]?.speed || 1.0;
                const isOverridden = dialogue.audioOverridden && dialogue.useOverride !== false;
                const source = ctx.createBufferSource();
                if (isOverridden && newDecodedOverrides[i]) source.buffer = newDecodedOverrides[i];
                else source.buffer = audioBuffer;
                source.playbackRate.value = pace;
                source.connect(ctx.destination);
                if (isOverridden && newDecodedOverrides[i]) source.start(nodeTimeline.start);
                else source.start(nodeTimeline.start, syncData.timeline[i].startTime, syncData.timeline[i].duration);
            }
            const renderedBuffer = await ctx.startRendering();
            setMergedAudioUrl(URL.createObjectURL(audioBufferToWav(renderedBuffer)));
            setIsStale(false); 
        } catch (e) { toast({ variant: 'destructive', title: 'Merge Failed' }); }
        finally { setIsMerging(false); }
    }, [audioBuffer, syncData, silenceGap, open, toast]);

    useEffect(() => {
        if (open) {
            const initEditor = async () => {
                setIsLoadingAudio(true);
                overrideBufferCache.current = {};
                try {
                    if (!project.audioUrl) {
                        toast({ variant: 'destructive', title: 'Init Blocked', description: 'Master audio node not ready in history.' });
                        setOpen(false);
                        return;
                    }
                    
                    const buffer = await fetchAudioArrayBuffer(project.audioUrl);
                    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const decoded = await ctx.decodeAudioData(buffer);
                    setAudioBuffer(decoded);

                    if (database) {
                        const editsRef = ref(database, `projectEdits/${project.id}`);
                        const snapshot = await get(editsRef);
                        if (snapshot.exists()) {
                            setSyncData(snapshot.val().syncData);
                        } else {
                            const localSaved = localStorage.getItem(`dialogue_edits_${project.id}`);
                            if (localSaved) {
                                try {
                                    setSyncData(JSON.parse(localSaved));
                                } catch (e) {
                                    let baseSyncData = project.syncData;
                                    if (typeof baseSyncData === 'string') try { baseSyncData = JSON.parse(baseSyncData); } catch (e) { baseSyncData = {}; }
                                    else baseSyncData = safeClone(baseSyncData || {});
                                    setSyncData(baseSyncData);
                                }
                            } else {
                                let baseSyncData = project.syncData;
                                if (typeof baseSyncData === 'string') try { baseSyncData = JSON.parse(baseSyncData); } catch (e) { baseSyncData = {}; }
                                else baseSyncData = safeClone(baseSyncData || {});
                                setSyncData(baseSyncData);
                            }
                        }
                    }
                } catch (e) { 
                    console.error("Editor init failed:", e);
                    toast({ variant: 'destructive', title: 'Access Denied', description: 'Could not secure production node access.' }); 
                    setOpen(false);
                }
                finally { setIsLoadingAudio(false); setIsStale(false); }
            };
            initEditor();
        }
    }, [open, project.audioUrl, project.id, database, toast, project.syncData]);

    const addToHistory = (description: string) => {
        setHistory(prev => [...prev.slice(-29), { data: safeClone(syncData), description }]);
        setFuture([]); setIsStale(true);
    };

    const handleUndo = () => {
        if (history.length === 0) return;
        const prev = history[history.length - 1];
        setFuture(f => [{ data: safeClone(syncData), description: prev.description }, ...f]);
        setSyncData(prev.data); setHistory(h => h.slice(0, -1)); setIsStale(true);
    };

    const handleRedo = () => {
        if (future.length === 0) return;
        const next = future[0];
        setHistory(h => [...h, { data: safeClone(syncData), description: next.description }]);
        setSyncData(next.data); setFuture(f => f.slice(1)); setIsStale(true);
    };

    const getAssignedVoiceId = (charName: string) => {
        if (!syncData?.voiceAssignments) return null;
        const assignments = syncData.voiceAssignments;
        if (assignments[charName]) return assignments[charName];
        const lowerKey = Object.keys(assignments).find(k => k.toLowerCase() === charName.toLowerCase());
        return lowerKey ? assignments[lowerKey] : null;
    };

    const getCharacterAge = (charName: string): 'Kid' | 'Adult' | 'Old' => {
        if (!syncData) return 'Adult';
        if (syncData.characters && Array.isArray(syncData.characters)) {
            const found = syncData.characters.find((c: any) => c.name?.toLowerCase().trim() === charName.toLowerCase().trim());
            if (found?.ageGroup) return found.ageGroup;
            if (found?.age) return found.age;
        }
        if (syncData.characterAges && syncData.characterAges[charName]) {
            return syncData.characterAges[charName];
        }
        return 'Adult';
    };

    const updateCharacterAge = (charName: string, age: 'Kid' | 'Adult' | 'Old') => {
        addToHistory(`Age change for ${charName}`);
        const characterAges = { ...(syncData?.characterAges || {}) };
        characterAges[charName] = age;
        let newCharacters = syncData?.characters;
        if (Array.isArray(newCharacters)) {
            newCharacters = newCharacters.map((c: any) => 
                c.name?.toLowerCase().trim() === charName.toLowerCase().trim() 
                    ? { ...c, ageGroup: age, age } 
                    : c
            );
        } else {
            newCharacters = [{ name: charName, ageGroup: age, age }];
        }
        setSyncData({
            ...syncData,
            characterAges,
            characters: newCharacters
        });
        setIsStale(true);
    };

    const handleDialogueTextChange = (index: number, newText: string) => {
        if (!syncData || !syncData.dialogues) return;
        const newDialogues = [...syncData.dialogues];
        const current = newDialogues[index];
        const originalLine = current.originalLine !== undefined ? current.originalLine : current.line;
        const isEdited = newText.trim() !== originalLine.trim();

        newDialogues[index] = { 
            ...current, 
            line: newText, 
            originalLine,
            isEdited 
        };

        const updatedSyncData = { ...syncData, dialogues: newDialogues };
        setSyncData(updatedSyncData);
        setIsStale(true);

        try {
            if (project?.id) {
                localStorage.setItem(`dialogue_edits_${project.id}`, safeJsonStringify(updatedSyncData));
            }
        } catch (e) {}
    };

    const handleResetDialogue = (index: number) => {
        if (!syncData || !syncData.dialogues) return;
        const newDialogues = [...syncData.dialogues];
        const current = newDialogues[index];
        if (current.originalLine !== undefined) {
            newDialogues[index] = {
                ...current,
                line: current.originalLine,
                isEdited: false
            };
            const updatedSyncData = { ...syncData, dialogues: newDialogues };
            setSyncData(updatedSyncData);
            setIsStale(true);
            try {
                if (project?.id) {
                    localStorage.setItem(`dialogue_edits_${project.id}`, safeJsonStringify(updatedSyncData));
                }
            } catch (e) {}
        }
    };

    const saveDialogueEdits = async () => {
        if (!syncData || !project.id) return;
        try {
            if (project.id) {
                localStorage.setItem(`dialogue_edits_${project.id}`, safeJsonStringify(syncData));
            }
            if (database) {
                try {
                    const editsRef = ref(database, `projectEdits/${project.id}`);
                    await set(editsRef, { syncData, updatedAt: new Date().toISOString() });
                } catch (rtdbErr) {
                    console.warn("RTDB sync skipped/failed:", rtdbErr);
                }
            }
            toast({ title: 'Edits Saved!', description: 'Dialogue line edits have been saved.' });
            setIsStale(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: err.message || 'Could not save edits.' });
        }
    };

    const updateCharacterVoice = (charName: string, voiceId: string) => {
        const currentVoice = getAssignedVoiceId(charName);
        if (currentVoice?.toLowerCase() === voiceId.toLowerCase()) return;
        addToHistory(`Cast change for ${charName}`);
        const assignments = { ...syncData.voiceAssignments };
        const existingKey = Object.keys(assignments).find(k => k.toLowerCase() === charName.toLowerCase());
        assignments[existingKey || charName] = voiceId;
        setSyncData({ ...syncData, voiceAssignments: assignments });
        setEditVoiceId(voiceId); 
    };

    const getDialogueCount = (charName: string) => {
        if (!syncData || !syncData.dialogues) return 0;
        return syncData.dialogues.filter((d: any) => d.character.toLowerCase().trim() === charName.toLowerCase().trim()).length;
    };

    const getCharacterCost = (charName: string) => {
        if (!syncData?.dialogues) return 0;
        const charCount = syncData.dialogues.reduce((acc: number, d: any) => 
            d.character.toLowerCase().trim() === charName.toLowerCase().trim() ? acc + d.line.length : acc, 0);
        return Math.max(1, Math.ceil(charCount * 1.2));
    };

    const handleSwapSingleCharacterVoice = async (charName: string, targetVoiceId: string) => {
        if (!user || !syncData || !syncData.dialogues || !targetVoiceId || !database) return;
        const cost = getCharacterCost(charName);
        if (user.credits < cost) {
            toast({ variant: 'destructive', title: 'Insufficient Credits', description: `Need ${cost} credits to swap voice for ${charName}.` });
            return;
        }

        setSwappingChar(charName);
        setIsProcessingSwap(true);
        setSwapProgress(5);

        try {
            // Automatically download original master audio file so the user has a copy
            const audioUrl = getDisplayUrl(project.audioUrl);
            if (audioUrl) {
                try {
                    const safeName = project.projectName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || '12labs_audio';
                    const finalFileName = `12labs_original_${safeName}.mp3`;
                    await localSaveFile(audioUrl, finalFileName);
                    toast({ title: 'Original Audio Saved', description: 'Your original audio copy has been downloaded automatically.' });
                } catch (downloadErr) {
                    console.error("Auto download of original failed:", downloadErr);
                }
            }

            // Write request directly to RTDB voice_replacement/${project.id} path
            const replacementRef = ref(database, `voice_replacement/${project.id}`);
            await set(replacementRef, {
                projectId: project.id,
                userId: user.uid,
                character: charName,
                newVoiceId: targetVoiceId,
                syncData,
                originalAudioUrl: project.audioUrl,
                status: 'pending',
                progress: 5,
                cost,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            toast({ title: 'Voice Swap Request Submitted!', description: 'Submitted to server. Waiting for processing...' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Voice Swap Failed', description: e.message || 'Error submitting voice swap.' });
            setIsProcessingSwap(false);
            setSwapProgress(0);
        } finally {
            setSwappingChar(null);
        }
    };

    const addReplacement = () => {
        setIsSwapHubOpen(true);
        setReplacements(prev => [...prev, { id: crypto.randomUUID(), charName: '', newVoiceId: '' }]);
    };
    const updateReplacement = (id: string, field: keyof ReplacementEntry, val: string) => setReplacements(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
    const removeReplacement = (id: string) => setReplacements(prev => prev.filter(r => r.id !== id));

    const swapCostData = useMemo(() => {
        if (!syncData || !syncData.dialogues) return { totalChars: 0, cost: 0 };
        const activeChars = new Set(replacements.filter(r => r.charName && r.newVoiceId).map(r => r.charName.toLowerCase().trim()));
        const charCount = syncData.dialogues.reduce((acc: number, d: any) => activeChars.has(d.character.toLowerCase().trim()) ? acc + d.line.length : acc, 0);
        return { totalChars: charCount, cost: Math.ceil(charCount * 1.2) };
    }, [syncData, replacements]);

    const handleBulkCastSwap = async () => {
        if (!user || replacements.length === 0 || !syncData || !syncData.dialogues || !database) return;
        const validReplacements = replacements.filter(r => r.charName && r.newVoiceId);
        if (validReplacements.length === 0) return;
        if (user.credits < swapCostData.cost) { toast({ variant: 'destructive', title: 'Insufficient Credits' }); return; }
        setIsProcessingSwap(true); 
        setSwapProgress(5);
        try {
            // Automatically download original master audio file so the user has a copy
            const audioUrl = getDisplayUrl(project.audioUrl);
            if (audioUrl) {
                try {
                    const safeName = project.projectName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || '12labs_audio';
                    const finalFileName = `12labs_original_${safeName}.mp3`;
                    await localSaveFile(audioUrl, finalFileName);
                    toast({ title: 'Original Audio Saved', description: 'Your original audio copy has been downloaded automatically.' });
                } catch (downloadErr) {
                    console.error("Auto download of original failed:", downloadErr);
                }
            }

            // Write request directly to RTDB voice_replacement/${project.id} path
            const replacementRef = ref(database, `voice_replacement/${project.id}`);
            await set(replacementRef, {
                projectId: project.id,
                userId: user.uid,
                replacements: validReplacements.map(r => ({ charName: r.charName, newVoiceId: r.newVoiceId })),
                syncData,
                originalAudioUrl: project.audioUrl,
                status: 'pending',
                progress: 5,
                cost: swapCostData.cost,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            setReplacements([]); 
            toast({ title: 'Bulk Voice Swap Submitted!', description: 'Submitted to server. Waiting for processing...' });
        } catch (e: any) { 
            toast({ variant: 'destructive', title: 'Batch Failed', description: e.message }); 
            setIsProcessingSwap(false);
            setSwapProgress(0);
        }
    };

    const handleRegenerateNode = async (index: number, newText?: string) => {
        if (!user || !syncData) return;
        const dialogue = syncData.dialogues[index]; const textToGen = newText || dialogue.line;
        const voiceId = editVoiceId || getAssignedVoiceId(dialogue.character);
        if (!voiceId) return;
        setIsRegeneratingIndex(index);
        try {
            const result = await regenerateLineWithCreditsAction(user.uid, textToGen, voiceId);
            if (result.success && result.audioDataUri) {
                addToHistory(`Regenerated line ${index + 1}`);
                const newDialogues = [...syncData.dialogues];
                newDialogues[index] = { ...newDialogues[index], line: textToGen, audioOverridden: result.audioDataUri, useOverride: true };
                delete overrideBufferCache.current[index]; setSyncData({ ...syncData, dialogues: newDialogues });
                if (result.newCredits !== undefined) setUser({ ...user, credits: result.newCredits });
                setEditingNodeIndex(null);
            }
        } catch (e) { toast({ variant: 'destructive', title: 'Sync Failed' }); }
        finally { setIsRegeneratingIndex(null); }
    };

    const toggleVoicePreview = async (e: React.MouseEvent, voice: any) => {
        e.stopPropagation(); e.preventDefault();
        if (!calibrationAudioRef.current) calibrationAudioRef.current = new Audio();
        const a = calibrationAudioRef.current;
        if (playingVoiceId === voice.id) { a.pause(); setPlayingVoiceId(null); }
        else {
            try {
                a.pause(); a.src = getDisplayUrl(voice.demoUrl || voice.link); await a.play();
                setPlayingVoiceId(voice.id);
                a.onended = () => setPlayingVoiceId(null);
            } catch (err) { console.warn("Preview blocked", err); }
        }
    };

    const toggleNodePlay = async (index: number) => {
        if (!syncData) return;
        
        if (masterPlayerRef.current && syncData.timeline && syncData.timeline[index]) {
            const startTime = syncData.timeline[index].startTime ?? syncData.timeline[index].start ?? 0;
            if (activeNodeIndex === index && isMasterPlaying) {
                masterPlayerRef.current.pause();
                setIsMasterPlaying(false);
                setActiveNodeIndex(null);
            } else {
                masterPlayerRef.current.currentTime = startTime;
                masterPlayerRef.current.play().catch(console.warn);
                setIsMasterPlaying(true);
                setActiveNodeIndex(index);
            }
            return;
        }

        if (!audioBuffer) return;
        if (localNodePlayingIndex === index) { nodePlayerRef.current?.pause(); setLocalNodePlayingIndex(null); return; }
        const dialogue = syncData.dialogues[index]; const useOverride = dialogue.audioOverridden && dialogue.useOverride !== false;
        const pace = syncData.characterSettings?.[dialogue.character]?.speed || 1.0;
        try {
            let srcBuffer = audioBuffer; let off = syncData.timeline[index].startTime; let dur = syncData.timeline[index].duration;
            if (useOverride && dialogue.audioOverridden) { srcBuffer = await decodeDataUri(dialogue.audioOverridden, index); off = 0; dur = srcBuffer.duration; }
            const renderedDuration = dur / pace;
            const offlineCtx = new OfflineAudioContext(srcBuffer.numberOfChannels || 1, Math.ceil(renderedDuration * srcBuffer.sampleRate), srcBuffer.sampleRate);
            const source = offlineCtx.createBufferSource(); source.buffer = srcBuffer; source.playbackRate.value = pace; source.connect(offlineCtx.destination); source.start(0, off, dur);
            const rendered = await offlineCtx.startRendering();
            if (!nodePlayerRef.current) nodePlayerRef.current = new Audio();
            nodePlayerRef.current.src = URL.createObjectURL(audioBufferToWav(rendered));
            nodePlayerRef.current.onended = () => setLocalNodePlayingIndex(null);
            await nodePlayerRef.current.play(); setLocalNodePlayingIndex(index);
        } catch (e) { toast({ variant: 'destructive', title: 'Preview Failed' }); }
    };

    const setNodeVersion = (index: number, useOverride: boolean) => {
        addToHistory(`Switched version for node ${index + 1}`);
        const newDialogues = [...syncData.dialogues];
        newDialogues[index] = { ...newDialogues[index], useOverride };
        setSyncData({ ...syncData, dialogues: newDialogues });
    };

    const handleDownloadNode = async (index: number) => {
        const dialogue = syncData.dialogues[index]; const useOverride = dialogue.audioOverridden && dialogue.useOverride !== false;
        try {
            let srcBuffer = audioBuffer!; let off = syncData.timeline[index].startTime; let dur = syncData.timeline[index].duration;
            if (useOverride && dialogue.audioOverridden) { srcBuffer = await decodeDataUri(dialogue.audioOverridden, index); off = 0; dur = srcBuffer.duration; }
            const pace = syncData.characterSettings?.[dialogue.character]?.speed || 1.0;
            const renderedDuration = dur / pace;
            const offlineCtx = new OfflineAudioContext(srcBuffer.numberOfChannels || 1, Math.ceil(renderedDuration * srcBuffer.sampleRate), srcBuffer.sampleRate);
            const source = offlineCtx.createBufferSource(); source.buffer = srcBuffer; source.playbackRate.value = pace; source.connect(offlineCtx.destination); source.start(0, off, dur);
            const rendered = await offlineCtx.startRendering();
            saveAs(audioBufferToWav(rendered), `12labs_node_${index + 1}_${dialogue.character}.wav`);
        } catch (e) { toast({ variant: 'destructive', title: 'Download Failed' }); }
    };

    const handleDownloadMasterWav = async () => {
        if (!audioBuffer || !syncData) {
            toast({ variant: 'destructive', title: 'Audio not loaded yet' });
            return;
        }
        toast({ title: 'Preparing WAV...', description: 'Rendering high-quality master track.' });
        try {
            const newDecodedOverrides: Record<number, AudioBuffer> = {};
            await Promise.all(syncData.dialogues.map(async (dialogue: any, idx: number) => {
                if (dialogue.audioOverridden && dialogue.useOverride !== false) {
                    try { newDecodedOverrides[idx] = await decodeDataUri(dialogue.audioOverridden, idx); } catch (e) {}
                }
            }));
            let elapsed = 0;
            const newNodeTimelines = syncData.dialogues.map((dialogue: any, idx: number) => {
                const pace = syncData.characterSettings?.[dialogue.character]?.speed || 1.0;
                const isOverridden = dialogue.audioOverridden && dialogue.useOverride !== false;
                let baseDuration = isOverridden ? (newDecodedOverrides[idx]?.duration || 0) : (syncData.timeline?.[idx]?.duration || 0);
                const effectiveDuration = baseDuration / pace;
                const start = elapsed; const end = start + effectiveDuration;
                elapsed = end + (silenceGap / 1000);
                return { start, end, duration: effectiveDuration, baseDuration };
            });
            const totalDuration = newNodeTimelines.length > 0 ? newNodeTimelines[newNodeTimelines.length - 1].end : 0;
            const ctx = new OfflineAudioContext(audioBuffer.numberOfChannels || 1, Math.ceil(totalDuration * audioBuffer.sampleRate), audioBuffer.sampleRate);
            for (let i = 0; i < syncData.dialogues.length; i++) {
                const dialogue = syncData.dialogues[i]; const nodeTimeline = newNodeTimelines[i];
                const pace = syncData.characterSettings?.[dialogue.character]?.speed || 1.0;
                const isOverridden = dialogue.audioOverridden && dialogue.useOverride !== false;
                const source = ctx.createBufferSource();
                if (isOverridden && newDecodedOverrides[i]) source.buffer = newDecodedOverrides[i];
                else source.buffer = audioBuffer;
                source.playbackRate.value = pace;
                source.connect(ctx.destination);
                if (isOverridden && newDecodedOverrides[i]) source.start(nodeTimeline.start);
                else source.start(nodeTimeline.start, syncData.timeline[i].startTime, syncData.timeline[i].duration);
            }
            const renderedBuffer = await ctx.startRendering();
            const wavBlob = audioBufferToWav(renderedBuffer);
            const safeName = project.projectName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || '12labs_audio';
            saveAs(wavBlob, `12labs_master_${safeName}.wav`);
            toast({ title: 'Download Successful', description: 'Master track downloaded as high-quality WAV.' });
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Download Failed', description: 'Could not render master WAV.' });
        }
    };

    const handleDownloadAllNodesZip = async () => {
        if (!audioBuffer || !syncData || !syncData.dialogues) {
            toast({ variant: 'destructive', title: 'No dialogues to package.' });
            return;
        }
        setIsZipping(true);
        toast({ title: 'Packaging ZIP...', description: 'Rendering individual dialogue nodes as WAV...' });
        try {
            const zip = new JSZip();
            const newDecodedOverrides: Record<number, AudioBuffer> = {};
            await Promise.all(syncData.dialogues.map(async (dialogue: any, idx: number) => {
                if (dialogue.audioOverridden && dialogue.useOverride !== false) {
                    try { newDecodedOverrides[idx] = await decodeDataUri(dialogue.audioOverridden, idx); } catch (e) {}
                }
            }));
            for (let i = 0; i < syncData.dialogues.length; i++) {
                const dialogue = syncData.dialogues[i];
                const useOverride = dialogue.audioOverridden && dialogue.useOverride !== false;
                let srcBuffer = audioBuffer;
                let off = syncData.timeline[i].startTime;
                let dur = syncData.timeline[i].duration;
                if (useOverride && dialogue.audioOverridden && newDecodedOverrides[i]) {
                    srcBuffer = newDecodedOverrides[i];
                    off = 0;
                    dur = srcBuffer.duration;
                }
                const pace = syncData.characterSettings?.[dialogue.character]?.speed || 1.0;
                const renderedDuration = dur / pace;
                const offlineCtx = new OfflineAudioContext(
                    srcBuffer.numberOfChannels || 1,
                    Math.ceil(renderedDuration * srcBuffer.sampleRate),
                    srcBuffer.sampleRate
                );
                const source = offlineCtx.createBufferSource();
                source.buffer = srcBuffer;
                source.playbackRate.value = pace;
                source.connect(offlineCtx.destination);
                source.start(0, off, dur);
                const rendered = await offlineCtx.startRendering();
                const wavBlob = audioBufferToWav(rendered);
                const cleanChar = dialogue.character.replace(/[^a-zA-Z0-9]/g, '_');
                const cleanLine = dialogue.line.slice(0, 15).replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `${String(i + 1).padStart(3, '0')}_${cleanChar}_${cleanLine}.wav`;
                zip.file(fileName, wavBlob);
            }
            const content = await zip.generateAsync({ type: 'blob' });
            const safeName = project.projectName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || '12labs_audio';
            saveAs(content, `12labs_nodes_${safeName}.zip`);
            toast({ title: 'ZIP Saved', description: 'All individual nodes downloaded as a ZIP archive.' });
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'ZIP Failed', description: 'Could not compile nodes ZIP.' });
        } finally {
            setIsZipping(false);
        }
    };

    const charList = useMemo(() => {
        if (!syncData?.dialogues) return [];
        const seen = new Set();
        return syncData.dialogues.map((d: any) => d.character).filter((c: string) => {
            const low = c.toLowerCase().trim();
            if (seen.has(low)) return false;
            seen.add(low); return true;
        });
    }, [syncData]);

    const activeVoicesList = (String(project.projectType) === 'pro-studio') ? proVoices : voices;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="max-w-4xl w-full h-[95vh] sm:h-[90vh] p-0 flex flex-col bg-background border rounded-2xl shadow-2xl overflow-hidden">
                <header className="px-5 py-3.5 flex flex-row items-center justify-between border-b shrink-0 bg-card z-50">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-primary rounded-xl shadow-md shadow-primary/20"><MicVocal className="h-4 w-4 text-primary-foreground" /></div>
                        <div>
                            <DialogTitle className="text-base sm:text-lg font-black uppercase tracking-tight">Studio AI Voice Editor</DialogTitle>
                            <DialogDescription className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Production & Voice Mastering</DialogDescription>
                        </div>
                    </div>
                    <DialogClose className="p-1.5 rounded-full hover:bg-muted transition-colors"><X className="h-4 w-4" /></DialogClose>
                </header>

                <div className="flex-1 relative overflow-y-auto bg-muted/5 p-4 sm:p-5">
                    <div className="max-w-3xl mx-auto space-y-5 pb-10">
                        {/* Master Controller Card */}
                        <Card className="rounded-2xl shadow-sm border border-border bg-card overflow-hidden">
                            <CardContent className="p-4 sm:p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                                            <MicVocal className="h-4 w-4" />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-wider text-foreground">Master Audio Track</span>
                                    </div>
                                    {isStale ? (
                                        <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-bold gap-1 px-2.5 py-0.5">
                                            <Zap className="h-3 w-3 fill-current animate-pulse" /> Pending Changes
                                        </Badge>
                                    ) : (
                                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-bold gap-1 px-2.5 py-0.5">
                                            <Check className="h-3 w-3" /> Audio Synced
                                        </Badge>
                                    )}
                                </div>

                                {(mergedAudioUrl || project.audioUrl) && (
                                    <div className="w-full space-y-2">
                                        <audio 
                                            ref={masterPlayerRef} 
                                            src={mergedAudioUrl || getDisplayUrl(project.audioUrl)} 
                                            controls 
                                            className="w-full h-10 rounded-lg accent-primary" 
                                            onPlay={() => setIsMasterPlaying(true)}
                                            onPause={() => setIsMasterPlaying(false)}
                                            onEnded={() => { setIsMasterPlaying(false); setActiveNodeIndex(null); }}
                                            onTimeUpdate={(e) => {
                                                const currentTime = e.currentTarget.currentTime;
                                                if (!syncData?.timeline || !Array.isArray(syncData.timeline)) return;
                                                const currentIdx = syncData.timeline.findIndex((item: any) => {
                                                    const start = item.startTime ?? item.start ?? 0;
                                                    const end = item.endTime ?? item.end ?? (start + (item.duration ?? 0));
                                                    return currentTime >= start && currentTime < end;
                                                });
                                                if (currentIdx !== -1 && currentIdx !== activeNodeIndex) {
                                                    setActiveNodeIndex(currentIdx);
                                                } else if (currentIdx === -1 && activeNodeIndex !== null) {
                                                    setActiveNodeIndex(null);
                                                }
                                            }}
                                        />

                                        <div className="flex flex-wrap items-center gap-2 pt-1.5 pb-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleDownloadMasterWav}
                                                className="flex-1 min-w-[140px] h-9 rounded-xl border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-black uppercase text-[10px] gap-1.5"
                                            >
                                                <FileAudio className="h-3.5 w-3.5" /> Download Master WAV
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleDownloadAllNodesZip}
                                                disabled={isZipping}
                                                className="flex-1 min-w-[140px] h-9 rounded-xl border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 font-black uppercase text-[10px] gap-1.5"
                                            >
                                                {isZipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                                                Download Nodes (.zip)
                                            </Button>
                                        </div>

                                        {activeNodeIndex !== null && syncData?.dialogues?.[activeNodeIndex] && (
                                            <div className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between animate-fadeIn">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                                                    <span className="text-[11px] font-black uppercase text-primary shrink-0">
                                                        Playing Line #{activeNodeIndex + 1} ({syncData.dialogues[activeNodeIndex].character}):
                                                    </span>
                                                    <span className="text-[11px] font-medium text-foreground truncate">
                                                        "{syncData.dialogues[activeNodeIndex].line}"
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
                                    <Button 
                                        onClick={mergeAudio} 
                                        disabled={isMerging || !isStale} 
                                        className={cn(
                                            "flex-1 h-10 rounded-xl font-black uppercase text-[10px] gap-2 transition-all shadow-sm", 
                                            isStale ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20" : "bg-muted text-muted-foreground"
                                        )}
                                    >
                                        {isMerging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 fill-current" />} 
                                        {isStale ? "Commit & Merge Audio" : "Master Track Synced"}
                                    </Button>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-10 px-3 rounded-xl gap-1 text-[10px] font-bold" 
                                            onClick={handleUndo} 
                                            disabled={history.length === 0}
                                        >
                                            <Undo2 className="h-4 w-4" />
                                            <span className="hidden sm:inline">Undo</span>
                                        </Button>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-10 px-3 rounded-xl gap-1 text-[10px] font-bold" 
                                            onClick={handleRedo} 
                                            disabled={future.length === 0}
                                        >
                                            <Redo2 className="h-4 w-4" />
                                            <span className="hidden sm:inline">Redo</span>
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Voice Replacement Status & Links Comparison */}
                        {activeVoiceReplacementJob && (
                            <Card className="rounded-2xl shadow-md border border-primary/20 bg-card overflow-hidden">
                                <CardHeader className="bg-primary/5 p-4 border-b">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-primary/15 text-primary rounded-lg animate-pulse">
                                                <Sparkles className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-xs font-black uppercase tracking-wider text-primary">Voice Swap Production Status</CardTitle>
                                                <CardDescription className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Real-Time Processing & Synthesis</CardDescription>
                                            </div>
                                        </div>
                                        <div>
                                            {activeVoiceReplacementJob.status === 'pending' && (
                                                <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-black uppercase px-2.5 py-0.5">
                                                    Pending
                                                </Badge>
                                            )}
                                            {activeVoiceReplacementJob.status === 'processing' && (
                                                <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px] font-black uppercase px-2.5 py-0.5 animate-pulse">
                                                    Processing
                                                </Badge>
                                            )}
                                            {activeVoiceReplacementJob.status === 'completed' && (
                                                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] font-black uppercase px-2.5 py-0.5">
                                                    <Check className="h-3 w-3 mr-1 inline" /> Completed
                                                </Badge>
                                            )}
                                            {activeVoiceReplacementJob.status === 'failed' && (
                                                <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] font-black uppercase px-2.5 py-0.5">
                                                    Failed
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 sm:p-5 space-y-4">
                                    {(activeVoiceReplacementJob.status === 'pending' || activeVoiceReplacementJob.status === 'processing') && (
                                        <div className="space-y-3 py-2">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-bold uppercase text-[10px] text-muted-foreground flex items-center gap-1.5">
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                                    {activeVoiceReplacementJob.character 
                                                        ? `Replacing character: ${activeVoiceReplacementJob.character}` 
                                                        : `Replacing bulk cast profiles...`}
                                                </span>
                                                <span className="font-black text-primary">{activeVoiceReplacementJob.progress || 10}%</span>
                                            </div>
                                            <Progress value={activeVoiceReplacementJob.progress || 10} className="h-2 rounded-full bg-muted" />
                                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center animate-pulse">
                                                Processing voice replacement, synthesizing professional character audio, and generating your high-fidelity master download track...
                                            </p>
                                        </div>
                                    )}

                                    {activeVoiceReplacementJob.status === 'completed' && (
                                        <div className="space-y-4">
                                            <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                                <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <ShieldCheck className="h-4 w-4" /> Voice Replacement Complete!
                                                </p>
                                                <p className="text-[10px] text-muted-foreground mt-1">
                                                    The voice swap has successfully finished processing. You can play and copy links for both the original track and the swapped track below:
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                 {/* Original Audio Card */}
                                                <div className="p-3.5 rounded-xl border bg-muted/10 space-y-3 flex flex-col justify-between">
                                                    <div>
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                            <FileAudio className="h-3.5 w-3.5" /> Original Audio Track
                                                        </span>
                                                    </div>
                                                    
                                                    {activeVoiceReplacementJob.originalAudioUrl && (
                                                        <audio 
                                                            src={getDisplayUrl(activeVoiceReplacementJob.originalAudioUrl)} 
                                                            controls 
                                                            className="w-full h-8 mt-1 rounded-lg accent-primary" 
                                                        />
                                                    )}

                                                    <Button 
                                                        variant="secondary" 
                                                        size="sm" 
                                                        className="w-full h-8 mt-2 text-[10px] font-black uppercase gap-1.5"
                                                        onClick={() => copyToClipboard(getDisplayUrl(activeVoiceReplacementJob.originalAudioUrl), "Original Audio")}
                                                    >
                                                        <Copy className="h-3 w-3" /> Copy Link
                                                    </Button>
                                                </div>

                                                {/* Swapped Audio Card */}
                                                <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-3 flex flex-col justify-between">
                                                    <div>
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                                                            <Sparkles className="h-3.5 w-3.5" /> Swapped Voice Track
                                                        </span>
                                                    </div>

                                                    {activeVoiceReplacementJob.editedAudioUrl && (
                                                        <audio 
                                                            src={getDisplayUrl(activeVoiceReplacementJob.editedAudioUrl)} 
                                                            controls 
                                                            className="w-full h-8 mt-1 rounded-lg accent-primary" 
                                                        />
                                                    )}

                                                    <Button 
                                                        variant="default" 
                                                        size="sm" 
                                                        className="w-full h-8 mt-2 text-[10px] font-black uppercase gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                                                        onClick={() => copyToClipboard(getDisplayUrl(activeVoiceReplacementJob.editedAudioUrl), "Swapped Audio")}
                                                    >
                                                        <Copy className="h-3 w-3" /> Copy Link
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {activeVoiceReplacementJob.status === 'failed' && (
                                        <div className="p-3.5 bg-destructive/5 border border-destructive/10 rounded-xl space-y-2">
                                            <div className="flex items-center gap-2 text-destructive text-xs font-bold uppercase tracking-wider">
                                                <AlertTriangle className="h-4 w-4" />
                                                Voice Replacement Failed
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                Server reported the following failure: {activeVoiceReplacementJob.error || 'Unknown server error.'}
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Voice Replacement Hub */}
                        <Card className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                            <CardHeader 
                                className="bg-muted/30 p-4 border-b flex flex-row items-center justify-between cursor-pointer"
                                onClick={() => setIsSwapHubOpen(!isSwapHubOpen)}
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                                        <RotateCcw className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xs font-black uppercase tracking-wider text-primary">Voice & Age Swap Hub</CardTitle>
                                        <CardDescription className="text-[10px] font-medium text-muted-foreground">Swap character voices and age groups (Kid / Adult / Old)</CardDescription>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] font-bold">{charList.length} Characters</Badge>
                                    {isSwapHubOpen ? <ChevronUp className="h-4 w-4 opacity-50" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
                                </div>
                            </CardHeader>

                            {isSwapHubOpen && (
                                <CardContent className="p-4 sm:p-5 space-y-4">
                                    {isProcessingSwap ? (
                                        <div className="py-6 space-y-3 text-center">
                                            <Progress value={swapProgress} className="h-2 rounded-full" />
                                            <p className="text-xs font-bold uppercase text-primary animate-pulse">
                                                {swappingChar ? `Swapping voice for ${swappingChar}...` : 'Syncing Voice Batch...'} {Math.round(swapProgress)}%
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Auto-detected character persona list */}
                                            <div className="space-y-3">
                                                {charList.map((charName: string) => {
                                                    const currentVoiceId = getAssignedVoiceId(charName);
                                                    const currentVoice = activeVoicesList.find(v => v.id === currentVoiceId);
                                                    const currentVoiceName = currentVoice?.name || 'Default';
                                                    const currentAge = getCharacterAge(charName);
                                                    const dialogueCount = getDialogueCount(charName);
                                                    const cost = getCharacterCost(charName);
                                                    const targetVoiceId = selectedVoiceForChar[charName] || currentVoiceId || '';

                                                    return (
                                                        <div key={charName} className="p-3.5 rounded-xl border bg-background/50 space-y-3">
                                                            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <Avatar className="h-7 w-7 border">
                                                                        <AvatarFallback className="text-[10px] font-black uppercase bg-primary/10 text-primary">
                                                                            {charName.slice(0, 2)}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    <div>
                                                                        <span className="text-xs font-black uppercase text-foreground">{charName}</span>
                                                                        <span className="text-[10px] text-muted-foreground ml-2">({dialogueCount} dialogues)</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <Badge variant="secondary" className="text-[9px] font-bold">
                                                                        Voice: {currentVoiceName}
                                                                    </Badge>
                                                                    <Badge variant="outline" className="text-[9px] font-bold uppercase bg-primary/5 text-primary border-primary/20">
                                                                        Age: {currentAge}
                                                                    </Badge>
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                                                <div className="sm:col-span-3">
                                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Age Group</Label>
                                                                    <Select value={currentAge} onValueChange={(v: 'Kid' | 'Adult' | 'Old') => updateCharacterAge(charName, v)}>
                                                                        <SelectTrigger className="h-10 rounded-xl text-xs font-bold uppercase border-primary/10 bg-background/50">
                                                                            <SelectValue placeholder="Age Group" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="Kid" className="text-xs font-bold uppercase">Kid (Child)</SelectItem>
                                                                            <SelectItem value="Adult" className="text-xs font-bold uppercase">Adult</SelectItem>
                                                                            <SelectItem value="Old" className="text-xs font-bold uppercase">Old (Senior)</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>

                                                                <div className="sm:col-span-5">
                                                                    <Label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Voice Persona</Label>
                                                                    <VoicePicker 
                                                                        currentVoiceId={targetVoiceId}
                                                                        onVoiceChange={(v) => setSelectedVoiceForChar(prev => ({ ...prev, [charName]: v }))}
                                                                        playingVoice={playingVoiceId}
                                                                        onTogglePlay={toggleVoicePreview}
                                                                        projectType={project.projectType}
                                                                    />
                                                                </div>

                                                                <div className="sm:col-span-4 flex justify-end">
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => handleSwapSingleCharacterVoice(charName, targetVoiceId)}
                                                                        disabled={!targetVoiceId || targetVoiceId === currentVoiceId || isProcessingSwap}
                                                                        className="w-full h-10 px-4 rounded-xl text-[10px] font-black uppercase gap-1.5"
                                                                    >
                                                                        <Sparkles className="h-3.5 w-3.5" />
                                                                        Swap Persona ({cost} Credits)
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Custom Bulk Swap Section */}
                                            {replacements.length > 0 && (
                                                <div className="pt-2 border-t space-y-3">
                                                    <span className="text-[10px] font-black uppercase text-muted-foreground block">Custom Bulk Mappings</span>
                                                    {replacements.map((entry) => (
                                                        <div key={entry.id} className="p-3 rounded-xl border bg-muted/10 space-y-2 relative">
                                                            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6 text-destructive" onClick={() => removeReplacement(entry.id)}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
                                                                <Select value={entry.charName} onValueChange={(v: string) => updateReplacement(entry.id, 'charName', v)}>
                                                                    <SelectTrigger className="h-9 rounded-lg text-xs font-bold uppercase">
                                                                        <SelectValue placeholder="Select Character" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {charList.map((c: string) => (
                                                                            <SelectItem key={c} value={c} className="text-xs font-bold uppercase">{c}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <VoicePicker 
                                                                    currentVoiceId={entry.newVoiceId} 
                                                                    onVoiceChange={(v: string) => updateReplacement(entry.id, 'newVoiceId', v)} 
                                                                    playingVoice={playingVoiceId} 
                                                                    onTogglePlay={toggleVoicePreview} 
                                                                    projectType={project.projectType}
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}

                                                    <Button onClick={handleBulkCastSwap} disabled={swapCostData.totalChars === 0} className="w-full h-10 rounded-xl font-black uppercase text-[10px]">
                                                        <Sparkles className="mr-2 h-3.5 w-3.5" /> Sync Custom Mappings ({swapCostData.cost} Credits)
                                                    </Button>
                                                </div>
                                            )}

                                            <div className="pt-1">
                                                <Button variant="outline" size="sm" onClick={addReplacement} className="w-full h-9 rounded-xl font-bold uppercase text-[10px] border-dashed">
                                                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Custom Mapping Row
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </CardContent>
                            )}
                        </Card>

                        {/* Dialogue Line Nodes */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Project Dialogues</span>
                                    <Badge variant="outline" className="text-[10px] font-bold">{syncData?.dialogues?.length || 0} Lines</Badge>
                                </div>
                                <Button 
                                    onClick={saveDialogueEdits} 
                                    size="sm" 
                                    className="h-8 px-3 rounded-xl font-black uppercase text-[10px] gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    <Save className="h-3.5 w-3.5" /> Save Dialogue Edits
                                </Button>
                            </div>

                            {syncData?.dialogues ? syncData.dialogues.map((dialogue: any, idx: number) => (
                                <Card key={idx} ref={el => { nodeRefs.current[idx] = el; }} className={cn("rounded-xl border transition-all overflow-hidden bg-card", (activeNodeIndex === idx || localNodePlayingIndex === idx) && "ring-2 ring-primary border-primary", dialogue.isEdited && "border-amber-500/50 bg-amber-500/5 dark:bg-amber-500/10 dark:border-amber-500/40")}>
                                    <div className="flex items-stretch min-h-[80px]">
                                        <div className={cn("w-10 sm:w-12 flex items-center justify-center border-r text-xs font-black shrink-0 transition-colors", (activeNodeIndex === idx || localNodePlayingIndex === idx) ? "bg-primary text-primary-foreground" : dialogue.isEdited ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-extrabold" : "bg-muted/30 text-muted-foreground")}>
                                            <span>{String(idx + 1).padStart(2, '0')}</span>
                                        </div>
                                        <div className="flex-1 p-3.5 min-w-0 space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-none text-[9px] font-black uppercase">
                                                        {dialogue.character}
                                                    </Badge>
                                                    <span className="text-[10px] text-muted-foreground font-semibold">
                                                        {getAssignedVoiceId(dialogue.character) ? `Voice: ${activeVoicesList.find(v => v.id === getAssignedVoiceId(dialogue.character))?.name || 'Assigned'}` : ''}
                                                    </span>
                                                    {dialogue.isEdited && (
                                                        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 text-[8px] font-black uppercase flex items-center gap-1">
                                                            <Edit className="h-2.5 w-2.5" /> Text Edited
                                                        </Badge>
                                                    )}
                                                    {(activeNodeIndex === idx || localNodePlayingIndex === idx) && (
                                                        <Badge className="bg-emerald-500 text-white border-none text-[8px] font-black uppercase animate-pulse flex items-center gap-1">
                                                            <Volume2 className="h-3 w-3" /> Live Playing
                                                        </Badge>
                                                    )}
                                                </div>
                                                {dialogue.isEdited && (
                                                    <Button 
                                                        onClick={() => handleResetDialogue(idx)} 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="h-6 px-2 text-[9px] font-bold uppercase text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 gap-1 rounded-md"
                                                    >
                                                        <RotateCcw className="h-2.5 w-2.5" /> Revert
                                                    </Button>
                                                )}
                                            </div>

                                            <Textarea 
                                                value={dialogue.line} 
                                                onChange={(e) => handleDialogueTextChange(idx, e.target.value)} 
                                                placeholder="Enter dialogue script text..."
                                                className={cn(
                                                    "text-xs sm:text-sm font-medium min-h-[60px] rounded-xl transition-all p-2.5 leading-relaxed resize-y",
                                                    dialogue.isEdited 
                                                        ? "bg-amber-500/10 border-amber-500/30 focus:border-amber-500/60 text-foreground" 
                                                        : "bg-background/60 border-primary/10 focus:border-primary/40"
                                                )}
                                            />
                                        </div>
                                        <div className="w-12 sm:w-16 shrink-0 flex items-center justify-center pr-2">
                                            <Button onClick={() => toggleNodePlay(idx)} variant="ghost" size="icon" className={cn("h-9 w-9 sm:h-11 sm:w-11 rounded-full shadow-md transition-all", (activeNodeIndex === idx || localNodePlayingIndex === idx) ? "bg-green-600 text-white" : "text-primary bg-primary/10")}>
                                                {(activeNodeIndex === idx || localNodePlayingIndex === idx) ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            )) : (
                                <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                                    <AlertTriangle className="h-10 w-10 mb-2 text-amber-500" />
                                    <p className="text-sm font-bold uppercase tracking-wider">No Dialogue Data Found</p>
                                    <p className="text-xs text-muted-foreground mt-1">This project may not support dialogue editing.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
