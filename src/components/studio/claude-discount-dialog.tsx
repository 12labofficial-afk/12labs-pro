'use client';

import React, { useState, useRef, useContext } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  Copy, 
  Check, 
  Sparkles, 
  Upload, 
  Bot, 
  ChevronDown, 
  ChevronUp,
  FileText,
  Smile,
  ExternalLink,
  HelpCircle,
  ClipboardCheck,
  ArrowRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { StudioContext } from '@/context/studio-provider';
import { ProStudioContext } from '@/context/pro-studio-provider';
import { cn } from '@/lib/utils';

export function getClaudePrompt(includeEmotion: boolean) {
  return `You are a professional script formatting and character analysis engine.
Your task is to analyze the provided story/plot and return a STRICT JSON object containing the character details, genders, dialogues, and emotions.

### CRITICAL RULES:
1. Keep all dialogue and narration 100% VERBATIM. Do not modify, rephrase, or remove any spoken words.
2. Keep the original language/script (Hindi, English, Hinglish, etc.) exactly as provided.
3. Identify all characters speaking in the story and accurately determine their gender ("male" or "female").
4. For general narration or story description, assign character as "Storyteller" or "Narrator" with gender "male".
5. ${includeEmotion 
    ? 'For each dialogue line, analyze the context and assign a realistic emotion (e.g. "serious", "angry", "sad", "happy", "fearful", "emotional", "excited", "whisper", "calm", "neutral").' 
    : 'Set emotion to "neutral" for all dialogue lines.'}
6. Strip only non-spoken production notes, scene headings (e.g. "Scene 1", "INT. ROOM"), and camera directions.
7. Return ONLY the raw JSON output without any conversational preamble, notes, or markdown formatting outside the JSON.

### REQUIRED JSON OUTPUT STRUCTURE:
\`\`\`json
{
  "characters": [
    {
      "name": "Character Name",
      "gender": "male or female",
      "ageGroup": "adult, kid, or old"
    }
  ],
  "dialogues": [
    {
      "character": "Character Name",
      "emotion": "emotion tag",
      "text": "Exact verbatim dialogue text"
    }
  ]
}
\`\`\``;
}

export const CLAUDE_ANALYSIS_PROMPT = getClaudePrompt(false);

export function ClaudeDiscountDialog({ className }: { className?: string }) {
  const studioCtx = useContext(StudioContext);
  const proStudioCtx = useContext(ProStudioContext);

  const [localIncludeEmotion, setLocalIncludeEmotion] = useState(false);
  const [pastedScriptText, setPastedScriptText] = useState('');
  const [claudeResponseText, setClaudeResponseText] = useState('');
  const [open, setOpen] = useState(false);
  const [isCopiedPrompt, setIsCopiedPrompt] = useState(false);
  const [isExpandedPrompt, setIsExpandedPrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const isAnalyzed = studioCtx ? studioCtx.scriptState === 'valid' : proStudioCtx ? proStudioCtx.scriptState === 'valid' : false;
  const includeEmotion = studioCtx ? studioCtx.includeEmotion : localIncludeEmotion;
  const setIncludeEmotion = studioCtx ? studioCtx.setIncludeEmotion : setLocalIncludeEmotion;

  const applyExternalAnalysis = (rawInput: any): boolean => {
    if (studioCtx) {
      return studioCtx.applyExternalAnalysis(rawInput, true);
    }
    if (proStudioCtx) {
      return proStudioCtx.applyExternalAnalysis(rawInput, true);
    }
    return false;
  };

  const activePrompt = getClaudePrompt(includeEmotion);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(activePrompt);
    setIsCopiedPrompt(true);
    toast({
      title: 'Prompt Copied!',
      description: `Copied Formatter Prompt (${includeEmotion ? 'WITH Emotions' : 'Standard'}) to clipboard.`
    });
    setTimeout(() => setIsCopiedPrompt(false), 2500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const success = applyExternalAnalysis(content, true);
      if (success) {
        setOpen(false);
        setPastedScriptText('');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={isAnalyzed}
          className={cn(
            "relative group border-primary/25 bg-background/80 hover:bg-primary/5 text-primary font-bold text-[11px] rounded-xl transition-all h-auto py-2 px-3 gap-1.5 shadow-2xs active:scale-95",
            className
          )}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse shrink-0" />
          <span>Save 20%</span>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none font-bold text-[9px] px-1.5 py-0 h-4 rounded-md">
            Claude
          </Badge>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] flex flex-col p-0 rounded-[2rem] border-border bg-card text-card-foreground shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 sm:p-8 pb-4 border-b border-border bg-muted/20 flex-shrink-0">
          <DialogHeader className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <Badge className="bg-primary text-primary-foreground font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-full mb-1">
                    20% Discount
                  </Badge>
                  <DialogTitle className="text-2xl sm:text-3xl font-black tracking-tight uppercase leading-none">
                    Claude AI <span className="text-primary italic">Formatter</span>
                  </DialogTitle>
                </div>
              </div>
            </div>

            <DialogDescription className="text-xs sm:text-sm font-medium text-muted-foreground leading-relaxed">
              Format your story in Claude AI for free, then paste the script or upload the file below to activate your <strong>20% discount</strong>.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 sm:p-8 space-y-6 custom-scrollbar">
          
          {/* Emotion Tags Toggle */}
          <div className="p-4 rounded-2xl border border-border bg-muted/30 flex items-center justify-between gap-4 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-3.5">
              <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
                <Smile className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <Label htmlFor="claude-emotion-chk" className="text-sm font-black uppercase tracking-tight cursor-pointer flex items-center gap-1.5">
                  Include Emotion Tags
                </Label>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                  {includeEmotion ? "Character Name: [Emotion] Dialogue" : "Character Name: Dialogue (Standard)"}
                </p>
              </div>
            </div>
            <Checkbox 
              id="claude-emotion-chk"
              checked={includeEmotion}
              onCheckedChange={(val) => setIncludeEmotion(val as boolean)}
              className="h-5 w-5 rounded-md border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>

          {/* ACTION 1: PREPARE SCRIPT FOR CLAUDE */}
          <div className="space-y-3 p-5 rounded-2xl border border-border bg-background shadow-xs">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                1. Paste Unstructured Story/Plot
              </Label>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Source Content
              </span>
            </div>

            <Textarea
              placeholder={`Paste your raw story, plot, or messy script here...\n\nExample:\nVikram was angry. He said "Stop right there!". Then Storyteller says "Once upon a time..."`}
              value={pastedScriptText}
              onChange={(e) => setPastedScriptText(e.target.value)}
              className="min-h-[140px] text-xs sm:text-sm font-mono rounded-xl bg-muted/20 border-border p-4 focus-visible:ring-primary leading-relaxed"
            />

            <Button
              onClick={() => {
                if (!pastedScriptText.trim()) {
                   toast({ variant: 'destructive', title: 'Empty Content', description: 'Please paste your story first.' });
                   return;
                }
                const fullText = `### STORY TO FORMAT ###\n\n${pastedScriptText}\n\n### FORMATTING INSTRUCTIONS ###\n\n${activePrompt}`;
                const blob = new Blob([fullText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `12Labs_Claude_Script_Prep.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                toast({
                  title: 'Preparation File Ready! ⚡',
                  description: 'Download started. Give this file to Claude AI for formatting.'
                });
              }}
              disabled={!pastedScriptText.trim()}
              className="w-full h-11 rounded-xl font-black text-xs uppercase tracking-widest gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md active:scale-98 transition-all"
            >
              <FileText className="h-4 w-4" />
              Download Claude Prep File (.txt)
            </Button>
          </div>

          {/* OR DIVIDER */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <span className="relative px-4 text-[10px] font-black uppercase tracking-widest bg-card text-muted-foreground rounded-full border border-border">
              THEN UPLOAD CLAUDE'S RESULT
            </span>
          </div>

          {/* ACTION 2: UPLOAD FILE OR PASTE FROM CLAUDE */}
          <div className="space-y-4 p-5 rounded-2xl border border-border bg-background shadow-xs">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Upload className="h-4 w-4 text-emerald-500" />
                2. Import Claude's Formatted Result
              </Label>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Save 20%
              </span>
            </div>

            {/* Direct Paste Box */}
            <div className="space-y-2">
              <Textarea
                placeholder={`Option A: Paste Claude's response (JSON or Script text) here...\n\nAccepts JSON (with characters, gender & emotions) or standard script format.`}
                value={claudeResponseText}
                onChange={(e) => setClaudeResponseText(e.target.value)}
                className="min-h-[100px] text-xs font-mono rounded-xl bg-muted/20 border-border p-3 focus-visible:ring-primary leading-relaxed"
              />
              <Button
                type="button"
                onClick={() => {
                  if (!claudeResponseText.trim()) {
                    toast({ variant: 'destructive', title: 'Empty Content', description: "Please paste Claude's formatted output first." });
                    return;
                  }
                  const success = applyExternalAnalysis(claudeResponseText, true);
                  if (success) {
                    setOpen(false);
                    setPastedScriptText('');
                    setClaudeResponseText('');
                  }
                }}
                disabled={!claudeResponseText.trim()}
                className="w-full h-10 rounded-xl font-black text-xs uppercase tracking-wider gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-98 transition-all"
              >
                <Sparkles className="h-4 w-4" />
                Apply 20% Discount & Import Script
              </Button>
            </div>

            <div className="relative flex items-center justify-center my-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/60" />
              </div>
              <span className="relative px-3 text-[9px] font-black uppercase tracking-widest bg-background text-muted-foreground">
                OR OPTION B: UPLOAD FILE
              </span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".txt,.json"
              className="hidden"
            />

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="group cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/10 hover:bg-primary/5 hover:border-primary/40 p-4 text-center transition-all"
            >
              <div className="flex items-center justify-center gap-3">
                <div className="p-2 rounded-lg bg-background border border-border text-primary shadow-xs group-hover:scale-105 transition-transform shrink-0">
                  <Upload className="h-4 w-4" />
                </div>
                <div className="text-left space-y-0.5">
                  <p className="text-xs font-black uppercase tracking-tight text-foreground">
                    Upload .txt or .json File
                  </p>
                  <p className="text-[10px] font-medium text-muted-foreground">
                    Click to select file downloaded from Claude
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* GUIDE SECTION */}
          <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" />
                <span className="text-xs font-black uppercase tracking-wider text-primary">
                  How To Use Claude AI (Guide)
                </span>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopyPrompt}
                className="h-8 px-3 text-[10px] font-black uppercase tracking-widest gap-1.5 rounded-lg border-primary/30 text-primary hover:bg-primary/10"
              >
                {isCopiedPrompt ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {isCopiedPrompt ? 'Copied Prompt' : 'Copy Prompt'}
              </Button>
            </div>

            <ol className="space-y-2.5 text-xs text-muted-foreground font-medium list-decimal list-inside pl-1">
              <li className="leading-relaxed">
                Click <strong>"Copy Prompt"</strong> above to copy the formatting instructions.
              </li>
              <li className="leading-relaxed">
                Open <a href="https://claude.ai" target="_blank" rel="noreferrer" className="text-primary font-bold inline-flex items-center gap-1 hover:underline">Claude.ai <ExternalLink className="h-3 w-3" /></a> and paste the prompt along with your raw story.
              </li>
              <li className="leading-relaxed">
                Copy Claude's formatted response or save it as a <code className="text-foreground font-mono bg-muted px-1 py-0.5 rounded text-[10px]">.txt</code> file and paste/upload it in the boxes above!
              </li>
            </ol>

            {/* Expandable Prompt Preview */}
            <div className="pt-2 border-t border-primary/10">
              <button
                type="button"
                onClick={() => setIsExpandedPrompt(!isExpandedPrompt)}
                className="flex items-center justify-between w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground py-1"
              >
                <span>View Raw Formatter Prompt</span>
                {isExpandedPrompt ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {isExpandedPrompt && (
                <div className="mt-2 p-3.5 rounded-xl bg-background border border-border">
                  <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto custom-scrollbar">
                    {activePrompt}
                  </pre>
                </div>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
