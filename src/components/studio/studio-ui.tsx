'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared look for every /studio card, so the whole flow reads as one
 * product: soft glass surface, 28px radius, quiet header with an icon tile.
 */
export const studioCard =
  'relative overflow-hidden rounded-[28px] border border-black/[0.06] bg-white/90 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_24px_60px_-30px_rgba(37,99,235,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/70 dark:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]';

export function StudioCardHeader({
  icon,
  title,
  subtitle,
  right,
  tone = 'primary',
  className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  tone?: 'primary' | 'success';
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 border-b border-black/[0.05] px-5 pb-4 pt-5 dark:border-white/10', className)}>
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
          tone === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary',
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[17px] font-bold leading-tight tracking-tight text-foreground">{title}</h3>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
