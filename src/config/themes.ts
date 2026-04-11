/**
 * Theme registry — Track B.1 rewrite.
 *
 * Thin compatibility shim over `src/styles/tokens.ts`, which is the
 * real source of truth for palette and typography values. This file
 * exists so the old `applyTheme()` pipeline in `src/config/theme.ts`
 * keeps working without changing its call signature, while new code
 * (and future migrations) read from `tokens.ts` directly.
 *
 * Legacy note: pre-B.1 this file exported three themes (`dark`,
 * `light`, `oled`) that were all identical copies of the same
 * terminal palette. The `light` entry is now the real Light Intel
 * Dossier palette; `oled` is kept as a storage-compat alias for
 * `terminal` so anyone with `dashview:theme=oled` in localStorage
 * doesn't get booted to a broken state.
 */

import { themeTokens, terminalTokens, dossierTokens, type AnyThemeName } from '../styles/tokens.ts';

/**
 * Public theme name type. Union of canonical names (`terminal`,
 * `dossier`) and legacy names (`dark`, `light`, `oled`) so existing
 * call sites compile without changes.
 */
export type ThemeName = AnyThemeName;

/**
 * Map of every accepted theme name to its palette. The canonical
 * names (`terminal`, `dossier`) point at the real token objects.
 * The legacy names alias them.
 */
export const themes: Record<ThemeName, Record<string, string>> = {
  // Canonical
  terminal: themeTokens.terminal,
  dossier: themeTokens.dossier,
  // Legacy aliases
  dark: terminalTokens,
  oled: terminalTokens,
  light: dossierTokens,
};
