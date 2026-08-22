
'use client';
import { redirect } from 'next/navigation';

/**
 * STUDIO SYNC - Redirecting to /new-ai-studio
 */
export default function ChatterboxPage() {
    redirect('/new-ai-studio');
    return null;
}
