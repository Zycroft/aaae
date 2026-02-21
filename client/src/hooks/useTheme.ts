import { useState, useEffect } from 'react';

/**
 * Theme hook — manages dark/light theme state with localStorage persistence
 * and system prefers-color-scheme detection.
 *
 * UI-13: Dark/light theme toggle; theme persisted to localStorage
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'chatTheme';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return getSystemTheme();
}

/**
 * Returns current theme and toggle function.
 * Sets document.documentElement.dataset.theme on change (triggering CSS [data-theme] tokens).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggle };
}
