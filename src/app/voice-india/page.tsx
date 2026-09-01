
import { redirect } from 'next/navigation';

/**
 * @fileOverview Redirect node for deprecated voice-india page.
 * Users landing here via old search results are moved to the main Studio.
 * A server component so this issues a real HTTP redirect (better for SEO
 * and for anything, like curl or a crawler, that doesn't run client JS).
 */
export default function VoiceIndiaPage() {
    redirect('/studio');
}
