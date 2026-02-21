import type { Theme } from '../hooks/useTheme.js';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/**
 * Theme toggle button.
 * Positioned absolute top-right of the ChatShell (which has position: relative).
 * Uses text symbols (☀ / ☾) — no external icon library required.
 *
 * UI-13: Dark/light theme toggle
 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  const symbol = isDark ? '☀' : '☾';

  return (
    <button
      className="themeToggle"
      onClick={onToggle}
      aria-label={label}
      title={label}
      type="button"
    >
      {symbol}
    </button>
  );
}
