'use client';

import React, { useEffect } from 'react';
import { useTheme } from 'next-themes';

// Must match the body background in src/app/globals.css for each theme.
const THEME_COLORS = { light: '#ffffff', dark: '#14161b' } as const;

/**
 * Keeps the browser/PWA status bar (theme-color meta) in step with the
 * active theme; it was fixed to white, a bright strip above the dark UI.
 * This used to also force --primary inline on <html>, which overrode the
 * dark palette's softer accent with the light-mode blue.
 */
export function DynamicThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = resolvedTheme === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
  }, [resolvedTheme]);

  return <>{children}</>;
}
