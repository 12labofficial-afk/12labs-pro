
'use client';

import { redirect } from 'next/navigation';

/**
 * @fileOverview Redirect node for deprecated voice-india page.
 * Users landing here via old search results are moved to the main Studio.
 */
export default function VoiceIndiaPage() {
    redirect('/studio');
    return null;
}
