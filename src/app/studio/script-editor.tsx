

'use client';

import React, { useState } from 'react';
import { useStudio } from '@/context/studio-provider';
import { useAuth } from '@/context/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2, FileUp, Trash2, Copy, Check, Coins, AlertCircle, ShieldAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import mammoth from 'mammoth';
import { cn } from '@/lib/utils';
import { ClaudeDiscountDialog } from '@/components/studio/claude-discount-dialog';
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

export function ScriptEditor() {
  const { user } = useAuth();
  const { 
    script, setScript, analyzeScript, isAnalyzing, analysisStatus, 
    scriptState, clearStudioState, dailyAnalysisCount = 0, maxDailyAnalysisLimit = 2 
  } = useStudio();
  const { toast } = useToast();
  const [isCopied, setIsCopied] = useState(false);
  const [showCopyButton, setShowCopyButton] = useState(false);

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
          console.error('Error parsing .docx file:', error);
          toast({ variant: 'destructive', title: 'Error reading .docx file.' });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast({ variant: 'destructive', title: 'Unsupported file type', description: 'Please upload a .txt or .docx file.' });
    }
    // Reset file input to allow re-uploading the same file
    event.target.value = '';
  };
  
  const handleCopyToClipboard = () => {
    if (!script) return;
    navigator.clipboard.writeText(script);
    setIsCopied(true);
    toast({ title: 'Script copied to clipboard!' });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const characterCount = script.length;
  const isCharCountValid = characterCount > 0 && characterCount <= 30000;
  const isMinCharCountValid = characterCount >= 10;
  const isAnalyzed = scriptState === 'valid';

  const handleTextareaClick = () => {
      if (isAnalyzed) {
          setShowCopyButton(true);
          setTimeout(() => setShowCopyButton(false), 3000); // Hide button after 3 seconds
      }
  };

  return (
    <Card>
      <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">AI Voice Studio</CardTitle>
          <CardDescription>
            {isAnalyzed ? (
              <span>Your script is locked. To make changes, clear the studio and start over.</span>
            ) : (
              <span>Paste your script here, analyze it to find characters, then generate a complete voiceover with realistic AI voices.</span>
            )}
          </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
            <Textarea
              placeholder="Paste your script here..."
              className="min-h-[250px] md:min-h-[300px] text-base"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              readOnly={isAnalyzed}
              onClick={handleTextareaClick}
              style={{ cursor: isAnalyzed ? 'pointer' : 'auto' }}
            />
            {isAnalyzed && showCopyButton && (
                <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2 animate-in fade-in"
                    onClick={handleCopyToClipboard}
                >
                    {isCopied ? (
                        <Check className="mr-2 h-4 w-4 text-green-500" />
                    ) : (
                        <Copy className="mr-2 h-4 w-4" />
                    )}
                    {isCopied ? 'Copied!' : 'Copy Script'}
                </Button>
            )}
        </div>
        <div
          className={cn(
            "text-right text-sm mt-2 font-mono",
            (characterCount > 30000 || (characterCount > 0 && !isMinCharCountValid && !isAnalyzed)) ? "text-destructive" : "text-muted-foreground"
          )}
        >
            {characterCount > 0 && !isMinCharCountValid && !isAnalyzed && `(Min 10) `}
            {characterCount.toLocaleString()}/30,000 chars
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
         <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
             <Label htmlFor="file-upload" className="w-full cursor-pointer">
                <Button asChild variant="outline" className="w-full" disabled={isAnalyzed}>
                <div>
                    <FileUp className="mr-2 h-4 w-4" />
                    Upload (.txt, .docx)
                </div>
                </Button>
            </Label>
            
            <ClaudeDiscountDialog className="w-full h-10" />

            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive" disabled={!script}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Clear Studio
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete your current script and all voice assignments. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={clearStudioState}>Clear Studio</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          </div>
          <input
            id="file-upload"
            type="file"
            className="hidden"
            accept=".txt,.docx"
            onChange={handleFileChange}
            disabled={isAnalyzed}
          />

          {(() => {
            const isSponsorOrAdmin = user?.isSponsor === true || user?.role === 'admin';
            const userCredits = Number(user?.credits ?? 0);
            const charCount = script.trim().length;
            const isNotEnoughCredits = !isSponsorOrAdmin && charCount > 0 && userCredits < charCount;
            const isDailyLimitReached = !isSponsorOrAdmin && dailyAnalysisCount >= maxDailyAnalysisLimit;
            const isAnalyzeDisabled = !script.trim() || isAnalyzing || !isCharCountValid || isAnalyzed || !isMinCharCountValid || isNotEnoughCredits || isDailyLimitReached;

            return (
              <div className="w-full space-y-2 mt-2">
                {!isAnalyzed && (
                  <div className="w-full flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold px-1 flex-wrap gap-1">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Coins className="h-3.5 w-3.5 text-amber-500" />
                        Credits: <strong className="text-foreground">{userCredits.toLocaleString()}</strong>
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                        Daily Analysis: {dailyAnalysisCount}/{maxDailyAnalysisLimit}
                      </span>
                    </div>

                    {isNotEnoughCredits && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Not Enough Credits! Script has {charCount.toLocaleString()} chars, but you have {userCredits.toLocaleString()} credits.</span>
                      </div>
                    )}

                    {isDailyLimitReached && !isNotEnoughCredits && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>Daily Limit Reached ({dailyAnalysisCount}/{maxDailyAnalysisLimit}). Upgrade to Paid for 5/day.</span>
                      </div>
                    )}
                  </div>
                )}

                <Button onClick={analyzeScript} disabled={isAnalyzeDisabled} className="w-full">
                  {isAnalyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{analysisStatus || 'Analyzing'}...</span>
                    </span>
                  ) : isNotEnoughCredits ? (
                    <span className="flex items-center justify-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span>Not Enough Credits</span>
                    </span>
                  ) : isDailyLimitReached ? (
                    <span className="flex items-center justify-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      <span>Daily Limit Reached ({dailyAnalysisCount}/{maxDailyAnalysisLimit})</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Wand2 className="h-4 w-4" />
                      <span>{isAnalyzed ? 'Script Analyzed' : 'Analyze Script'}</span>
                    </span>
                  )}
                </Button>
              </div>
            );
          })()}
      </CardFooter>
    </Card>
  );
}
