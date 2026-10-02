import 'server-only';

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET } from "./r2";
import { reportServerError } from '@/lib/report-error';

/**
 * 🗑️ ASSET DESTRUCTOR — server-only. It used to live in a 'use server'
 * module, which made it callable from any browser with any path.
 */
export async function deleteR2Object(path: string): Promise<{ success: boolean; error?: string }> {
    try {
        if (!R2_BUCKET) throw new Error("Storage Node: Bucket ID missing.");
        
        let fullKey = "";
        if (path.startsWith('pub://')) fullKey = "public/" + path.replace('pub://', '');
        else if (path.startsWith('gcs://')) fullKey = "secure/" + path.replace('gcs://', '');
        else fullKey = path; 
        
        await r2Client.send(new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: fullKey
        }));
        
        return { success: true };
    } catch (e: any) {
    reportServerError('src/lib/r2-delete.ts', e);
        console.error("[Storage Purge Error]:", e.message);
        return { success: false, error: e.message };
    }
}
