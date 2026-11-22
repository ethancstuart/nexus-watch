import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler, { briefDescription, briefTitle, dateTitle } from './og.js';

/**
 * A BRIEF PAGE'S TITLE AND DESCRIPTION SAY WHAT THE EDITION SAYS.
 *
 * Live on 15 Nov 2026 (lanes2/GTM.md §1): the title was "NexusWatch · Yemen ·
 * 2026-11-15", from the top-scored country, which the brief does not mention;
 * the description was raw Markdown, "## 🎯 Today's Call The Ledger — …".
 * The fallbacks said "Daily geopolitical intelligence". Synthetic rows only.
 */

const DATE = '2026-11-15';
const WEEKDAY =
  "## 🎯 Today's Call\n\nThe Ledger — 67 resolved today, 22 hit · 928 open, next resolves 2026-11-16\n\n" +
  '## 📊 Top Signal\n\n**A synthetic headline.** A synthetic body with *emphasis* and `code`.\n\n' +
  '## 🌍 The Board\n\n- one\n- two\n';
const SUNDAY = "## ☕ Good Morning\n\nA synthetic **Sunday** opening.\n\n## 🎯 This Week's Calls\n\n- a call\n";

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
const titleOf = (html: string) => tag(html, /<title>([^<]*)<\/title>/);
const descOf = (html: string) => tag(html, /<meta name="description" content="([^"]*)">/);
function jsonLdOf(html: string): { headline: string; description: string } {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return JSON.parse(m?.[1] ?? 'null') as { headline: string; description: string };
}

/** Words no title or description we write may carry (lanes2/LANE-G.md). */
const BANNED = /intelligence|real-time|real time|skill/i;

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  failDb = false;
  row = null;
});

describe('briefTitle', () => {
  it('is the archived subject and the date', () => {
    expect(briefTitle(DATE, '64 calls settled today — 33 hit, 31 miss')).toBe(
      `NexusWatch · 64 calls settled today — 33 hit, 31 miss · ${DATE}`,
    );
  });

  it('does not repeat a date the subject already carries', () => {
    const s = `67 calls settled, 22 hit — mechanical edition, ${DATE}`;
    expect(briefTitle(DATE, s)).toBe(`NexusWatch · ${s}`);
  });

  it('falls back to the date title without a usable subject', () => {
    for (const s of [undefined, null, '', '   ', 42, { subject: 'x' }]) {
      expect(briefTitle(DATE, s)).toBe(`NexusWatch Situation Brief · ${DATE}`);
    }
    expect(dateTitle(DATE)).toBe(`NexusWatch Situation Brief · ${DATE}`);
  });

  it('collapses whitespace in the subject', () => {
    expect(briefTitle(DATE, '  a\n  b  ')).toBe(`NexusWatch · a b · ${DATE}`);
  });
});

describe('briefDescription', () => {
  it('is plain text from the opening prose of a weekday edition, with no Markdown', () => {
    const d = briefDescription(DATE, WEEKDAY);
    expect(d.startsWith('The Ledger — 67 resolved today, 22 hit')).toBe(true);
    expect(d).not.toMatch(/[#*`]|🎯|Today's Call/);
    expect(d).toContain('A synthetic headline. A synthetic body with emphasis and code.');
  });

  it('keeps what the text says: underscores, comparisons and link words', () => {
    const md =
      "## 🎯 Today's Call\n\nResolved against fx_rates; Iran > 30% and Brier < 0.1. See [the ledger](https://nexuswatch.dev/ledger).\n\n---\n\n1. first\n2) second";
    expect(briefDescription(DATE, md)).toBe(
      'Resolved against fx_rates; Iran > 30% and Brier < 0.1. See the ledger. first second',
    );
  });

  it('uses the Good Morning paragraph when the edition has one', () => {
    expect(briefDescription(DATE, SUNDAY)).toBe('A synthetic Sunday opening.');
  });

  it('is cut at a word, near 200 characters, with an ellipsis', () => {
    const long = `## 🎯 Today's Call\n\n${'word '.repeat(100)}`;
    const d = briefDescription(DATE, long);
    expect(d.length).toBeLessThanOrEqual(201);
    expect(d.endsWith('word…')).toBe(true);
  });

  it('falls back to the date title when there is no prose', () => {
    expect(briefDescription(DATE, "## 🎯 Today's Call\n\n## 📊 Top Signal\n")).toBe(dateTitle(DATE));
    expect(briefDescription(DATE, '')).toBe(dateTitle(DATE));
  });
});

describe('/brief/:date', () => {
  it('titles the page from the subject, not the top-scored country', async () => {
    row = {
      brief_date: DATE,
      summary: '<p>x</p>',
      content: JSON.stringify({
        briefText: WEEKDAY,
        subject: '67 forecasts settled today — 10 hit, 57 miss',
        topRiskCountries: [{ name: 'Yemen', score: 80 }],
      }),
    };
    const html = await page({ date: DATE });
    const title = `NexusWatch · 67 forecasts settled today — 10 hit, 57 miss · ${DATE}`;
    expect(titleOf(html)).toBe(title);
    expect(html).not.toContain('Yemen');
    expect(tag(html, /<meta property="og:title" content="([^"]*)">/)).toBe(title);
    expect(tag(html, /<meta name="twitter:title" content="([^"]*)">/)).toBe(title);
    expect(jsonLdOf(html).headline).toBe(title);
    expect(tag(html, /<h1>([^<]*)<\/h1>/)).toBe(title);

    const desc = descOf(html);
    expect(desc.startsWith('The Ledger — 67 resolved today')).toBe(true);
    expect(desc).not.toMatch(/[#*`]/);
    expect(tag(html, /<meta property="og:description" content="([^"]*)">/)).toBe(desc);
    expect(jsonLdOf(html).description).toBe(desc);
  });

  it('a row stored before subjects were archived gets the date title', async () => {
    row = { brief_date: DATE, summary: '', content: { briefText: SUNDAY, topRiskCountries: [{ name: 'Yemen' }] } };
    const html = await page({ date: DATE });
    expect(titleOf(html)).toBe(dateTitle(DATE));
    expect(descOf(html)).toBe('A synthetic Sunday opening.');
  });

  it('keeps the structured data a single, parseable script whatever the subject says', async () => {
    const subject = '</script><script>alert(1)</script> & "quotes"';
    row = { brief_date: DATE, summary: '', content: JSON.stringify({ briefText: WEEKDAY, subject }) };
    const html = await page({ date: DATE });
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(jsonLdOf(html).headline).toBe(`NexusWatch · ${subject} · ${DATE}`);
    expect(titleOf(html)).toBe(`NexusWatch · ${subject} · ${DATE}`);
  });

  it('no title or description we write says intelligence, real-time or skill', async () => {
    const pages: string[] = [];
    row = { brief_date: DATE, summary: '', content: JSON.stringify({ briefText: WEEKDAY }) };
    pages.push(await page({ date: DATE }));
    row = { brief_date: DATE, summary: '', content: '{"pending":true}' };
    pages.push(await page({ date: DATE }));
    row = null;
    pages.push(await page({ date: DATE }));
    failDb = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pages.push(await page({ date: DATE }));
    delete process.env.DATABASE_URL;
    pages.push(await page({ date: DATE }));
    pages.push(await page({}));
    for (const html of pages) {
      for (const text of [titleOf(html), descOf(html), jsonLdOf(html).headline, jsonLdOf(html).description]) {
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(BANNED);
        expect(text).not.toMatch(/[#*`]/);
      }
    }
    // Without the brief, the dated fallbacks are the date title, shown once.
    for (const html of pages.slice(1, 5)) {
      expect(titleOf(html)).toBe(dateTitle(DATE));
      expect(descOf(html)).toBe(dateTitle(DATE));
      expect(html).not.toContain(`<p>${dateTitle(DATE)}</p>`);
    }
    expect(titleOf(pages[5] as string)).toBe('Daily Briefs · NexusWatch');
  });
});
