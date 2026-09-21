import { describe, it, expect } from 'vitest';
import { registerColors } from './register-tokens';
import { terminalTokens } from './tokens';

/**
 * THE RUNTIME THEME IS THE REGISTER'S PALETTE, NOT A SECOND ONE THAT RESEMBLES IT.
 *
 * `terminalTokens` had its own literals — #000000 ground, #ffffff ink,
 * #ff7722 accent-hover against the register's #FF8533 — so the SPA chrome and
 * the server-rendered register were two palettes that merely both looked dark.
 * They are bound by import now, and these assertions are what makes a revert
 * to a literal fail rather than merely look slightly different.
 *
 * The STATIC half of the same palette lives in `design-tokens.css`, which
 * cannot import TypeScript. `scripts/check-design-tokens.ts` binds that one,
 * because a test under src/ has no node types and so cannot read the file.
 */
describe('the runtime terminal theme is the register palette', () => {
  it.each([
    ['--color-bg', 'bgPage'],
    ['--color-bg-page', 'bgPage'],
    ['--color-surface', 'bgCard'],
    ['--color-surface-sunken', 'bgSunken'],
    ['--color-text-primary', 'textPrimary'],
    ['--color-text-secondary', 'textSecondary'],
    ['--color-text-muted', 'textTertiary'],
    ['--color-text-tertiary', 'textTertiary'],
    ['--color-accent', 'accent'],
    ['--color-accent-soft', 'accentHover'],
    ['--color-border', 'hairline'],
    ['--color-border-strong', 'border'],
  ] as Array<[string, keyof typeof registerColors]>)('%s is registerColors.%s', (prop, token) => {
    expect(terminalTokens[prop]).toBe(registerColors[token]);
  });

  it('carries no hardcoded hex for any bound surface or text role', () => {
    // A literal here is the exact shape of the drift this replaced. The accent
    // pair is checked above by value; this catches a NEW literal introduced
    // into a bound role without anyone noticing it stopped deriving.
    const bound = [
      '--color-bg',
      '--color-bg-page',
      '--color-surface',
      '--color-surface-sunken',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-text-muted',
      '--color-accent',
    ];
    const palette = new Set(Object.values(registerColors).map((v) => v.toLowerCase()));
    for (const prop of bound) {
      expect(palette.has(terminalTokens[prop]?.toLowerCase()), `${prop} = ${terminalTokens[prop]}`).toBe(true);
    }
  });
});
