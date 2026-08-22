'use server';

/**
 * @fileOverview An AI agent that detects if a script is a horror script.
 */

import { ai } from '@/ai/genkit';
import {z} from 'zod';
import { GENERAL_PURPOSE_MODEL } from '@/ai/config';
import { sendToTelegram } from '@/lib/telegram-logger';

const DetectScriptGenreInputSchema = z.object({
  script: z.string().describe('The script to analyze.'),
});
export type DetectScriptGenreInput = z.infer<
  typeof DetectScriptGenreInputSchema
>;

const DetectScriptGenreOutputSchema = z.object({
    isHorror: z.boolean().describe('Whether the script is a horror script or not.'),
});

export async function detectScriptGenre(
  input: DetectScriptGenreInput
): Promise<{ isHorror: boolean; usedBridge: boolean }> {
  try {
    const result = await detectScriptGenreFlow(input);
    return result;
  } catch (error: any) {
    const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];
    const errorMessage = `🚨 **Flow Error: detectScriptGenre**\n<b>Error:</b> <pre>${mainErrorMessage}</pre>`;
    await sendToTelegram(errorMessage);
    throw error;
  }
}

const genreDetectionPrompt = ai.definePrompt({
    name: 'genreDetectionPrompt',
    input: { schema: DetectScriptGenreInputSchema },
    output: { schema: DetectScriptGenreOutputSchema },
    model: GENERAL_PURPOSE_MODEL,
    prompt: `Analyze the following script and determine if it belongs to the horror genre. Consider themes, tone, and events.

Script:
---
{{{script}}}
---

Respond with true if it is a horror script, and false otherwise.`,
});

const detectScriptGenreFlow = ai.defineFlow(
  {
    name: 'detectScriptGenreFlow',
    inputSchema: DetectScriptGenreInputSchema,
  },
  async (input) => {
    const { output, custom } = await genreDetectionPrompt(input);
    if (!output) {
        throw new Error('The AI model returned an invalid format for script genre.');
    }
    return { ...output, usedBridge: !!(custom as any)?.bridge };
  }
);
