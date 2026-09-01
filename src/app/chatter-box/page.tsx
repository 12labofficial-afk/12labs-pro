
import { redirect } from 'next/navigation';

/**
 * STUDIO SYNC - Redirecting to /new-ai-studio
 * A server component so this issues a real HTTP redirect (better for SEO
 * and for anything, like curl or a crawler, that doesn't run client JS).
 */
export default function ChatterboxPage() {
    redirect('/new-ai-studio');
}
