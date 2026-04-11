import { themes, type ThemeName } from './themes.ts';
import { canonicalizeThemeName, type NewThemeName } from '../styles/tokens.ts';

/**
 * Runtime theme application — Track B.1 update.
 *
 * Reads the stored theme name from localStorage, canonicalizes any
 * legacy value (dark/light/oled → terminal/dossier), applies the
 * token object to document.documentElement as CSS custom
 * properties, and notifies listeners.
 *
 * Cycle order is now `terminal ↔ dossier` — two themes, not three.
 * The legacy `oled` alias still resolves to `terminal` on read, but
 * the cycler won't land on it.
 */

const STORAGE_KEY = 'dashview:theme';
const listeners: Array<(theme: NewThemeName) => void> = [];

export function getTheme(): NewThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return canonicalizeThemeName(stored);
  } catch {
    return 'terminal';
  }
}

/**
 * Apply a theme by name. Accepts any legacy or canonical name (see
 * `ThemeName`) and canonicalizes before use so the stored value is
 * always `terminal` or `dossier`.
 */
export function applyTheme(name?: ThemeName): void {
  const requested: NewThemeName = name ? canonicalizeThemeName(name) : getTheme();
  const props = themes[requested];
  const root = document.documentElement;
  for (const [property, value] of Object.entries(props)) {
    root.style.setProperty(property, value);
  }
  root.dataset.theme = requested;
  document.body.style.background = props['--color-bg'];

  try {
    localStorage.setItem(STORAGE_KEY, requested);
    document.dispatchEvent(
      new CustomEvent('dashview:storage-changed', { detail: { key: STORAGE_KEY, action: 'set' } }),
    );
  } catch {
    /* ignore */
  }

  for (const cb of listeners) cb(requested);
}

export function onThemeChange(cb: (theme: NewThemeName) => void): void {
  listeners.push(cb);
}

/**
 * Cycle through the canonical themes. Previously a three-theme loop
 * (dark → light → oled); now a simple two-theme toggle that
 * alternates terminal ↔ dossier.
 */
export function cycleTheme(): void {
  applyTheme(getTheme() === 'terminal' ? 'dossier' : 'terminal');
}
