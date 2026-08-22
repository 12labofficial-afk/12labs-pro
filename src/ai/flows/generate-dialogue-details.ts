'use server';

/**
 * @fileOverview An AI agent that breaks down a script into a structured list of dialogue lines.
 * Optimized: 500-char node limit with consecutive merging logic for Admin Auto-Gen.
 */

import { ai } from '@/ai/genkit';
import {z} from 'zod';
import { GENERAL_PURPOSE_MODEL } from '@/ai/config';
import { sendToTelegram } from '@/lib/telegram-logger';

const GenerateDialogueDetailsInputSchema = z.object({
  script: z.string().describe('The full script content.'),
  characterNames: z.array(z.string()).describe('A list of all known character names in the script.'),
  userEmail: z.string().optional().describe('The email of the user for logging purposes.'),
});
export type GenerateDialogueDetailsInput = z.infer<
  typeof GenerateDialogueDetailsInputSchema
>;

const DialogueLineSchema = z.object({
    character: z.string().describe('The name of the character speaking the line.'),
    text: z.string().describe('The dialogue spoken by the character.'),
});

const GenerateDialogueDetailsOutputSchema = z.object({
    lines: z.array(DialogueLineSchema).describe('A structured array of dialogue lines from the script.'),
});
export type GenerateDialogueDetailsOutput = z.infer<
  typeof GenerateDialogueDetailsOutputSchema
>;

/**
 * ⚡ DIALOGUE NORMALIZATION ENGINE (Consolidated)
 */
function normalizeAndChunkLines(rawLines: { character: string; text: string }[]): { character: string; text: string }[] {
    if (rawLines.length === 0) return [];

    const merged: { character: string; text: string }[] = [];
    rawLines.forEach((line) => {
        const last = merged[merged.length - 1];
        const currentChar = line.character.trim();
        const lastChar = last?.character.trim();
        
        if (last && lastChar.toLowerCase() === currentChar.toLowerCase()) {
            last.text += '\n' + line.text;
        } else {
            merged.push({ character: currentChar, text: line.text });
        }
    });

    const final: { character: string; text: string }[] = [];
    merged.forEach((block) => {
        if (block.text.length <= 500) {
            final.push(block);
        } else {
            let remaining = block.text;
            while (remaining.length > 0) {
                if (remaining.length <= 500) {
                    final.push({ character: block.character, text: remaining.trim() });
                    break;
                }
                let limit = 500;
                let searchRegion = remaining.substring(0, limit + 100);
                const regex = /[.।?!](\s|\n|$)/g;
                let match;
                let lastSplitIdx = -1;
                while ((match = regex.exec(searchRegion)) !== null) {
                    if (match.index <= limit) lastSplitIdx = match.index + 1;
                }
                let splitIdx = lastSplitIdx;
                if (splitIdx === -1) splitIdx = remaining.lastIndexOf('\n', limit);
                if (splitIdx === -1 || splitIdx < limit * 0.5) splitIdx = limit;

                final.push({ character: block.character, text: remaining.substring(0, splitIdx).trim() });
                remaining = remaining.substring(splitIdx).trim();
            }
        }
    });
    return final;
}

export async function generateDialogueDetails(
  input: GenerateDialogueDetailsInput
): Promise<GenerateDialogueDetailsOutput> {
  try {
    const result = await generateDialogueDetailsFlow(input);
    
    // Apply Production Rules: Merge & Chunk
    const normalizedLines = normalizeAndChunkLines(result.lines);
    
    return { lines: normalizedLines };
  } catch (error: any) {
    const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];
    const errorMessage = `🚨 **Flow Error: generateDialogueDetails**\n**User:** ${input.userEmail || 'N/A'}\n**Error:** <pre>${mainErrorMessage}</pre>`;
    await sendToTelegram(errorMessage);
    throw error;
  }
}

const breakdownPromptTemplate = `You are a meticulous script parser. Your single task is to convert a raw script into a structured JSON array of dialogue lines, where each line is assigned to the correct speaker. You must process every single line of dialogue and assign it correctly.

**Your Input:**
1.  A \`script\`.
2.  A definitive \`characterNames\` list.

**Your Output:**
A JSON object: \`{ "lines": [ { "character": string, "text": string }, ... ] }\`

**CRITICAL INSTRUCTIONS:**

1.  **CHARACTER LOCK-DOWN:** The ONLY valid values for \`character\` in your output are the names provided in the \`characterNames\` list.
    *   NEVER invent, modify, or combine names.
    *   The \`characterNames\` list is the absolute source of truth for who can speak.

2.  **LINE-BY-LINE PROCESSING MODEL:**
    *   Imagine you are reading the script one line at a time from top to bottom.
    *   Keep track of the "current speaker".
    *   **Rule A (New Speaker):** If a line starts with a name from the \`characterNames\` list (e.g., "RAHUL" or "RAHUL:"), that character becomes the new "current speaker".
    *   **Rule B (Narrator Fallback):** If a line does NOT have a clear character name prefix but contains prose or dialogue, and "Narrator" is in your \`characterNames\` list, you MUST assign this line to "Narrator".
    *   **Rule C (Continuation):** If a line follows a character's speech and clearly belongs to them, it is a continuation.
    *   **Rule D (Sequential Processing):** Do not skip any part of the text. If it is meant to be spoken or heard, assign it to a name in the list.

Now, process the following script using these exact rules.

List of primary characters:
---
{{#each characterNames}}
- {{{this}}}
{{/each}}
---

Script to analyze:
---
{{{script}}}
---
`;

const generateDialogueDetailsFlow = ai.defineFlow(
  {
    name: 'generateDialogueDetailsFlow',
    inputSchema: GenerateDialogueDetailsInputSchema,
    outputSchema: GenerateDialogueDetailsOutputSchema,
  },
  async (input) => {
    if (!input.script || input.characterNames.length === 0) {
        return { lines: [] };
    }

    let prompt = breakdownPromptTemplate.replace('{{{script}}}', input.script);
    prompt = prompt.replace('{{#each characterNames}}\n- {{{this}}}\n{{/each}}', input.characterNames.map(name => `- ${name}`).join('\n'));
    
    const llmResponse = await ai.generate({
      prompt: prompt,
      model: GENERAL_PURPOSE_MODEL,
      output: { format: 'json', schema: GenerateDialogueDetailsOutputSchema },
    });
    
    const output = llmResponse.output;
    if (!output) throw new Error('The AI failed to generate dialogue details.');
    
    return output as any;
  }
);
