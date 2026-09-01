'use server';
/**
 * @fileOverview AI flow for generating creative story scripts.
 * Optimized for production: Professional Screenplay Format, Strict Name:Dialogue structure, MAXIMUM length control.
 * TARGET: 13k, 25k, 40k character depth.
 * Updated: Strictly respects Genre, Audience, and Tone parameters.
 *
 * ⚠️ NO LONGER CALLED (as of this change): script generation moved back
 * server-side to the HQ Cluster's script_generation.py (direct Gemini keys,
 * Firestore `script_projects` pending-job listener) — see
 * src/app/script-generator/page.tsx#handleGenerate, which now only submits
 * the job via deductScriptCreditsAction and waits on
 * RTDB tempScriptGenerations/{uid}/{mappingId} for the result, the same way
 * music/thumbnail generation already work. This file is left in place
 * (importable) in case a client-side fallback path is wanted again later —
 * it is NOT wired into any current call site. Its emotion-tag format also
 * does NOT match EMOTION_ALLOWED_TAGS/the "[ tag ]" shape studio.py's voice
 * engine requires, so it would need fixing before being reconnected.
 */


import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { GENERAL_PURPOSE_MODEL } from '@/ai/config';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

const GenerateStoryInputSchema = z.object({
  scriptType: z.string(),
  genre: z.string(),
  tone: z.string(),
  audience: z.string(),
  language: z.string(),
  perspective: z.string(),
  wordCount: z.string(),
  numberOfCharacters: z.string(),
  additionalInstructions: z.string().optional(),
  plotSummary: z.string().optional(),
  userEmail: z.string().optional(),
  userName: z.string().optional(),
  userId: z.string().optional(),
  cost: z.number().optional(),
  mappingId: z.string().optional(),
  projectName: z.string().optional(),
});

export type GenerateStoryInput = z.infer<typeof GenerateStoryInputSchema>;

/** 🎬 PROFESSIONAL SCRIPT WRITER & FORMATTER ENGINE PROMPT */
const promptTemplate = `You are a professional AI Screenwriter and Script Formatter. Your task is to take the user's provided story idea, plot, or specific instructions and craft a high-quality, dialogue-driven manuscript that strictly honors all requested parameters.

### 🎭 PRODUCTION PROTOCOL:
- **FORMAT**: Use standard screenplay dialogue format: **Character Name: [Emotion] Dialogue**.
- **EMOTION TAGS**: Mandatory for every line. Choose expressive tags (e.g., [Whispering], [Angry], [Terrified], [Sarcastic], [Warmly], [Dramatic], [Curious], [Excited]).
- **NARRATION**: Use exactly "Narrator: [Neutral]" (translate the word "Narrator" into {{language}} if needed, but keep it as a single consistent name throughout) for all narrations and internal monologues. Never label narration lines as "Storyteller" or anything else — always "Narrator".
- **CHARACTER SETUP RULE**: If Character Setup is "Storyteller Only" or "0 Characters", the ENTIRE script must be narrated only — every single line is "Narrator:" with no other character names at all. Otherwise, include exactly the requested number of named, distinct dialogue characters in addition to the Narrator's connecting narration.
- **PERSPECTIVE RULE**: Strictly follow the requested Perspective / POV for how the story is told (who is narrating, whose point of view drives the story).
- **STRICT USER INTENT & VERBATIM RULE**: Follow the user's provided storyline, characters, plot points, and specific instructions with 100% strict fidelity. Do not replace or distort the user's storyline.
- **STRUCTURE**: Focus on high-impact dialogue and engaging storytelling. Do not output raw stage directions like [Camera pans] or [Scene shifts].
- **LANGUAGE**: Always write and output in {{language}}.
- **LENGTH**: Write enough dialogue and narration to genuinely reach the requested Target Length — do not stop early.
- **NO CHATTER**: Output ONLY the final script. No intros, no outros, no "Here is your script".

### 🎭 COMPLETE PRODUCTION SPECIFICATIONS:
- **Script Type / Purpose**: {{scriptType}}
- **Genre**: {{genre}}
- **Language**: {{language}}
- **Emotional Tone**: {{tone}}
- **Target Audience**: {{audience}}
- **Perspective / POV**: {{perspective}}
- **Character Setup**: {{numberOfCharacters}}
- **Target Length**: {{wordCount}} characters depth.

### 📜 USER STORY, PLOT & INSTRUCTIONS:
{{{plotSummary}}}

Begin the professional script production now:`;

export async function generateStoryScript(input: GenerateStoryInput): Promise<{ text: string; usedBridge: boolean; keyName: string }> {
    try {
        const cleanWordCount = input.wordCount;
        const userProvidedStory = (input.plotSummary || input.additionalInstructions || '').trim();
        
        const response = await ai.generate({
            model: GENERAL_PURPOSE_MODEL,
            prompt: promptTemplate
                .replace(/{{scriptType}}/g, input.scriptType || 'YouTube Story Script')
                .replace(/{{genre}}/g, input.genre || 'Moral')
                .replace(/{{tone}}/g, input.tone || 'Serious')
                .replace(/{{audience}}/g, input.audience || 'General Audience')
                .replace(/{{perspective}}/g, input.perspective || 'Third-person omniscient')
                .replace(/{{language}}/g, input.language || 'Hindi')
                .replace(/{{wordCount}}/g, cleanWordCount)
                .replace(/{{numberOfCharacters}}/g, input.numberOfCharacters || 'Storyteller Only')
                .replace(/{{{plotSummary}}}/g, userProvidedStory || `Create a compelling, original story script perfectly matching the ${input.genre} genre, ${input.tone} tone, and ${input.audience} audience.`),
            config: { 
                maxOutputTokens: 8192, 
                temperature: 0.8 
            },
            // @ts-ignore
            metadata: { 
                userEmail: input.userEmail || "Anonymous", 
                userName: input.userName || (input.userEmail ? input.userEmail.split('@')[0] : "User"),
                userId: input.userId,
                mappingId: input.mappingId, 
                projectName: input.projectName || input.scriptType,
                taskType: "Script Generation",
                generationParams: {
                    scriptType: input.scriptType,
                    genre: input.genre,
                    language: input.language,
                    wordCount: cleanWordCount,
                    additionalInstructions: userProvidedStory,
                    perspective: input.perspective,
                    audience: input.audience,
                    numberOfCharacters: input.numberOfCharacters,
                    cost: input.cost || 1000
                }
            }
        });

        if (!response.text) throw new Error("The AI engine failed to return text.");
        
        return { 
            text: response.text, 
            usedBridge: !!(response.custom as any)?.bridge,
            keyName: (response.custom as any)?.keyName || 'Production-Node'
        };
    } catch (error: any) {
    reportServerError('src/ai/flows/generate-story-script.ts#1', error);
        const errMsg = `📝🚨 <b>Script Generator Failure</b>\n\n<b>User:</b> ${escapeHtml(input.userEmail || 'Anonymous')}\n<b>Error:</b> <pre>${escapeHtml(error.message)}</pre>`;
        await sendToTelegram(errMsg);
        throw error;
    }
}