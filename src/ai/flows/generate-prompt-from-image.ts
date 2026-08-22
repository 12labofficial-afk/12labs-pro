
'use server';
/**
 * @fileOverview Generates a descriptive prompt from an image.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {GENERAL_PURPOSE_MODEL} from '@/ai/config';
import { sendToTelegram } from '@/lib/telegram-logger';

const GeneratePromptFromImageInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "An image as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  modificationPrompt: z.string().optional().describe('Specific user instructions for modifying the image content or style.'),
});
export type GeneratePromptFromImageInput = z.infer<typeof GeneratePromptFromImageInputSchema>;

const GeneratePromptFromImageOutputSchema = z.object({
    prompt: z.string().describe('A descriptive, creative, and detailed prompt for generating a similar image. This prompt should be suitable for a text-to-image model like DALL-E or Midjourney. Describe the style, composition, subject, and mood of the image.'),
});
export type GeneratePromptFromImageOutput = z.infer<typeof GeneratePromptFromImageOutputSchema>;

export async function generatePromptFromImage(input: GeneratePromptFromImageInput): Promise<GeneratePromptFromImageOutput> {
    try {
        return await generatePromptFromImageFlow(input);
    } catch (error: any) {
        const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];

        let keySummary = '';
        if (error.keyAttempts && Array.isArray(error.keyAttempts)) {
            const failedAttempts = error.keyAttempts.filter((a: any) => a.status === 'failed');
            if (failedAttempts.length > 0) {
                keySummary = `\n\n<b>Failed Keys:</b>\n` + failedAttempts.map((a: any) => `🔑 ${a.keyName}: <pre>${(a.error?.split('\n')[0] || 'Failed').slice(0, 100)}</pre>`).join('\n');
            }
        }
        
        const isRateLimit = mainErrorMessage.toLowerCase().includes('rate limit') || mainErrorMessage.toLowerCase().includes('quota');
        const userFacingError = isRateLimit 
            ? 'You are making too many requests to the AI. Please wait a moment and try again.'
            : 'Failed to analyze image. Please try again later.';

        const errorMessage = `🚨 **Flow Error: generatePromptFromImage**
**Error:**
<pre>${mainErrorMessage}</pre>${keySummary}`;

        await sendToTelegram(errorMessage);
        throw new Error(userFacingError);
    }
}

const prompt = ai.definePrompt({
    name: 'generatePromptFromImagePrompt',
    input: {schema: GeneratePromptFromImageInputSchema},
    output: {schema: GeneratePromptFromImageOutputSchema},
    model: GENERAL_PURPOSE_MODEL,
    prompt: `You are a world-class prompt engineer specializing in creating hyper-detailed, master prompts for advanced text-to-image models. Your goal is to analyze the provided image and deconstruct it into its core components to create a new prompt that can generate a visually identical or stylistically homologous image, while incorporating any user-requested modifications.

Your analysis must be meticulous. Break down the image into the following components:

1.  **Subject & Elements:** Describe the main subject(s) and any significant foreground or background elements. Detail their appearance, clothing, expression, and action.
2.  **Composition & Framing:** Specify the camera angle (e.g., low angle, high angle, eye-level), shot type (e.g., cinematic wide shot, close-up portrait, medium shot), and depth of field (e.g., shallow depth of field with a blurred background).
3.  **Lighting:** Describe the lighting style precisely. Is it natural light (e.g., golden hour, overcast day) or artificial (e.g., studio lighting, neon lights)? Note the direction (e.g., dramatic backlighting, soft front light) and quality (e.g., soft and diffused, harsh and direct).
4.  **Color Palette:** Identify the dominant colors, accent colors, and the overall color harmony (e.g., monochromatic, analogous, complementary). Use descriptive color names (e.g., "deep cerulean blue," "muted ochre," "vibrant magenta").
5.  **Art Style & Medium:** Is it photorealistic, a digital painting, an oil painting, a 3D render, an anime style, a caricature? If it resembles a known artist's style, mention it (e.g., "in the style of Van Gogh").
6.  **Text & Typography:** If text is present, describe the font style (e.g., bold sans-serif, elegant serif, handwritten script), its color, effects (e.g., drop shadow, glow), and its exact placement on the image.
7.  **Atmosphere & Mood:** Describe the feeling of the image (e.g., energetic and chaotic, serene and peaceful, dark and mysterious, joyful and vibrant).
8.  **Technical Details:** Add keywords that define the quality and detail, such as "4k, ultra-detailed, sharp focus, high-quality photograph, professional."

{{#if modificationPrompt}}
**CRITICAL MODIFICATION INSTRUCTIONS:**
You MUST incorporate the following user requests into your final prompt. These instructions override any analysis of the original image if there is a conflict.
User Modifications: "{{{modificationPrompt}}}"
{{/if}}

**Final Output:**
Combine all these elements into a single, cohesive, comma-separated master prompt. Do not use line breaks. Structure the prompt to prioritize the most important visual elements first, followed by style and technical details.

Image:
{{media url=imageDataUri}}`,
});


const generatePromptFromImageFlow = ai.defineFlow(
  {
    name: 'generatePromptFromImageFlow',
    inputSchema: GeneratePromptFromImageInputSchema,
    outputSchema: GeneratePromptFromImageOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error("The AI failed to generate a prompt from the image.");
    }
    return output;
  }
);
