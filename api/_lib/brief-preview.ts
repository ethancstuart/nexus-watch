/**
 * Plain-text preview of a stored brief summary, for the /briefs archive cards.
 *
 * WHY HERE AND NOT IN THE CLIENT. The archive used to receive the first 300
 * characters of the summary HTML and strip tags in the browser. The summary is
 * inline-styled email markup whose first tags alone run past 300 characters,
 * so the cut always landed inside a tag; the remainder had no closing `>` for
 * the regex to match and every card printed it, escaped, as its preview. The
 * server has the whole prefix and turns it into words once.
 *
 * Imports nothing: pure string work, safe for any caller.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  middot: '·',
  rarr: '→',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function stripMarkup(s: string): string {
  return (
    s
      .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      // A prefix cut mid-tag leaves an opening `<` with no `>`; drop it rather
      // than print half a style attribute.
      .replace(/<[^>]*$/, ' ')
  );
}

/**
 * The pass after decoding removes only TAG-SHAPED sequences: `<` followed by a
 * letter, `/` or `!`, through the next `>` (and a script or style block with
 * its contents). Decoded text is prose, where `<` and `>` are usually
 * comparisons — "FX Brier < 0.1", "Iran > 30%" — and the wide `<[^>]*>` of the
 * markup pass deleted everything between them.
 */
function stripDecodedTags(s: string): string {
  return s
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[A-Za-z/!][^>]*>/g, ' ')
    .replace(/<[A-Za-z/!][^>]*$/, ' ');
}

export function briefPreviewText(html: string, max = 240): string {
  // Stripped twice: once as markup, and again after decoding, because a
  // summary that stored markup entity-encoded (`&lt;script&gt;…`) only becomes
  // tags once decoded. The archive API is public, so the preview must be words
  // for every consumer, not only for our page, which escapes it (review 2b).
  const text = stripDecodedTags(decodeEntities(stripMarkup(html)))
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:·—–-]+$/, '')}…`;
}

/**
 * The `"subject": "…"` string in a brief's content, read from its TEXT form
 * (see api/briefs.ts for why there is no json cast); group 1 is the body,
 * still JSON-escaped. Used as a bound pattern in Postgres and in tests.
 *
 * NOT TOP-LEVEL-AWARE: it takes the first "subject" key at ANY depth. That is
 * safe today only because no key inside a stored brief's content is named
 * "subject" except the top-level one the brief cron writes (BriefData in
 * api/cron/daily-brief.ts has none). A "subject" written inside another string
 * value is escaped there (\"subject\") and cannot match. briefs.test.ts pins
 * both behaviours.
 */
export const SUBJECT_PATTERN = '"subject"\\s*:\\s*"(([^"\\\\]|\\\\.)*)"';

/** Decode a captured, still JSON-escaped subject; null if absent, blank or undecodable. */
export function decodeSubject(escaped: unknown): string | null {
  if (typeof escaped !== 'string') return null;
  try {
    const s = JSON.parse(`"${escaped}"`) as unknown;
    return typeof s === 'string' && s.trim() ? s.trim() : null;
  } catch {
    return null;
  }
}
