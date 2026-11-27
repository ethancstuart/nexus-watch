import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler, { briefDescription, briefTitle, countedSubject, dateTitle } from './og.js';

/**
 * A BRIEF PAGE'S TITLE AND DESCRIPTION REPEAT NOTHING THE BRIEF SAYS.
 *
 * Live on 15 Nov 2026 (lanes2/GTM.md §1): the title was "NexusWatch · Yemen ·
 * 2026-11-15", from the top-scored country, which the brief does not mention;
 * the description was the brief's raw opening, "## 🎯 Today's Call The Ledger
 * — … OONI Brier 0.058 over 263, -2% vs base rate …", an uncorrected figure.
 * The first fix described pages with the brief's opening prose, which still
 * repeated that figure, "skill withheld", "Your daily intelligence edge" and,
 * on Sundays, the model's false record claims (independent review M1).
 *
 * Now each page gets one of exactly two forms: the date title, or a mechanical
 * edition's subject in fallbackSubject's counted form. real-editions.fixture.json
 * holds real archived rows (the first 2,000 characters of each brief, copied
 * from the cached public archive) that are rendered below.
 */

const DATE = '2026-11-15';
const COUNTED = `67 calls settled, 22 hit — mechanical edition, ${DATE}`;
const LEDGER_LINE =
  '**The Ledger** — 67 resolved today, 22 hit · OONI Brier 0.058 over 263, -2% vs base rate · ' +
  'FX Brier 0.217 over 4767, -4% vs base rate · 927 open, next resolves 2026-11-16';
const WEEKDAY = `## 🎯 Today's Call\n\n${LEDGER_LINE}\n\n67 calls settled against external ground truth: 22 hit, 45 miss.\n`;

interface RealEdition {
  date: string;
  why: string;
  subject?: string;
  edition?: string;
  briefText: string;
}
const REAL = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'real-editions.fixture.json'), 'utf8'),
) as RealEdition[];

let row: Record<string, unknown> | null = null;
let failDb = false;
vi.mock('@neondatabase/serverless', () => ({
  neon: () => async () => {
    if (failDb) throw new Error('synthetic outage');
    return row ? [row] : [];
  },
}));

async function page(query: Record<string, string>): Promise<string> {
  let body = '';
  const res = {
    setHeader: () => res,
    status: () => res,
    send: (b: string) => {
      body = b;
      return res;
    },
  };
  await handler({ method: 'GET', query } as never, res as never);
  return body;
}

const unescape = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const tag = (html: string, re: RegExp) => unescape((html.match(re) ?? [])[1] ?? '');
function jsonLdOf(html: string): { headline: string; description: string } {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return JSON.parse(m?.[1] ?? 'null') as { headline: string; description: string };
}

/** Every title and description a crawler or an unfurl reads. */
function metadata(html: string) {
  const ld = jsonLdOf(html);
  return {
    titles: [
      tag(html, /<title>([^<]*)<\/title>/),
      tag(html, /<meta property="og:title" content="([^"]*)">/),
      tag(html, /<meta name="twitter:title" content="([^"]*)">/),
      ld.headline,
      tag(html, /<h1>([^<]*)<\/h1>/),
    ],
    descriptions: [
      tag(html, /<meta name="description" content="([^"]*)">/),
      tag(html, /<meta property="og:description" content="([^"]*)">/),
      tag(html, /<meta name="twitter:description" content="([^"]*)">/),
      ld.description,
    ],
  };
}

/** A ledger or skill figure, a banned word, or a record claim (lanes2/LANE-G.md, review M1). */
const FORBIDDEN = /Brier|base rate|skill|withheld|intelligence|real-time|real time|record|highest|0\.058|%/i;

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  failDb = false;
  row = null;
});

describe('countedSubject', () => {
  it("accepts only fallbackSubject's counted form, for this page's date", () => {
    expect(countedSubject(DATE, { subject: COUNTED })).toBe(COUNTED);
    expect(countedSubject(DATE, { subject: COUNTED, edition: 'mechanical' })).toBe(COUNTED);
    expect(countedSubject(DATE, { subject: `  67 calls settled,\n 22 hit — mechanical edition, ${DATE} ` })).toBe(
      COUNTED,
    );
  });

  it('refuses every other subject (review M2)', () => {
    for (const subject of [
      // fallbackSubject's form when the day's record is missing, including the
      // day the resolved-calls query fails: it can be false.
      `The Ledger, unchanged — mechanical edition, ${DATE}`,
      // Counted, but another day's.
      '67 calls settled, 22 hit — mechanical edition, 2026-11-14',
      // More hits than calls settled.
      `22 calls settled, 67 hit — mechanical edition, ${DATE}`,
      // Model subjects, including ones the correction drafts quote as false.
      'Russia and Iran hit record censorship in the same week',
      '67 calls settled today — we missed 73% of them',
      `67 calls settled, 22 hit — mechanical edition, ${DATE} and Iran sets a record`,
      'Investigating a Murder: Public Records Uncover New Clues in',
      undefined,
      null,
      '',
      42,
    ]) {
      expect(countedSubject(DATE, { subject }), String(subject)).toBeNull();
    }
  });

  it('a row flagged as anything but mechanical never uses its subject', () => {
    expect(countedSubject(DATE, { subject: COUNTED, edition: 'model' })).toBeNull();
    expect(countedSubject(DATE, { subject: COUNTED, edition: 'other' })).toBeNull();
  });
});

describe('briefTitle and briefDescription', () => {
  it('the counted subject, else the date title', () => {
    expect(briefTitle(DATE, { subject: COUNTED })).toBe(`NexusWatch · ${COUNTED}`);
    expect(briefDescription(DATE, { subject: COUNTED })).toBe(COUNTED);
    expect(briefTitle(DATE, { subject: 'Russia and Iran hit record censorship' })).toBe(dateTitle(DATE));
    expect(briefDescription(DATE, {})).toBe(dateTitle(DATE));
    expect(dateTitle(DATE)).toBe(`NexusWatch Situation Brief · ${DATE}`);
  });
});

describe('real archived editions: nothing the brief says reaches the title, description or structured data', () => {
  it('the fixture holds the cases the review named', () => {
    const all = REAL.map((r) => r.briefText).join('\n');
    expect(REAL.length).toBeGreaterThanOrEqual(12);
    for (const s of [
      'OONI Brier 0.058 over 263, -2% vs base rate',
      'skill withheld',
      'Your daily intelligence edge',
      'Global Intelligence for Decision-Makers',
      'highest-ever censorship',
      'record-level network',
    ]) {
      expect(all, s).toContain(s);
    }
  });

  for (const r of REAL) {
    it(`${r.date}: ${r.why}`, async () => {
      row = { brief_date: r.date, summary: '', content: JSON.stringify(r) };
      const html = await page({ date: r.date });
      const { titles, descriptions } = metadata(html);
      const counted = countedSubject(r.date, r);
      const title = counted ? `NexusWatch · ${counted}` : dateTitle(r.date);
      const description = counted ?? dateTitle(r.date);
      for (const t of titles) expect(t).toBe(title);
      for (const d of descriptions) expect(d).toBe(description);
      for (const text of [...titles, ...descriptions]) {
        expect(text).not.toMatch(FORBIDDEN);
        // No sentence of the brief: nothing longer than a few words is shared
        // with the brief's text, except the counted subject's own words.
        if (!counted) expect(r.briefText.includes(text)).toBe(false);
      }
      // The brief itself is still the page.
      expect(html).toContain('<div class="brief">');
    });
  }

  it('the two counted mechanical editions in the fixture use their subjects; no other does', () => {
    const counted = REAL.filter((r) => countedSubject(r.date, r) !== null).map((r) => r.date);
    expect(counted).toEqual(['2026-11-07', '2026-11-16']);
  });
});

describe('/brief/:date', () => {
  it('a mechanical edition: the counted subject, never the top-scored country or the Ledger line', async () => {
    row = {
      brief_date: DATE,
      summary: '<p>x</p>',
      content: JSON.stringify({
        briefText: WEEKDAY,
        subject: COUNTED,
        edition: 'mechanical',
        topRiskCountries: [{ name: 'Yemen', score: 80 }],
      }),
    };
    const html = await page({ date: DATE });
    const { titles, descriptions } = metadata(html);
    for (const t of titles) expect(t).toBe(`NexusWatch · ${COUNTED}`);
    for (const d of descriptions) expect(d).toBe(COUNTED);
    expect(html).not.toContain('Yemen');
  });

  it('the "unchanged" mechanical subject gets the date title and description', async () => {
    row = {
      brief_date: DATE,
      summary: '',
      content: JSON.stringify({ briefText: WEEKDAY, subject: `The Ledger, unchanged — mechanical edition, ${DATE}` }),
    };
    const { titles, descriptions } = metadata(await page({ date: DATE }));
    for (const t of [...titles, ...descriptions]) expect(t).toBe(dateTitle(DATE));
  });

  it('keeps the structured data a single, parseable script whatever the brief says', async () => {
    const hostile = '</script><script>alert(1)</script> & "quotes" <!--';
    row = { brief_date: DATE, summary: '', content: JSON.stringify({ briefText: hostile, subject: hostile }) };
    const html = await page({ date: DATE });
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(jsonLdOf(html).headline).toBe(dateTitle(DATE));
  });

  it('every fallback path: the date title, shown once; the dateless shell: the archive title', async () => {
    const pages: string[] = [];
    row = { brief_date: DATE, summary: '', content: '{"pending":true}' };
    pages.push(await page({ date: DATE }));
    row = null;
    pages.push(await page({ date: DATE }));
    failDb = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pages.push(await page({ date: DATE }));
    delete process.env.DATABASE_URL;
    pages.push(await page({ date: DATE }));
    for (const html of pages) {
      const { titles, descriptions } = metadata(html);
      for (const t of [...titles, ...descriptions]) expect(t).toBe(dateTitle(DATE));
      expect(html).not.toContain(`<p>${dateTitle(DATE)}</p>`);
    }
    const shell = metadata(await page({}));
    for (const t of [...shell.titles, ...shell.descriptions]) expect(t).toBe('Daily Briefs · NexusWatch');
  });
});

/**
 * The record-only (mechanical) edition on its server-rendered page (plan R1).
 * Its call, ledger and corrections links render inside the article as ordinary
 * links; the page's only button-styled link stays the one below the article.
 */
describe('/brief/:date: the record-only edition', () => {
  const TEXT =
    `## 🏁 What resolved today\n\n**The Ledger** — 67 resolved today, 22 hit\n\n` +
    `- UG (UG): MISS — we said 40% (base rate 30%). [Call #7001](https://nexuswatch.dev/call/7001)\n\n` +
    `## 📝 About this edition\n\nCorrections to earlier editions of this brief are listed on ` +
    `[the corrections page](https://nexuswatch.dev/corrections).\n`;

  it('its links render as links in the article, styled as text, not as the page button', async () => {
    row = { brief_date: DATE, summary: '', content: { briefText: TEXT, subject: COUNTED, edition: 'mechanical' } };
    const html = await page({ date: DATE });
    const article = html.slice(html.indexOf('<div class="brief">'), html.indexOf('<p class="more">'));
    expect(article).toContain('<a href="https://nexuswatch.dev/call/7001" rel="noopener">Call #7001</a>');
    expect(article).toContain('<a href="https://nexuswatch.dev/corrections" rel="noopener">the corrections page</a>');
    expect(article).not.toContain('](');
    // The article's links undo the page button's capitals, border and padding.
    const rule = /\.brief a \{([^}]*)\}/.exec(html)?.[1] ?? '';
    for (const d of ['text-transform: none', 'border: 0', 'padding: 0', 'display: inline', 'font: inherit']) {
      expect(rule).toContain(d);
    }
    // Title and description are the counted subject, as before.
    expect(metadata(html).titles[0]).toBe(`NexusWatch · ${COUNTED}`);
  });
});
