'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * 🫧 12LABS NEURAL PHYSICS ENGINE
 * --------------------------------------------------------
 * Implementation of rising glassy spheres.
 * Allowed on Landing (/) and Login (/login) nodes.
 */

export function FloatingBubbles() {
  const [isMounted, setIsMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const bubbles = useMemo(() => {
    return Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${15 + Math.random() * 45}px`,
      drift: `${(Math.random() - 0.5) * 100}px`,
      scale: `${0.8 + Math.random() * 0.5}`,
      duration: `${10 + Math.random() * 15}s`,
      delay: `${Math.random() * 10}s`,
    }));
  }, []);

  // Allowed paths for bubbles
  const allowedPaths = ['/', '/login'];
  const isAllowed = allowedPaths.includes(pathname);

  if (!isMounted || !isAllowed) return null;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none">
      {bubbles.map((b) => (
        <div
          key={b.id}
          className="absolute bottom-[-150px] rounded-full border border-primary/20 dark:border-blue-400/50 shadow-[inset_0_6px_12px_rgba(255,255,255,0.5),0_0_30px_rgba(80,140,255,0.5)] animate-bubble-rise"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            '--drift': b.drift,
            '--scale': b.scale,
            animationDuration: b.duration,
            animationDelay: b.delay,
            background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9), rgba(120, 170, 255, 0.5) 45%, rgba(37, 99, 235, 0.35) 80%)',
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}