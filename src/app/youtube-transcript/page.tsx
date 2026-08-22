'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wand2, Copy, Youtube, FileText, Check } from 'lucide-react';
import { getYouTubeTranscriptAction } from '@/app/youtube-actions';
import { useAuth } from '@/context/auth-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import Head from 'next/head';

const languages = [
    { value: 'en', label: 'English' },
    { value: 'hi', label: 'Hindi' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'it', label: 'Italian' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'ru', label: 'Russian' },
];

export default function YouTubeTranscriptPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [videoUrl, setVideoUrl] = useState('');
    const [lang, setLang] = useState('en');
    const [transcript, setTranscript] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const handleFetchTranscript = async () => {
        if (!videoUrl.trim()) {
            toast({ variant: 'destructive', title: 'URL is required.' });
            return;
        }

        if (!user || !user.email) {
            toast({ variant: 'destructive', title: 'Login Required' });
            return;
        }

        setIsLoading(true);
        setTranscript('');

        try {
            const result = await getYouTubeTranscriptAction(videoUrl, user.email, lang);
            if (result.success && result.transcript) {
                setTranscript(result.transcript);
                toast({ title: 'Transcript fetched successfully!' });
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            console.error("Transcript fetch failed:", error);
            toast({ variant: 'destructive', title: 'Failed to fetch transcript', description: error.message || "An unknown error occurred." });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCopyToClipboard = () => {
        if (!transcript) return;
        navigator.clipboard.writeText(transcript);
        setIsCopied(true);
        toast({ title: 'Transcript copied to clipboard!' });
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <div className="container mx-auto max-w-4xl py-10">
            <Head>
                <title>YouTube Transcript Generator - Extract Text from Video | 12Labs</title>
                <meta name="description" content="Instantly extract text transcripts from any YouTube video. The 12Labs Transcript tool supports Hindi, English, and 10+ languages for research and content reuse." />
            </Head>
            <div className="space-y-8">
                <Card>
                    <CardHeader>
                         <div className="flex items-center gap-3">
                            <Youtube className="h-8 w-8 text-red-500" />
                            <div>
                                <CardTitle className="text-3xl font-bold">YouTube Transcript Generator</CardTitle>
                                <CardDescription>Get the full transcript of any YouTube video. Then, use it with our <Link href="/seo-kit" prefetch={false} className="text-primary underline">SEO Kit</Link>.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input
                                type="text"
                                placeholder="https://www.youtube.com/watch?v=..."
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                                disabled={isLoading}
                                className="md:col-span-2 text-base"
                            />
                             <Select value={lang} onValueChange={setLang} disabled={isLoading}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select language" />
                                </SelectTrigger>
                                <SelectContent>
                                    {languages.map((l) => (
                                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <Button onClick={handleFetchTranscript} disabled={isLoading || !videoUrl.trim()} className="w-full">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                            {isLoading ? 'Fetching Transcript...' : 'Get Transcript'}
                        </Button>
                    </CardContent>
                </Card>

                {(isLoading || transcript) && (
                    <Card className="animate-in fade-in-50">
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-6 w-6 text-primary" />
                                    <CardTitle>Generated Transcript</CardTitle>
                                </div>
                                {transcript && !isLoading && (
                                    <Button size="sm" variant="ghost" onClick={handleCopyToClipboard}>
                                        {isCopied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Copy className="mr-2 h-4 w-4" />}
                                        {isCopied ? 'Copied!' : 'Copy'}
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                             {isLoading && !transcript && (
                                <div className="flex items-center justify-center p-10 text-muted-foreground">
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                             )}
                            <Textarea
                                readOnly
                                value={transcript}
                                placeholder="Fetching transcript from the video..."
                                className="min-h-[300px] bg-muted/50 text-sm font-sans"
                            />
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
