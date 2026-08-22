
'use client';
import { redirect } from 'next/navigation';

/**
 * Node Redirector - स्टूडियो अब नए एड्रेस पर सिंक है।
 */
export default function ChatterboxLayout() {
  redirect('/new-ai-studio');
  return null;
}
