import { describe, it, expect, vi, beforeEach } from 'vitest';
import { briefPreviewText, SUBJECT_PATTERN, decodeSubject } from './_lib/brief-preview.js';

/**
 * The /briefs archive printed raw escaped markup on every card ("<div
 * style="font-family:&quot;JetBrains Mono…"). The endpoint sent the first 300
 * characters of the summary HTML; inline-styled email markup spends most of
 * that inside its first few tags, so the cut landed mid-tag and the client's
 * tag-stripping regex could not match the unclosed remainder. The archive now
 * receives plain text and the day's subject, and these pin both.
 *
 * Synthetic rows only: shaped like the stored summary fragment, invented text.
 */

const FONT =
  'font-family:&quot;Inter&quot;, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, &quot;Helvetica Neue&quot;, Arial, sans-serif;color:#12161C';
const MONO =
  'font-family:&quot;JetBrains Mono&quot;, &quot;SF Mono&quot;, Menlo, Monaco, Consolas, &quot;Liberation Mono&quot;, &quot;Courier New&quot;, monospace';

function summaryHtml(lead: string): string {
  return (
    `<div style="${FONT};background:#FFFFFF;padding:12px;max-width:600px"><div style="margin:0 0 32px 0">` +
    `<div style="${MONO};font-size:10px">TODAY&#39;S CALL</div>` +
    `<h2 style="${FONT}">Today&#39;s Call</h2>` +
    `<p style="${FONT}"><strong style="color:#12161C">The Ledger</strong> — ${lead} &amp; counting</p></div></div>`
  );
}

describe('briefPreviewText', () => {
  it('returns words, not markup, from inline-styled HTML', () => {
    const t = briefPreviewText(summaryHtml('12 resolved today, 4 hit'));
    expect(t).toBe("TODAY'S CALL Today's Call The Ledger — 12 resolved today, 4 hit & counting");
    expect(t).not.toMatch(/[<>]|&quot;|&amp;|&#39;|style=/);
  });

  it('drops a tag left unclosed by a cut, instead of printing it', () => {
    const cut = summaryHtml('x').slice(0, 300);
    expect(cut).toMatch(/<[^>]*$/); // the precondition: the prefix ends mid-tag
    expect(briefPreviewText(cut)).not.toMatch(/[<>]|&quot;|style=|font-family/);
  });

  it('clamps long text at a word boundary and marks the cut', () => {
    const long = `<p>${'alpha beta gamma '.repeat(40)}</p>`;
    const t = briefPreviewText(long, 60);
    expect(t.length).toBeLessThanOrEqual(61);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/\s…$/);
    expect(['alpha', 'beta', 'gamma']).toContain(t.slice(0, -1).split(' ').pop());
  });

  it('leaves short text unmarked', () => {
    expect(briefPreviewText('<p>Short.</p>')).toBe('Short.');
  });

  it('removes the contents of style and script blocks', () => {
    expect(briefPreviewText('<style>p{color:red}</style><script>x()</script><p>Body</p>')).toBe('Body');
  });

  // Review 2b: the archive API is public. A summary that stored markup
  // ENTITY-ENCODED must not come out of decoding as live-looking tags; strip
  // again after decoding, so the preview is words on every consumer, not only
  // on our own page (which escapes it).
  it('strips markup that only appears once entities are decoded', () => {
    const t = briefPreviewText(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;Hello &lt;b&gt;world&lt;/b&gt; &lt;img src=x onerror=y&gt;</p>',
    );
    expect(t).toBe('Hello world');
    expect(t).not.toMatch(/[<>]|script|alert|onerror/i);
  });

  // Re-check of review 2b: the second pass strips only TAG-SHAPED sequences
  // (`<` then a letter, `/` or `!`), so an ordinary comparison in the text
  // survives decoding. A wide `<…>` pass ate everything between a `<` and the
  // next `>`.
  it('keeps comparison signs in ordinary sentences', () => {
    expect(briefPreviewText('<p>FX Brier &lt; 0.1 this week</p>')).toBe('FX Brier < 0.1 this week');
    expect(briefPreviewText('<p>Skill was &lt; base rate; Iran &gt; 30% share.</p>')).toBe(
      'Skill was < base rate; Iran > 30% share.',
    );
  });

  it('still drops an encoded script block and an encoded img tag', () => {
    expect(briefPreviewText('<p>Before &lt;script&gt;alert(1)&lt;/script&gt; after</p>')).toBe('Before after');
    expect(briefPreviewText('<p>Before &lt;img src=x onerror=alert(1)&gt; after</p>')).toBe('Before after');
    expect(briefPreviewText('<p>Before &lt;!-- note --&gt; after</p>')).toBe('Before after');
  });
});

/**
 * The subject pattern, pinned. It takes the FIRST `"subject": "…"` key it
 * finds in the text form, at ANY depth — it is not top-level-aware. That is
 * safe today only because nothing inside a stored brief's content carries a
 * key named "subject" (BriefData in api/cron/daily-brief.ts has none; the only
 * one is the top-level key the cron writes). If a nested "subject" key is ever
 * added, this test's first case is the one that says the archive will show it.
 */
describe('SUBJECT_PATTERN', () => {
  const extract = (text: string) => decodeSubject(new RegExp(SUBJECT_PATTERN).exec(text)?.[1]);

  it('KNOWN LIMIT: a nested "subject" key that comes first wins over the top-level one', () => {
    expect(extract('{"a": {"subject": "nested"}, "subject": "top"}')).toBe('nested');
  });

  it('ignores "subject" written inside another string value (it is escaped there)', () => {
    expect(extract('{"n": "\\"subject\\": \\"decoy\\"", "subject": "top"}')).toBe('top');
  });

  it('yields nothing for content that is not JSON or has no subject', () => {
    expect(extract('not json {')).toBeNull();
    expect(extract('{"date": "2026-11-14"}')).toBeNull();
  });
});

// ── the endpoint ──────────────────────────────────────────────────────────

// `content` is what the column holds, as text. Row 3 is not valid JSON: a
// cast to jsonb anywhere in the archive query would throw for the whole query.
const ROWS = [
  {
    brief_date: '2026-11-15',
    head: summaryHtml('12 resolved today, 4 hit').slice(0, 8000),
    content: JSON.stringify({ date: '2026-11-15', briefText: 'x', subject: 'Twelve calls settled, four hit' }),
    generated_at: '2026-11-15T10:00:00Z',
  },
  {
    brief_date: '2026-11-14',
    head: summaryHtml('9 resolved today, 2 hit'),
    content: JSON.stringify({ date: '2026-11-14', briefText: 'x' }),
    generated_at: null,
  },
  { brief_date: '2026-11-13', head: summaryHtml('7 resolved today, 3 hit'), content: 'not json {', generated_at: null },
  {
    brief_date: '2026-11-12',
    head: summaryHtml('5 resolved today, 1 hit'),
    // jsonb's text form puts a space after the colon; escapes survive as escapes.
    content: '{"date": "2026-11-12", "subject": "Caf\\u00e9 \\"quoted\\" day"}',
    generated_at: null,
  },
];

let lastQuery = '';
/**
 * Stands in for Postgres on the two shapes that matter. A json/jsonb cast of
 * the column parses every row and throws on a bad one, as Postgres does. A
 * `substring(content::text from <pattern>)` applies the pattern per row and
 * yields NULL where it does not match, as Postgres does.
 */
function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): unknown[] {
  lastQuery = strings.join(' ').replace(/\s+/g, ' ');
  if (/content\s*::\s*jsonb?\b/.test(lastQuery)) {
    for (const r of ROWS) JSON.parse(r.content); // throws on row 3
  }
  const pattern = values.find((v): v is string => typeof v === 'string' && v.includes('subject'));
  return ROWS.map((r) => ({
    brief_date: r.brief_date,
    head: r.head,
    subject_json: pattern ? (new RegExp(pattern).exec(r.content)?.[1] ?? null) : null,
    generated_at: r.generated_at,
  }));
}
vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));

function fakeRes() {
  const state = { status: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => {
      state.headers[k] = v;
      return res;
    },
    status: (n: number) => {
      state.status = n;
      return res;
    },
    json: (b: unknown) => {
      state.body = b;
      return res;
    },
    state,
  };
  return res;
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
});

describe('GET /api/briefs (archive)', () => {
  async function get() {
    const { default: handler } = await import('./briefs.js');
    const res = fakeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler({ method: 'GET', query: {} } as any, res as any);
    return res.state as {
      status: number;
      body: { briefs: Array<{ date: string; subject: string | null; preview: string }>; count: number };
    };
  }

  it('sends each brief as plain-text preview plus its subject', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.count).toBe(4);
    expect(body.briefs[0]).toMatchObject({ date: '2026-11-15', subject: 'Twelve calls settled, four hit' });
    expect(body.briefs[0].preview).toContain('The Ledger — 12 resolved today, 4 hit');
    expect(body.briefs[1].subject).toBeNull();
    for (const b of body.briefs) expect(b.preview).not.toMatch(/[<>]|&quot;|style=/);
  });

  // Review 2b: one row whose content is not JSON used to fail the whole
  // archive with a 500, and /api/status pings this endpoint, so it would have
  // paged as a core outage.
  it('a row whose content is not valid JSON loses only its subject, not the archive', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    const bad = body.briefs.find((b) => b.date === '2026-11-13');
    expect(bad?.subject).toBeNull(); // the card falls back to its date title
    expect(bad?.preview).toContain('7 resolved today, 3 hit');
    expect(body.briefs.find((b) => b.date === '2026-11-15')?.subject).toBe('Twelve calls settled, four hit');
    expect(lastQuery).not.toMatch(/::\s*jsonb?\b/);
  });

  it('decodes JSON string escapes in a subject read from the text form', async () => {
    const { body } = await get();
    expect(body.briefs.find((b) => b.date === '2026-11-12')?.subject).toBe('Café "quoted" day');
  });
});
