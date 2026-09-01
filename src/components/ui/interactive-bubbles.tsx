'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 🌠 12LABS NEURAL TRAIL ENGINE (v3.0 - ADVANCED SYNC)
 * --------------------------------------------------------
 * Implementation of a smooth, elastic glowing trail with ripples.
 * Features: Dynamic hue shifting, release fade, and collision ripples.
 * Fixed: TypeScript null check for 'ctx' in resize and animate functions.
 */

export function InteractiveBubbles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  // Restricted to Landing and Login nodes
  const allowedPaths = ['/', '/login'];
  const isAllowed = allowedPaths.includes(pathname);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !isAllowed || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const devicePixelRatio = window.devicePixelRatio || 1;

    function resize() {
      if (!canvas || !ctx) return;
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    resize();
    window.addEventListener('resize', resize);

    // Target position (pointer location)
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;

    // Trail setup
    const trailCount = 20;
    const trail = Array.from({ length: trailCount }, () => ({ x: targetX, y: targetY }));

    // Interaction states
    const ease = 0.32;
    let isActive = false;
    let fadeFactor = 0;
    const fadeSpeed = 0.025;
    let ripples: { x: number; y: number; radius: number; alpha: number }[] = [];
    let hueShift = 0;

    function startAt(x: number, y: number) {
      isActive = true;
      fadeFactor = 1;
      targetX = x;
      targetY = y;
      
      // Snap trail to start position instantly
      for (let i = 0; i < trail.length; i++) {
        trail[i].x = x;
        trail[i].y = y;
      }
      
      ripples.push({ x, y, radius: 4, alpha: 0.6 });
    }

    function moveTo(x: number, y: number) {
      targetX = x;
      targetY = y;
    }

    function endTouch() {
      isActive = false;
    }

    // Mouse listeners
    const onMouseDown = (e: MouseEvent) => startAt(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => {
      if (isActive) moveTo(e.clientX, e.clientY);
    };
    const onMouseUp = () => endTouch();

    // Touch listeners
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startAt(touch.clientX, touch.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      moveTo(touch.clientX, touch.clientY);
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseleave', onMouseUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onMouseUp);
    window.addEventListener('touchcancel', onMouseUp);

    function animate() {
      if (!ctx) return;
      
      // Clear canvas every frame for overlay transparency
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (isActive) {
        fadeFactor = Math.min(1, fadeFactor + 0.15);
        trail[0].x += (targetX - trail[0].x) * ease;
        trail[0].y += (targetY - trail[0].y) * ease;
      } else if (fadeFactor > 0) {
        fadeFactor = Math.max(0, fadeFactor - fadeSpeed);
        trail[0].x += (targetX - trail[0].x) * (ease * 0.4);
        trail[0].y += (targetY - trail[0].y) * (ease * 0.4);
      }

      // Chain logic for trailing points
      for (let i = 1; i < trail.length; i++) {
        trail[i].x += (trail[i - 1].x - trail[i].x) * ease;
        trail[i].y += (trail[i - 1].y - trail[i].y) * ease;
      }

      hueShift += 0.6;

      if (fadeFactor > 0) {
        // Draw from tail to head
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          const percent = i / trail.length;
          const size = (1 - percent) * 16 * fadeFactor;
          const hue = (260 + percent * 110 + hueShift) % 360;
          const alpha = (1 - percent) * fadeFactor;

          // Soft outer glow
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2.2);
          glow.addColorStop(0, `hsla(${hue}, 95%, 68%, ${alpha * 0.4})`);
          glow.addColorStop(1, `hsla(${hue}, 95%, 68%, 0)`);
          
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();

          // Core dot
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 100%, 78%, ${alpha})`;
          ctx.fill();
        }
      }

      // Render and update ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += 2.5;
        r.alpha -= 0.02;
        if (r.alpha <= 0) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${(300 + hueShift) % 360}, 100%, 75%, ${r.alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mouseleave', onMouseUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onMouseUp);
      window.removeEventListener('touchcancel', onMouseUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isMounted, isAllowed]);

  if (!isMounted || !isAllowed) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[1] pointer-events-none overflow-hidden select-none"
    />
  );
}
