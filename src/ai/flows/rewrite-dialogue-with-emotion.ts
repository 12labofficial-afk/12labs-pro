
'use server';
/**
 * @fileOverview Rewrites a line of dialogue to match a given emotion.
 */

import { ai } from '@/ai/genkit';
import {z} from 'zod';
import { GENERAL_PURPOSE_MODEL } from '@/ai/config';
import { sendToTelegram } from '@/lib/telegram-logger';

const RewriteDialogueWithEmotionInputSchema = z.object({
  dialogue: z.string().describe('The dialogue to rewrite.'),
  emotion: z.string().describe('The emotion to imbue the dialogue with.'),
});
export type RewriteDialogueWithEmotionInput = z.infer<
  typeof RewriteDialogueWithEmotionInputSchema
>;

const RewriteDialogueWithEmotionOutputSchema = z.object({
  rewrittenDialogue: z.string().describe('The dialogue rewritten with the specified emotion.'),
});

export async function rewriteDialogueWithEmotion(
  input: RewriteDialogueWithEmotionInput
): Promise<{ rewrittenDialogue: string; usedBridge: boolean }> {
  try {
    const result = await rewriteDialogueWithEmotionFlow(input);
    return result;
  } catch (error: any) {
    const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];
    const errorMessage = `🚨 **Flow Error: rewriteDialogueWithEmotion**\n<b>Error:</b> <pre>${mainErrorMessage}</pre>`;
    await sendToTelegram(errorMessage);
    throw error;
  }
}

const promptTemplate = `Rewrite the following dialogue to be filled with the emotion: {{{emotion}}}.

**CRITICAL RULE: You MUST respond in the same language as the "Original Dialogue".** If the original is in Hindi, your response must be in Hindi.

Original Dialogue: "{{{dialogue}}}"

Just provide the rewritten dialogue.
`;


const rewriteDialogueWithEmotionFlow = ai.defineFlow(
  {
    name: 'rewriteDialogueWithEmotionFlow',
    inputSchema: RewriteDialogueWithEmotionInputSchema,
  },
  async (input) => {
    const llmResponse = await ai.generate({
      prompt: promptTemplate
            .replace('{{{emotion}}}', input.emotion)
            .replace('{{{dialogue}}}', input.dialogue),
      model: GENERAL_PURPOSE_MODEL,
      output: { schema: RewriteDialogueWithEmotionOutputSchema },
    });
    
    const output = llmResponse.output;
    const usedBridge = !!(llmResponse.custom as any)?.bridge;

    if (!output) {
      throw new Error('The AI model failed to rewrite the dialogue.');
    }
    return { ...output, usedBridge };
  }
);
