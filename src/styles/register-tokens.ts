/**
 * The register's palette on the WEB. Dark, measured, and deliberately not the
 * email's.
 *
 * WHY A SECOND FILE. `email-tokens.ts` is the Light Intel Dossier and it must
 * stay light: mail clients render a dark email unreadably on a dark-mode phone,
 * which is the defect that was reported and fixed on 2026-09-12. The
 * server-rendered pages shared that file's palette, so taking the website dark
 * by editing `colors` would have dragged the email down with it. They are two
 * surfaces with two jobs and now two palettes.
 *
 * WHERE THIS CAME FROM. Four design directions were commissioned on 2026-09-20,
 * each independently critiqued, then judged by a three-seat council. Two of
 * three seats chose the direction these values belong to; the third argued for
 * a different one on the grounds that its tokens matched the names the codebase
 * already reads — which is why these are applied by swapping the six variables
 * ssr-shell already defines rather than by rewriting stylesheets.
 *
 * EVERY RATIO BELOW WAS RECOMPUTED BEFORE ADOPTION, not taken on trust. All
 * eleven matched the proposal to two decimal places and none falls below its
 * floor. The numbers in the comments are measurements.
 */

export const registerColors = {
  /**
   * Warm near-black, not #000000. Pure black under off-white is the halation
   * pair that makes long-form dark reading fail; #161412 costs a little
   * contrast on purpose — 14.70:1 rather than the 16.80:1 the same ink gives
   * on pure black — and buys back legibility over a three-thousand-word brief.
   */
  bgPage: '#161412',
  /** Bordered blocks that hold data: the record, the brief card, tables. */
  bgCard: '#1E1B18',
  /** Inset wells: the subscribe box, form fields, code blocks. */
  bgSunken: '#100E0D',

  /** Headlines, figures, claim text, emphasis. 14.70:1 on the page (AAA). */
  textPrimary: '#E8E6DE',
  /** Body and lede — the colour a thousand words are read in. 9.20:1 (AAA). */
  textSecondary: '#BDB7AA',
  /** Mono labels, kickers, captions, timestamps. 6.19:1 (AA at 11px). */
  textTertiary: '#9C958A',

  /**
   * Parchment gold, byte-identical to the email's divider. It is the one value
   * that crosses the light/dark boundary unchanged, which makes it the thread
   * tying the dark website to the light email. Structure only — rules and
   * edges, never text, never a link. 8.13:1 on the page.
   */
  divider: '#C9A86B',
  /** 1px decorative separators. 1.29:1, carries no meaning, and nothing that carries meaning may use it. */
  hairline: '#2E2A25',
  /** Real UI boundaries: input borders, the map frame, chart axes. 3.18:1, clears WCAG 1.4.11. */
  border: '#6B655B',

  /**
   * ORANGE SURVIVES AND OXBLOOD DOES NOT, for a measured reason. Oxblood
   * #9A1B1B on this page is 2.23:1 — a fail — and the only way to rescue it is
   * to lighten it to #D66A64, which is byte-identical to the email palette's
   * `down`, the MISS colour. On a register whose whole brand is publishing its
   * misses, the navigational accent must never be the miss colour. Orange is
   * unusable as an outcome hue, which is exactly what makes it safe as the
   * navigational one. 6.26:1 (AA).
   */
  accent: '#FF6600',
  /** Hover and active. 7.57:1 (AAA). */
  accentHover: '#FF8533',
  /** Focus ring, deliberately lighter than the accent so it stays visible on an accent-coloured control. 10.51:1. */
  focus: '#FFB380',
} as const;

/**
 * OUTCOMES DO NOT CARRY COLOUR.
 *
 * The live ledger paints HIT in #1F7A4C and MISS in #B8341C. Those two are
 * 1.11:1 apart in luminance for a reader with ordinary colour vision and
 * 1.09:1 under deuteranopia — simulated with the Viénot projection, not
 * assumed. They are effectively the same colour for everyone, and no candidate
 * pair in any of the four design directions cleared 3:1 for a dichromat while
 * still clearing AA against the page.
 *
 * So the channel is abandoned rather than tuned. The outcome is carried by the
 * word, which was always there, and by a gutter mark that differs in SHAPE:
 * filled for a hit, hollow for a miss. Both render in `textPrimary`, so
 * neither outcome is visually demoted and the record reads the same in
 * greyscale, in print, and to the roughly one man in twelve for whom red and
 * green are one colour.
 */
export const outcomeMarks = {
  hit: '■',
  miss: '□',
  /** Closed without a score. Neither a hit nor a miss, and it must not look like either. */
  unscored: '·',
  pending: '',
} as const;
