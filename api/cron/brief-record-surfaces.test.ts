import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SUBJECT_PATTERN } from '../_lib/brief-preview.js';
import { RECORD_SECTIONS } from '../_lib/brief-record.js';

/**
 * THE RECORD-ONLY EDITION ON EVERY SURFACE THAT SHOWS IT (plan R1).
 *
 * The real daily-brief handler runs as production does today: no model key.
 * The wire feeds answer with a headline and the market API with quotes, so the
 * handler has both in hand; then every reader surface reads what it archived:
 * the public JSON (/api/v1/brief, also the MCP get_brief tool), the brief page,
 * the archive JSON, both feeds, the share image, and the email the delivery
 * job sends (HTML, plain text, subject). Each must carry the record, in order,
 * linked, and none of the wire or market content. Hermetic: fake database,
 * stubbed fetch, synthetic keys and rows, every address at example.test.
 */

const TODAY = '2026-11-27';
const READER = 'reader@example.test';
const WIRE = 'QZXWIREHEADLINE How online maps lay bare the bases';
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const MODEL_URL = 'https://api.anthropic.com/v1/messages';

// ---------------------------------------------------------------------------
// Fixtures: what the database would hold on a resolution day.
// ---------------------------------------------------------------------------

const CII_ROWS = [
  { country_code: 'YE', country_name: 'Yemen', score: 82, deviation: 9, components: { conflict: 15 } },
  { country_code: 'UG', country_name: 'Uganda', score: 41, deviation: 1, components: { conflict: 4 } },
  { country_code: 'KE', country_name: 'Kenya', score: 35, deviation: 0, components: { conflict: 3 } },
];

const fxCall = (id: number, code: string, ccy: string, p: number, status: string, resolves: string) => ({
  id,
  kind: 'fx_devaluation',
  country_code: code,
  claim: `${ccy} depreciates 1.50% or more against USD at any point within 14 days, from 100.00.`,
  probability: p,
  base_rate: 0.25,
  threshold: 1,
  threshold_pct: 1.5,
  made_on: '2026-11-13',
  resolves_on: resolves,
  status,
  evidence_count: status === 'pending' ? null : 120,
  corrected_status: null,
});
const RESOLVED = [
  fxCall(90501, 'UG', 'UGX', 0.37, 'hit', TODAY),
  fxCall(90502, 'KE', 'KES', 0.31, 'miss', TODAY),
  fxCall(90503, 'AZ', 'AZN', 0.22, 'miss', TODAY),
];
const NEXT = [fxCall(90601, 'KE', 'KES', 0.33, 'pending', '2026-11-28')];

const db = {
  row: null as null | {
    brief_date: string;
    content: unknown;
    contentText: string;
    summary: string;
    email_html: string | null;
    plain_text: string | null;
    generated_at: string;
  },
  failRecord: false,
  failLedger: false,
  subscribers: [] as Array<{ email: string; timezone: string }>,
  claims: new Set<string>(),
};

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function selected(text: string): string[] {
  const list = /^SELECT (.*?) FROM daily_briefs/.exec(text)?.[1] ?? '';
  return list.split(/,(?![^(]*\))/).map((c) => {
    const as = / AS (\w+)$/i.exec(c.trim());
    return as ? as[1] : c.trim();
  });
}

async function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
  const text = norm(strings.join('$?'));

  // The brief job's own row.
  if (text.startsWith('INSERT INTO daily_briefs')) {
    if (db.row) return [];
    db.row = {
      brief_date: values[0] as string,
      content: { pending: true },
      contentText: '{"pending":true}',
      summary: 'generating...',
      email_html: null,
      plain_text: null,
      generated_at: `${TODAY}T10:00:05Z`,
    };
    return [{ brief_date: values[0] }];
  }
  if (text.startsWith('UPDATE daily_briefs SET content = $?, summary = $?')) {
    db.row!.contentText = values[0] as string;
    db.row!.content = JSON.parse(values[0] as string);
    db.row!.summary = values[1] as string;
    return [];
  }
  if (text.startsWith('UPDATE daily_briefs SET email_html = $?, plain_text = $?')) {
    db.row!.email_html = values[0] as string;
    db.row!.plain_text = values[1] as string;
    return [];
  }
  // Every reader of the row.
  if (text.startsWith('SELECT') && text.includes('FROM daily_briefs')) {
    const r = db.row;
    if (!r) return [];
    if (text.includes('WHERE brief_date = $?') && values[0] !== r.brief_date) return [];
    const all: Record<string, unknown> = {
      brief_date: r.brief_date,
      content: r.content,
      summary: r.summary,
      email_html: r.email_html,
      plain_text: r.plain_text,
      generated_at: r.generated_at,
      head: r.summary.slice(0, 8000),
      subject_json: new RegExp(SUBJECT_PATTERN).exec(r.contentText)?.[1] ?? null,
    };
    return [Object.fromEntries(selected(text).map((c) => [c, all[c]]))];
  }

  // The delivery job.
  if (text.includes('information_schema.columns'))
    return [{ column_name: 'email_html' }, { column_name: 'plain_text' }];
  if (text.startsWith('SELECT es.email, es.timezone FROM email_subscribers')) {
    return db.subscribers.filter((s) => !db.claims.has(`${s.email}|${values[0]}`));
  }
  if (text.startsWith('INSERT INTO brief_subscriber_delivery')) {
    const [date, emails] = values as [string, string[]];
    const inserted = emails.filter((e) => !db.claims.has(`${e}|${date}`));
    for (const e of inserted) db.claims.add(`${e}|${date}`);
    return inserted.map((e) => ({ subscriber_email: e }));
  }

  // The country table, so names resolve.
  if (text.startsWith('SELECT DISTINCT ON (country_code) country_code, country_name, score, components'))
    return CII_ROWS;

  // The Ledger line: today's resolutions, every scored row, the open count.
  if (text.startsWith('SELECT country_code, status, probability::float AS probability FROM calls WHERE resolved_at')) {
    if (db.failLedger) throw new Error('synthetic: the Ledger line read is unavailable');
    return RESOLVED.map((r) => ({ country_code: r.country_code, status: r.status, probability: r.probability }));
  }
  if (
    text.startsWith('SELECT c.kind, c.probability::float AS probability, c.base_rate::float AS base_rate, c.status')
  ) {
    return RESOLVED.map((r) => ({ ...r, resolved_at: `${TODAY} 09:45:00+00` }));
  }
  if (text.startsWith('SELECT COUNT(*)::int AS n, (MIN(resolves_on)')) return [{ n: 789, next_resolves: '2026-11-28' }];

  // The edition's record.
  if (
    text.includes('resolved_at::date = CURRENT_DATE') &&
    /^SELECT (COUNT\(\*\)::int AS total|c\.id::int AS id|c\.status, cc\.corrected_status)/.test(text)
  ) {
    if (db.failRecord) throw new Error('synthetic: the calls table is unavailable');
    if (text.startsWith('SELECT COUNT(*)::int AS total')) return [{ total: 3, hits: 1 }];
    if (text.startsWith('SELECT c.id::int AS id')) return RESOLVED;
    return [];
  }
  if (text.startsWith('SELECT COUNT(*)::int AS open_total')) {
    if (db.failRecord) throw new Error('synthetic: the calls table is unavailable');
    return [{ open_total: 789, held: 0 }];
  }
  if (text.startsWith('SELECT c.id::int AS id') && text.includes("c.status = 'pending'")) {
    if (db.failRecord) throw new Error('synthetic: the calls table is unavailable');
    return NEXT;
  }

  // Everything else (the prompt's call lines, OONI, history, logs, alerts): empty.
  return [];
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));
vi.mock('../_lib/llm-budget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/llm-budget.js')>()),
  checkBudget: vi.fn(async () => ({ ok: true, spend_today: 0, cap: 9 })),
  recordAnthropicSpend: vi.fn(async () => undefined),
}));

const { default: dailyBrief, MECHANICAL_EDITION_LINE } = await import('./daily-brief.js');
const { default: deliverBriefs } = await import('./deliver-briefs.js');
const { default: v1Brief } = await import('../v1/brief.js');
const { default: briefsApi } = await import('../briefs.js');
const { default: briefPage } = await import('../brief/og.js');
const { default: screenshot } = await import('../brief/screenshot.js');
const { default: rssFeed } = await import('../feed.js');
const { default: atomFeed } = await import('../atom.js');
const { briefCardWords } = await import('../og.js');

// ---------------------------------------------------------------------------
// Network: the wire and the market API answer; nothing else does.
// ---------------------------------------------------------------------------

let sent: Array<{ url: string; body: string }> = [];
const RSS = `<?xml version="1.0"?><rss><channel><item><title>${WIRE}</title></item></channel></rss>`;
const QUOTES = {
  SPY: { close: '601.20', percent_change: '0.41' },
  USO: { close: '72.10', percent_change: '-1.20' },
};
const fetchStub = vi.fn(async (input: unknown, init?: { body?: unknown }) => {
  const url = String(input);
  sent.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
  if (url.startsWith('https://api.twelvedata.com/')) return new Response(JSON.stringify(QUOTES), { status: 200 });
  if (/rss|feed|xml/i.test(url)) return new Response(RSS, { status: 200 });
  if (url === MODEL_URL) return new Response('synthetic outage', { status: 500 });
  if (url === RESEND_BATCH_URL) return new Response(JSON.stringify({ data: [] }), { status: 200 });
  return new Response('not found', { status: 404 });
});

async function call(
  handler: (req: VercelRequest, res: VercelResponse) => unknown,
  req: { query?: Record<string, string>; method?: string; headers?: Record<string, string> } = {},
): Promise<string> {
  let body: unknown;
  const res = {
    status: () => res,
    json: (b: unknown) => ((body = b), res),
    send: (b: unknown) => ((body = b), res),
    setHeader: () => res,
    end: () => res,
  };
  await handler(
    { method: 'GET', headers: {}, query: {}, ...req } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return typeof body === 'string' ? body : JSON.stringify(body);
}

const cron = { headers: { authorization: 'Bearer test-secret' } };

async function runBrief(): Promise<void> {
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
  await call(dailyBrief, { ...cron, method: 'POST' });
}

/** Every surface a reader or an agent can be shown, from the row the job wrote. */
async function surfaces(): Promise<Record<string, string>> {
  const out: Record<string, string> = {
    'public JSON (/api/v1/brief?date, MCP get_brief)': await call(v1Brief, { query: { date: TODAY } }),
    'public JSON, latest (/api/v1/brief)': await call(v1Brief),
    'brief page (/brief/:date)': await call(briefPage, { query: { date: TODAY } }),
    'archive JSON (/api/briefs?date)': await call(briefsApi, { query: { date: TODAY } }),
    'archive list (/api/briefs)': await call(briefsApi),
    'RSS feed': await call(rssFeed),
    'Atom feed': await call(atomFeed),
    'share image (/api/brief/screenshot)': await call(screenshot, { query: { date: TODAY, size: 'og' } }),
    'share card words (/api/og?type=brief)': JSON.stringify(briefCardWords(TODAY, db.row!.summary, db.row!.content)),
  };
  db.subscribers = [{ email: READER, timezone: 'UTC' }];
  vi.setSystemTime(new Date(`${TODAY}T11:00:00Z`));
  const before = sent.length;
  await call(deliverBriefs, cron);
  const batch = sent.slice(before).filter((s) => s.url === RESEND_BATCH_URL);
  expect(batch).toHaveLength(1);
  const [email] = JSON.parse(batch[0].body) as Array<{ subject: string; html: string; text: string }>;
  out['email subject'] = email.subject;
  out['email HTML'] = email.html;
  out['email plain text'] = email.text;
  return out;
}

beforeEach(() => {
  db.row = null;
  db.failRecord = false;
  db.failLedger = false;
  db.subscribers = [];
  db.claims = new Set();
  sent = [];
  fetchStub.mockClear();
  vi.stubGlobal('fetch', fetchStub);
  vi.useFakeTimers({ toFake: ['Date'] });
  const env: Record<string, string | undefined> = {
    CRON_SECRET: 'test-secret',
    DATABASE_URL: 'postgres://synthetic.invalid/none',
    ANTHROPIC_API_KEY: undefined,
    BRIEF_MODEL_MODE: undefined,
    TWELVEDATA_API_KEY: 'synthetic-twelvedata-key',
    MAPBOX_TOKEN: 'synthetic-map-token',
    RESEND_API_KEY: 'synthetic-resend-key',
    ADMIN_EMAILS: undefined,
    DISCORD_APPROVAL_WEBHOOK_URL: undefined,
    NOTION_API_KEY: undefined,
  };
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

const FORBIDDEN = [
  'QZXWIREHEADLINE',
  'as the wire carried it',
  'S&P 500 ETF',
  'SPY',
  'Crude oil ETF',
  '601.20',
  '+0.41%',
  'Market Pulse',
  'Yemen',
  'Top Signal',
  'Map of the Day',
  'TENSION',
];

describe('the record-only edition on every surface (no model key, as production runs today)', () => {
  it('guard: the wire headline and the market quotes really reached the handler', async () => {
    await runBrief();
    expect(sent.some((s) => s.url.startsWith('https://api.twelvedata.com/'))).toBe(true);
    expect(sent.some((s) => /rss|feed/i.test(s.url))).toBe(true);
    // With a key set, the same inputs go into the model's prompt: they were in hand.
    db.row = null;
    vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-anthropic-key');
    sent = [];
    await runBrief();
    const prompt = sent.find((s) => s.url === MODEL_URL)?.body ?? '';
    expect(prompt).toContain('QZXWIREHEADLINE');
    expect(prompt).toContain('S&P 500 ETF (SPY)');
    // The model call failed, so readers got the record-only edition all the same.
    expect((db.row!.content as { edition: string }).edition).toBe('mechanical');
    expect(db.row!.contentText).not.toContain('QZXWIREHEADLINE');
  });

  it('no surface carries a wire headline, a market quote or an index row', async () => {
    await runBrief();
    const s = await surfaces();
    expect(Object.keys(s)).toHaveLength(12);
    for (const [name, text] of Object.entries(s)) {
      expect(text.length, name).toBeGreaterThan(0);
      for (const w of FORBIDDEN) expect(text, `${name} carries ${w}`).not.toContain(w);
    }
  });

  it('the archived JSON is the edition: its record, its text, its subject, its edition, nothing else', async () => {
    await runBrief();
    const content = db.row!.content as Record<string, unknown>;
    expect(Object.keys(content)).toEqual(['date', 'utcTime', 'record', 'briefText', 'subject', 'edition']);
    expect(content.edition).toBe('mechanical');
    expect(content.record).toMatchObject({
      resolved: { read: true, total: 3, hits: 1 },
      open: { read: true, total: 789, held: 0 },
      correctionsPage: true,
    });
  });

  it('the subject counts what the edition lists', async () => {
    await runBrief();
    const s = await surfaces();
    expect(s['email subject']).toBe(`3 calls settled, 1 hit — mechanical edition, ${TODAY} — The NexusWatch Brief`);
    expect(s['email plain text']).toContain('3 calls settled today against external ground truth: 1 hit, 2 miss.');
    expect(s['brief page (/brief/:date)']).toContain(`<title>NexusWatch · 3 calls settled, 1 hit — mechanical edition`);
    expect(s['share image (/api/brief/screenshot)']).toContain('>3 calls settled, 1 hit<');
  });

  it('the Ledger line read fails: the subject is counted from the edition’s own read, never "unchanged"', async () => {
    db.failLedger = true;
    await runBrief();
    const s = await surfaces();
    expect(s['brief page (/brief/:date)']).not.toContain('**The Ledger**');
    expect(s['email subject']).toBe(`3 calls settled, 1 hit — mechanical edition, ${TODAY} — The NexusWatch Brief`);
    expect(s['email plain text']).toContain('3 calls settled today against external ground truth: 1 hit, 2 miss.');
    // Both reads failed: no count anywhere, so the subject says nothing changed only when nothing was read.
    db.row = null;
    db.claims = new Set();
    db.failRecord = true;
    await runBrief();
    expect((db.row!.content as { subject: string }).subject).toBe(
      `The Ledger, unchanged — mechanical edition, ${TODAY}`,
    );
  });

  it('the page, the email and the feeds carry the sections in order, and the calls linked', async () => {
    await runBrief();
    const s = await surfaces();
    const titles = RECORD_SECTIONS.map((h) => h.replace(/^## \S+ /, ''));
    for (const name of ['brief page (/brief/:date)', 'email HTML', 'email plain text', 'RSS feed', 'Atom feed']) {
      const text = s[name];
      const at = titles.map((t) => text.indexOf(t));
      for (const [i, a] of at.entries()) expect(a, `${name}: ${titles[i]}`).toBeGreaterThan(-1);
      expect(
        [...at].sort((x, y) => x - y),
        name,
      ).toEqual(at);
      expect(text.indexOf('The Ledger'), name).toBeLessThan(at[1]);
    }
    for (const name of ['brief page (/brief/:date)', 'email HTML', 'RSS feed', 'Atom feed']) {
      for (const c of [...RESOLVED, ...NEXT])
        expect(s[name], `${name} ${c.id}`).toContain(`href="https://nexuswatch.dev/call/${c.id}"`);
      expect(s[name]).toContain('href="https://nexuswatch.dev/corrections"');
    }
    for (const c of [...RESOLVED, ...NEXT]) {
      expect(s['email plain text']).toContain(`Call #${c.id} (https://nexuswatch.dev/call/${c.id})`);
    }
    // The edition line heads the email and the stored summary.
    expect(s['email HTML']).toContain(MECHANICAL_EDITION_LINE);
    expect(s['email plain text'].split('\n')[2]).toBe(MECHANICAL_EDITION_LINE);
    // The chrome is untouched: unsubscribe and preferences still there.
    expect(s['email HTML']).toContain('Unsubscribe</a>');
    expect(s['email plain text']).toMatch(/Unsubscribe: https?:\/\//);
  });

  it('the calls table unavailable: no surface says the book is empty or that nothing resolved', async () => {
    db.failRecord = true;
    await runBrief();
    const s = await surfaces();
    for (const [name, text] of Object.entries(s)) {
      expect(text, name).not.toContain('No open calls today.');
      expect(text, name).not.toContain('No calls resolved today.');
      expect(text, name).not.toContain('No call to explain today');
    }
    for (const name of ['brief page (/brief/:date)', 'email HTML', 'email plain text']) {
      expect(s[name]).toContain('Open calls could not be read today.');
      expect(s[name]).toContain('Resolved calls could not be read today.');
    }
  });
});
