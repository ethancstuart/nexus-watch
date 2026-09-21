/**
 * The SPA's static palette matches the register's, value for value.
 *
 * WHY. Three different dark grounds were live on one product at the same time:
 * `src/styles/design-tokens.css` said #0a0a0a, the runtime terminal theme in
 * `src/styles/tokens.ts` said #000000, and the server-rendered register said
 * #161412. The landing page and /ledger are the same publication and did not
 * look like it. Nothing tied the three together, so nothing reported the drift.
 *
 * `src/styles/register-tokens.ts` is now the single source. `tokens.ts` imports
 * it, so that half cannot drift. `design-tokens.css` CANNOT import TypeScript,
 * and making the paint wait for JS would flash the old palette on every load —
 * so it carries literal hex, and this guard is what stops that copy rotting.
 *
 * THE DERIVATION. The pairs below are bindings, not a spot-check list: every
 * `--nw-*` custom property named here must equal the register token named
 * beside it. A value changed on either side fails. It also re-measures the
 * contrast floors rather than trusting the comments — --nw-text-muted was
 * #757575 on #0a0a0a, which is 4.30:1 and below the 4.5:1 body-text floor,
 * and it shipped that way because a comment said it was fine.
 *
 * Usage: npx tsx scripts/check-design-tokens.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerColors } from '../src/styles/register-tokens.js';

const CSS_PATH = join(process.cwd(), 'src/styles/design-tokens.css');
const css = readFileSync(CSS_PATH, 'utf8');

/** `--nw-*` property -> the register token it must equal. */
const BOUND: Array<[string, keyof typeof registerColors]> = [
  ['nw-bg', 'bgPage'],
  ['nw-surface', 'bgCard'],
  ['nw-surface-hover', 'hairline'],
  ['nw-surface-active', 'hairline'],
  ['nw-border', 'hairline'],
  ['nw-border-subtle', 'hairline'],
  ['nw-border-strong', 'border'],
  ['nw-text', 'textPrimary'],
  ['nw-text-secondary', 'textSecondary'],
  ['nw-text-muted', 'textTertiary'],
  ['nw-gold', 'divider'],
  ['nw-accent', 'accent'],
  ['nw-accent-hover', 'accentHover'],
  ['nw-focus', 'focus'],
];

/** Text tokens that must clear the WCAG AA body floor on the page ground. */
const TEXT_FLOOR = 4.5;
const TEXT_ON_GROUND: Array<keyof typeof registerColors> = ['textPrimary', 'textSecondary', 'textTertiary', 'accent'];
/** WCAG 1.4.11: a boundary a reader must perceive needs 3:1. */
const BOUNDARY_FLOOR = 3;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const failures: string[] = [];

for (const [prop, token] of BOUND) {
  const m = css.match(new RegExp(`--${prop}:\\s*([^;]+);`));
  if (!m) {
    failures.push(`--${prop} is not declared in design-tokens.css (expected registerColors.${token})`);
    continue;
  }
  const actual = m[1].trim().toLowerCase();
  const expected = registerColors[token].toLowerCase();
  if (actual !== expected) {
    failures.push(`--${prop} is ${actual}, but registerColors.${token} is ${expected}`);
  }
}

if (!/color-scheme:\s*dark/.test(css)) {
  failures.push(
    'design-tokens.css does not declare `color-scheme: dark` — without it the user agent ' +
      'styles links and form controls for a light page, and an unstyled anchor renders at 1.96:1',
  );
}

for (const token of TEXT_ON_GROUND) {
  const ratio = contrast(registerColors[token], registerColors.bgPage);
  if (ratio < TEXT_FLOOR) {
    failures.push(`registerColors.${token} is ${ratio.toFixed(2)}:1 on bgPage, below the ${TEXT_FLOOR}:1 body floor`);
  }
}
const boundary = contrast(registerColors.border, registerColors.bgPage);
if (boundary < BOUNDARY_FLOOR) {
  failures.push(`registerColors.border is ${boundary.toFixed(2)}:1 on bgPage, below WCAG 1.4.11's ${BOUNDARY_FLOOR}:1`);
}

if (failures.length > 0) {
  console.error('[check-design-tokens] FAILED — the SPA palette has drifted from the register:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\n  src/styles/register-tokens.ts is the source. Change it there, then mirror it here.');
  process.exit(1);
}

console.log(
  `[check-design-tokens] OK — ${BOUND.length} token(s) bound to register-tokens.ts, ` +
    `${TEXT_ON_GROUND.length} text contrast floor(s) and the 1.4.11 boundary re-measured`,
);
