'use client';

import { Input } from '@/components/ui/input';

/**
 * Free-text emotion entry — the user types whatever they want (not
 * restricted to a fixed list). Plain controlled input, same pattern as the
 * dialogue Textarea next to it — the caller owns when to actually commit it.
 */
export function EmotionCapsules({ value, onChange }: { value: string; onChange: (emotion: string) => void }) {
    return (
        <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. Happy, Sad, Angry..."
            className="h-9 rounded-xl text-xs font-bold"
        />
    );
}
