
import { initializeFirebase } from '@/firebase/server';
import { reportServerError } from '@/lib/report-error';

export interface HQAnalyzeResponse {
    success: boolean;
    projectId?: string;
    analysis?: {
        characters: any[];
        dialogues: any[];
        genre: string;
        toneGuidance: string;
    };
    error?: string;
}

export async function getHQBackendUrl(): Promise<string> {
    const { database } = initializeFirebase();
    if (!database) return process.env.HQ_BACKEND_URL || '';
    
    try {
        const snap = await database.ref('admin/config/hq_backend_url').once('value');
        return snap.val() || process.env.HQ_BACKEND_URL || '';
    } catch (e) {
            reportServerError('src/lib/hq-backend.ts:23', e);
        return process.env.HQ_BACKEND_URL || '';
    }
}

export async function hqAnalyze(projectName: string, script: string, customerApiKey: string): Promise<HQAnalyzeResponse> {
    try {
        const baseUrl = await getHQBackendUrl();
        const accessKey = process.env.HQ_ACCESS_KEY || process.env.HF_SUPERFAST || '';
        
        const url = new URL(`${baseUrl.replace(/\/$/, '')}/script/analyze`);
        url.searchParams.set('key', accessKey);
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-API-Key': customerApiKey
        };
        
        const hfToken = process.env.HF_TOKEN || process.env.hf_token;
        if (hfToken) {
            headers['Authorization'] = `Bearer ${hfToken}`;
        }
        
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers,
            body: JSON.stringify({ projectName, script })
        });
        
        if (!response.ok) {
            const text = await response.text();
            if (text.includes('Starting Server')) {
                return { success: false, error: 'Hugging Face Space is starting up. Please try again in 30-60 seconds.' };
            }
            return { success: false, error: `Backend Error (${response.status}): ${text.slice(0, 100)}` };
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            if (text.includes('Starting Server')) {
                return { success: false, error: 'Hugging Face Space is starting up. Please try again in 30-60 seconds.' };
            }
            return { success: false, error: 'Invalid response from backend (not JSON).' };
        }

        const data = await response.json();
        return data;
    } catch (error: any) {
        console.error('[HQ Analyze Error]:', error.message);
        return { success: false, error: error.message };
    }
}

export async function hqAssignVoices(projectId: string, characters: { name: string, voice: string }[], customerApiKey: string): Promise<any> {
    try {
        const baseUrl = await getHQBackendUrl();
        const accessKey = process.env.HQ_ACCESS_KEY || process.env.HF_SUPERFAST || '';
        
        const url = new URL(`${baseUrl.replace(/\/$/, '')}/script/assign-voices`);
        url.searchParams.set('key', accessKey);
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-API-Key': customerApiKey
        };
        
        const hfToken = process.env.HF_TOKEN || process.env.hf_token;
        if (hfToken) {
            headers['Authorization'] = `Bearer ${hfToken}`;
        }
        
        // Ensure characters only have name and voice
        const cleanedCharacters = characters.map(c => ({ name: c.name, voice: c.voice }));
        
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers,
            body: JSON.stringify({ projectId, characters: cleanedCharacters })
        });
        
        if (!response.ok) {
            const text = await response.text();
            if (text.includes('Starting Server')) {
                return { success: false, error: 'Hugging Face Space is starting up. Please try again in 30-60 seconds.' };
            }
            return { success: false, error: `Backend Error (${response.status}): ${text.slice(0, 100)}` };
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            return { success: false, error: 'Invalid response from backend (not JSON).' };
        }

        const data = await response.json();
        return data;
    } catch (error: any) {
        console.error('[HQ Assign Voices Error]:', error.message);
        return { success: false, error: error.message };
    }
}
