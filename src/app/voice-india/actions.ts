
'use server';

import { Client } from "@gradio/client";
import { z } from 'zod';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

const GenerateIndianVoiceInputSchema = z.object({
  text: z.string().min(1, "Text is required.").max(500, "Text must be 500 characters or less."),
  speaker: z.string(),
  emotion: z.string(),
});

type GenerateIndianVoiceInput = z.infer<typeof GenerateIndianVoiceInputSchema>;

export async function generateIndianVoiceAction(
    input: GenerateIndianVoiceInput
): Promise<{ success: boolean; audioDataUri?: string; error?: string; }> {
  const validation = GenerateIndianVoiceInputSchema.safeParse(input);
  if (!validation.success) {
    return { success: false, error: validation.error.flatten().formErrors.join(', ') };
  }

  const { text, speaker, emotion } = validation.data;

  try {
    // USE AUTH TOKENS FOR STABLE CONNECTION
    // Priority: HF_SUPERFAST for private spaces
    const hfToken = process.env.HF_SUPERFAST || process.env.HF_TOKEN || process.env.H1 || process.env.H2 || process.env.H3;
    
    if (!hfToken) {
        throw new Error("Voice synthesis hub is not configured (missing token).");
    }

    const client = await Client.connect("tuf601121/Yash1", {
        hf_token: hfToken as `hf_${string}`
    });

    const payload = {
        text_input: text,
        speaker: speaker,
        emotion: emotion,
    };
    
    // Using index 0 for the main synthesis function
    const result = await client.predict(0, payload);

    let finalAudioUrl: string | null = null;
    if (result && Array.isArray(result.data) && result.data.length > 0) {
        const audioResult = result.data[0];
        if (typeof audioResult === 'string' && (audioResult.startsWith('data:') || audioResult.startsWith('http'))) {
            finalAudioUrl = audioResult;
        } else if (audioResult?.url) {
            finalAudioUrl = audioResult.url;
        } else if (audioResult?.data) {
            finalAudioUrl = audioResult.data;
        }
    }

    if (finalAudioUrl) {
      if (finalAudioUrl.startsWith('http')) {
        const audioResponse = await fetch(finalAudioUrl);
        if (!audioResponse.ok) {
            throw new Error(`Could not fetch generated audio. Status: ${audioResponse.statusText}`);
        }
        const audioBuffer = await audioResponse.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');
        const audioMimeType = audioResponse.headers.get('content-type') || 'audio/wav';
        return { success: true, audioDataUri: `data:${audioMimeType};base64,${audioBase64}` };
      }
      return { success: true, audioDataUri: finalAudioUrl };
    } else {
        throw new Error("Invalid response from synthesis engine.");
    }
  } catch (error: any) {
    reportServerError('src/app/voice-india/actions.ts#1', error);
    console.error("Indian voice synthesis failed:", error);
    let errorMessage = "Failed to generate audio.";
    
    if (error.message) {
        const lowerMessage = error.message.toLowerCase();
        if (lowerMessage.includes('unexpected response') || lowerMessage.includes('unexpected end of json input')) {
            errorMessage = "Server busy or invalid response. Please retry in 5 seconds.";
        } else if (lowerMessage.includes('space is not running') || lowerMessage.includes('space metadata could not be loaded')) {
            errorMessage = "Synthesis system is starting up. Please wait 15 seconds and try again.";
        } else {
            errorMessage = error.message;
        }
    }

    await sendToTelegram(`🇮🇳🚨 <b>Indian Voice Error</b>\n<b>User:</b> ${input.speaker}\n<b>Error:</b> ${errorMessage.slice(0, 100)}`);
    return { success: false, error: errorMessage };
  }
}
