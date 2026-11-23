import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SUBJECT_PATTERN } from '../_lib/brief-preview.js';
import { DAILY_SECTIONS } from '../_lib/brief-structure.js';

/**
 * THE DRY RUN, END TO END (SEND-HOLD-DESIGN.md, Option 1, tests 1 to 9).
 *
 * The real daily-brief handler runs against a fake database and a stubbed
 * fetch, then the real public surfaces and the real delivery job read what it
 * wrote. Hermetic: no network, no model call, no database, synthetic keys, every
 * address at example.test. The clock is pinned to Monday 2026-11-23 10:00Z
 * (the Mon-Sat section spine) and moved to 11:00Z for delivery.
 */

const TODAY = '2026-11-23';
const ADMIN = 'owner@example.test';
const READER = 'reader@example.test';
const WEBHOOK = 'https://discord.example.test/api/webhooks/1/synthetic';
const MODEL_URL = 'https://api.anthropic.com/v1/messages';
const RESEND_URL = 'https://api.resend.com/emails';
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
// beehiiv is retired. Its settings stay set below, as they are in production
// until the owner deletes them, so every run here proves that nothing is sent
// to beehiiv even with them present. Synthetic ids, never real values.
const BEEHIIV_GOOD_ID = 'pub_00000000-1111-2222-3333-444444444444';
const BEEHIIV_MALFORMED_ID = 'Qk7Xv-9mZp-W3tR-Lc8Yd-NbHs4-Ugj2';

// Planted in the draft's declared subject and in its body (test 6).
const SUBJECT_MARKER = 'QZXSUBJECTMARKERQZX';
const BODY_MARKER = 'QZXBODYMARKERQZX';
const MARKERS = [SUBJECT_MARKER, BODY_MARKER];

/** A draft that clears all three gates: five sections, the clause, no numerals, no comparison. */
const PASSING_BODY = [
  DAILY_SECTIONS[0],
  'No open calls today.',
  DAILY_SECTIONS[1],
  `**A quiet board, ${BODY_MARKER}.** Nothing crossed a threshold overnight.`,
  DAILY_SECTIONS[2],
  'Nothing moved past the threshold. **What would change our mind:** a confirmed OONI blocking event in any country.',
  DAILY_SECTIONS[3],
  '- Nothing withheld today: the data covered what moved.',
  DAILY_SECTIONS[4],
  'Quiet on every trajectory.',
].join('\n\n');
const draft = (body = PASSING_BODY) => `SUBJECT: A dry run ${SUBJECT_MARKER} subject for a test day\n\n${body}`;
const DRAFTS = {
  passing: draft(),
  // Each refused by one gate in the handler's order, the earlier gates passing.
  grounding: draft(`${PASSING_BODY}\n\nFigures 987654, 876543, 765432 and 654321.`),
  structure: draft(PASSING_BODY.replace(`${DAILY_SECTIONS[4]}\n\nQuiet on every trajectory.`, '')),
  claims: draft(`${PASSING_BODY}\n\nOONI logged 5 network blocks.`),
};

// ---------------------------------------------------------------------------
// Fake database
// ---------------------------------------------------------------------------

interface BriefRow {
  brief_date: string;
  /** Parsed, as a jsonb column returns it; the raw text is kept beside it. */
  content: unknown;
  contentText: string;
  summary: string;
  email_html: string | null;
  plain_text: string | null;
  generated_at: string;
}

const db = {
  row: null as BriefRow | null,
  queries: [] as Array<{ text: string; values: unknown[] }>,
  dryRuns: [] as Array<Record<string, unknown>>,
  failDryRunInsert: false,
  subscribers: [] as Array<{ email: string; timezone: string }>,
  claims: new Set<string>(),
  /** alert_state, by fingerprint; times in ms on the (fake) clock. */
  alerts: new Map<string, { title: string; firstSeen: number; lastSent: number | null }>(),
  /** What the delivery-channel health check reads from brief_delivery_log. */
  deliveryLog: [] as Array<{ channel: string; brief_date: string; status: string; error: string | null }>,
};

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The columns a SELECT names, by their output name. */
function selected(text: string): string[] {
  const list = /^SELECT (.*?) FROM daily_briefs/.exec(text)?.[1] ?? '';
  return list.split(/,(?![^(]*\))/).map((c) => {
    const as = / AS (\w+)$/i.exec(c.trim());
    return as ? as[1] : c.trim();
  });
}

function projectRow(text: string, values: unknown[]): Record<string, unknown>[] {
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

async function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
  const text = norm(strings.join('$?'));
  db.queries.push({ text, values });

  // daily-brief: claim, archive, email columns, dry-run record.
  if (text.startsWith('INSERT INTO daily_briefs')) {
    if (db.row) return [];
    db.row = {
      brief_date: values[0] as string,
      content: { pending: true },
      contentText: '{"pending":true}',
      summary: 'generating...',
      email_html: null,
      plain_text: null,
      generated_at: new Date().toISOString(),
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
  if (text.startsWith('INSERT INTO brief_dry_runs')) {
    if (db.failDryRunInsert) throw new Error('relation "brief_dry_runs" does not exist');
    const columns = /\(([^)]*)\) VALUES/
      .exec(text)![1]
      .split(',')
      .map((c) => c.trim());
    db.dryRuns.push(Object.fromEntries(columns.map((c, i) => [c, values[i]])));
    return [];
  }

  // Readers of daily_briefs: the public surfaces and the delivery job.
  if (text.startsWith('SELECT') && text.includes('FROM daily_briefs')) return projectRow(text, values);

  // deliver-briefs.
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

  // alert.ts: alert_state, emulated per statement so a condition carries
  // across runs (the reminder interval, first_seen, the all-clear).
  const now = Date.now();
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  if (text.startsWith('INSERT INTO alert_state')) {
    const [key, title] = values as [string, string];
    const a = db.alerts.get(key);
    db.alerts.set(key, { title, firstSeen: a?.firstSeen ?? now, lastSent: a?.lastSent ?? null });
    return [];
  }
  if (text.startsWith('UPDATE alert_state a SET last_sent')) {
    const [key, hours] = values as [string, number];
    const a = db.alerts.get(key);
    if (!a || (a.lastSent !== null && now - a.lastSent < hours * 3_600_000)) return [];
    const prior = a.lastSent;
    a.lastSent = now;
    return [{ first_seen: iso(a.firstSeen), prior: iso(prior) }];
  }
  if (text.startsWith('UPDATE alert_state SET last_sent')) {
    const [prev, key] = values as [string | null, string];
    const a = db.alerts.get(key);
    if (a) a.lastSent = prev ? Date.parse(prev) : null;
    return [];
  }
  if (text.startsWith('SELECT title, last_sent')) {
    const a = db.alerts.get(values[0] as string);
    return a ? [{ title: a.title, last_sent: iso(a.lastSent), ongoing_hours: (now - a.firstSeen) / 3_600_000 }] : [];
  }
  if (text.startsWith('DELETE FROM alert_state')) {
    db.alerts.delete(values[0] as string);
    return [];
  }

  // daily-brief's delivery-channel health check reads the whole log.
  if (text.startsWith('SELECT channel, brief_date::text AS brief_date, status, error FROM brief_delivery_log')) {
    return db.deliveryLog;
  }

  // Everything else (CII, OONI, calls, ledger, delivery-log writes, snapshots): empty.
  return [];
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));
vi.mock('../_lib/llm-budget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/llm-budget.js')>()),
  checkBudget: vi.fn(async () => ({ ok: true, spend_today: 0, cap: 9 })),
  recordAnthropicSpend: vi.fn(async () => undefined),
}));

const { default: dailyBrief, MECHANICAL_EDITION_LINE, DRY_RUN_CLAUSE } = await import('./daily-brief.js');
const { default: deliverBriefs } = await import('./deliver-briefs.js');
const { default: v1Brief } = await import('../v1/brief.js');
const { default: briefsApi } = await import('../briefs.js');
const { default: briefPage } = await import('../brief/og.js');
const { default: rssFeed } = await import('../feed.js');
const { default: atomFeed } = await import('../atom.js');
const { recordAnthropicSpend } = await import('../_lib/llm-budget.js');

// ---------------------------------------------------------------------------
// Stubbed network
// ---------------------------------------------------------------------------

interface Sent {
  url: string;
  body: string;
}
let sent: Sent[] = [];
const net = {
  model: { status: 200, body: {} as unknown },
  resendEmailStatus: 200,
  resendEmailThrows: false,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const modelReply = (text: string, stop_reason = 'end_turn') => ({
  content: [{ type: 'text', text }],
  stop_reason,
  usage: { input_tokens: 15000, output_tokens: 2100, cache_read_input_tokens: 0 },
});

const fetchStub = vi.fn(async (input: unknown, init?: { body?: unknown }) => {
  const url = String(input);
  sent.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
  if (url === MODEL_URL) return json(net.model.status, net.model.body);
  if (url === RESEND_URL) {
    if (net.resendEmailThrows) throw new Error('synthetic network failure');
    return json(net.resendEmailStatus, { id: 'msg_synthetic' });
  }
  if (url === RESEND_BATCH_URL) return json(200, { data: [] });
  if (url === WEBHOOK) return new Response(null, { status: 204 });
  // USGS, WHO, GDELT, the RSS feeds: unavailable, as on a bad morning.
  return new Response('not found', { status: 404 });
});

const to = (url: string) => sent.filter((s) => s.url === url);
/** Any request to a beehiiv host, or any payload that mentions beehiiv (an alert about it, say). */
const beehiivTraffic = () => sent.filter((s) => /beehiiv/i.test(new URL(s.url).hostname) || /beehiiv/i.test(s.body));
const parsed = (s: Sent) => JSON.parse(s.body) as Record<string, unknown>;
const isOperatorEmail = (s: Sent) =>
  s.url === RESEND_URL && String(parsed(s).subject).startsWith('[INFO] DRY RUN, not sent to readers');

// ---------------------------------------------------------------------------
// Calling handlers
// ---------------------------------------------------------------------------

interface Out {
  status: number;
  body: unknown;
}

async function call(
  handler: (req: VercelRequest, res: VercelResponse) => unknown,
  req: { query?: Record<string, string>; method?: string; headers?: Record<string, string> } = {},
): Promise<Out> {
  const out: Out = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(b: unknown) {
      out.body = b;
      return res;
    },
    send(b: unknown) {
      out.body = b;
      return res;
    },
    setHeader() {
      return res;
    },
    end() {
      return res;
    },
  };
  await handler(
    { method: 'GET', headers: {}, query: {}, ...req } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return out;
}

const cron = { headers: { authorization: 'Bearer test-secret' } };

async function runBrief(modelText: string = DRAFTS.passing, stop = 'end_turn'): Promise<Out> {
  net.model = { status: 200, body: modelReply(modelText, stop) };
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
  return call(dailyBrief, { ...cron, method: 'POST' });
}

/** Everything a reader can be shown, from the row the brief job wrote. */
async function readerSurfaces(): Promise<Record<string, string>> {
  const text = (o: Out) => (typeof o.body === 'string' ? o.body : JSON.stringify(o.body));
  const out: Record<string, string> = {
    'public JSON for the date (/api/v1/brief?date)': text(await call(v1Brief, { query: { date: TODAY } })),
    'public JSON, latest (/api/v1/brief)': text(await call(v1Brief)),
    'brief page (/brief/:date)': text(await call(briefPage, { query: { date: TODAY } })),
    'archive JSON for the date (/api/briefs?date)': text(await call(briefsApi, { query: { date: TODAY } })),
    'archive list (/api/briefs)': text(await call(briefsApi)),
    'RSS feed': text(await call(rssFeed)),
    'Atom feed': text(await call(atomFeed)),
  };
  // The delivery job, an hour later: a reader whose 07:00 UTC has passed.
  db.subscribers = [{ email: READER, timezone: 'UTC' }];
  vi.setSystemTime(new Date(`${TODAY}T11:00:00Z`));
  const before = sent.length;
  await call(deliverBriefs, cron);
  const batch = sent.slice(before).filter((s) => s.url === RESEND_BATCH_URL);
  expect(batch).toHaveLength(1);
  const [email] = JSON.parse(batch[0].body) as Array<{ to: string[]; subject: string; html: string; text: string }>;
  expect(email.to).toEqual([READER]);
  out['email subject'] = email.subject;
  out['email HTML'] = email.html;
  out['email plain text'] = email.text;
  return out;
}

const rowText = () => JSON.stringify(db.row);
const containsAnyMarker = (s: string) => MARKERS.some((m) => s.includes(m));
/** Every outbound payload except the model request and the operator email. */
const nonOperatorPayloads = () => sent.filter((s) => s.url !== MODEL_URL && !isOperatorEmail(s));

// ---------------------------------------------------------------------------

beforeEach(() => {
  db.row = null;
  db.queries = [];
  db.dryRuns = [];
  db.failDryRunInsert = false;
  db.subscribers = [];
  db.claims = new Set();
  db.alerts = new Map();
  db.deliveryLog = [];
  sent = [];
  net.resendEmailStatus = 200;
  net.resendEmailThrows = false;
  fetchStub.mockClear();
  vi.mocked(recordAnthropicSpend).mockClear();
  vi.stubGlobal('fetch', fetchStub);
  vi.useFakeTimers({ toFake: ['Date'] });
  const env: Record<string, string | undefined> = {
    CRON_SECRET: 'test-secret',
    DATABASE_URL: 'postgres://synthetic.invalid/none',
    ANTHROPIC_API_KEY: 'synthetic-anthropic-key',
    BRIEF_MODEL: undefined,
    BRIEF_MODEL_MODE: undefined,
    BEEHIIV_API_KEY: 'synthetic-beehiiv-key',
    BEEHIIV_PUBLICATION_ID: BEEHIIV_GOOD_ID,
    BEEHIIV_PUB_ID: undefined,
    RESEND_API_KEY: 'synthetic-resend-key',
    ADMIN_EMAILS: ADMIN,
    DISCORD_APPROVAL_WEBHOOK_URL: undefined,
    DISCORD_APPROVAL_ENABLED: undefined,
    NOTION_API_KEY: undefined,
    TWELVEDATA_API_KEY: undefined,
    DISABLE_LLM_USER_FACING: undefined,
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

const content = () => db.row!.content as { edition?: string; subject?: string; briefText?: string };

// ---------------------------------------------------------------------------

describe('1. mode unset, the draft clears every gate: readers get the mechanical edition', () => {
  it('archives the mechanical edition, sends nothing to beehiiv, and records one dry run', async () => {
    const out = await runBrief();
    expect(out.status).toBe(200);
    expect((out.body as { ai: string }).ai).toBe('dry-run');

    expect(content().edition).toBe('mechanical');
    expect(content().subject).toBe(`The Ledger, unchanged — mechanical edition, ${TODAY}`);
    expect(content().briefText).toContain(
      `This is the mechanical edition: ${DRY_RUN_CLAUSE}, so today carries data without narrative.`,
    );
    for (const field of [db.row!.contentText, db.row!.summary, db.row!.email_html, db.row!.plain_text]) {
      expect(field).toBeTruthy();
      for (const m of MARKERS) expect(field).not.toContain(m);
    }

    expect(beehiivTraffic()).toEqual([]);

    expect(db.dryRuns).toHaveLength(1);
    const r = db.dryRuns[0];
    expect(r).toMatchObject({
      brief_date: TODAY,
      model: 'claude-sonnet-5-5',
      would_have_shipped: true,
      stop_reason: 'end_turn',
      grounding_verdict: 'pass',
      structure_verdict: 'pass',
      claims_verdict: 'pass',
      input_tokens: 15000,
      output_tokens: 2100,
      cache_read_input_tokens: 0,
    });
    expect(String(r.outcome)).toMatch(/^ai-success/);
    expect(r.draft_subject).toBe(`A dry run ${SUBJECT_MARKER} subject for a test day`);
    // Exactly as the model wrote it, SUBJECT line included.
    expect(r.draft_text).toBe(DRAFTS.passing);
  });
});

describe('2. mode `live`: the draft ships, as the series behaves now', () => {
  it('archives the model edition under its declared subject, writes no dry-run row and sends no dry-run mail', async () => {
    vi.stubEnv('BRIEF_MODEL_MODE', 'live');
    const out = await runBrief();
    expect((out.body as { ai: string }).ai).toMatch(/^ai-success/);
    expect(content().edition).toBe('model');
    expect(content().subject).toBe(`A dry run ${SUBJECT_MARKER} subject for a test day`);
    expect(content().briefText).toContain(BODY_MARKER);
    expect(db.queries.some((q) => q.text.includes('brief_dry_runs'))).toBe(false);
    expect(sent.some((s) => s.body.includes('DRY RUN'))).toBe(false);
  });
});

describe('3. anything but exactly `live` is a dry run', () => {
  it.each(['', 'LIVE ', 'LIVE', 'Live', ' live', 'live ', 'true', '1', 'yes', 'dry-run'])('%j', async (value) => {
    vi.stubEnv('BRIEF_MODEL_MODE', value);
    await runBrief();
    expect(content().edition).toBe('mechanical');
    expect(containsAnyMarker(rowText())).toBe(false);
    expect(db.dryRuns).toHaveLength(1);
    expect(db.dryRuns[0].would_have_shipped).toBe(true);
  });
});

describe('4. a gate refuses the draft in dry-run mode: the existing true cause, and the row says which gate and why', () => {
  const cases = [
    ['grounding', DRAFTS.grounding, /^grounding-failed: /, 'grounding_verdict', 'grounding_reason', /4\/4 unsupported/],
    [
      'structure',
      DRAFTS.structure,
      /^structure-failed: /,
      'structure_verdict',
      'structure_reason',
      /missing=\[the long fuse\]/,
    ],
    ['claim', DRAFTS.claims, /^comparative-claim-failed: /, 'claims_verdict', 'claims_reason', /"5 network blocks"/],
  ] as const;

  it.each(cases)('%s gate', async (_, text, label, verdictCol, reasonCol, reason) => {
    // The same draft with the mode live: what readers get today.
    vi.stubEnv('BRIEF_MODEL_MODE', 'live');
    const live = await runBrief(text);
    const liveRow = rowText();
    expect(beehiivTraffic()).toEqual([]);
    const liveAlerts = to(RESEND_URL).map((s) => String(parsed(s).subject));

    db.row = null;
    db.queries = [];
    sent = [];
    vi.stubEnv('BRIEF_MODEL_MODE', undefined as unknown as string);
    const dry = await runBrief(text);

    // Readers: byte-identical to the live-mode run, with the gate wording.
    expect((dry.body as { ai: string }).ai).toBe((live.body as { ai: string }).ai);
    expect((dry.body as { ai: string }).ai).toMatch(label);
    expect(rowText()).toBe(liveRow);
    expect(content().edition).toBe('mechanical');
    expect(content().briefText).toContain('the model draft was withheld by a publish gate');
    expect(beehiivTraffic()).toEqual([]);

    // The record: which gate, and why.
    expect(db.dryRuns).toHaveLength(1);
    const r = db.dryRuns[0];
    expect(r.would_have_shipped).toBe(false);
    expect(String(r.outcome)).toMatch(label);
    expect(r[verdictCol]).toBe('refused');
    expect(String(r[reasonCol])).toMatch(reason);
    expect(String(r.draft_text)).toContain(BODY_MARKER);

    // The alarm: live raises the mechanical-edition warning; the dry run
    // replaces it with DRY RUN and the verdicts, and mails the draft to the operator.
    expect(liveAlerts).toContain(
      `[WARNING] The brief shipped as the mechanical edition (${(live.body as { ai: string }).ai.split(':')[0]})`,
    );
    const dryAlerts = to(RESEND_URL)
      .filter((s) => !isOperatorEmail(s))
      .map((s) => parsed(s));
    expect(dryAlerts.map((a) => a.subject)).toEqual([`[INFO] DRY RUN ${TODAY}`]);
    expect(String(dryAlerts[0].text)).toContain(
      `${verdictCol === 'claims_verdict' ? 'Claim' : verdictCol === 'grounding_verdict' ? 'Grounding' : 'Structure'} gate: refused`,
    );
    expect(sent.filter(isOperatorEmail)).toHaveLength(1);
    for (const s of nonOperatorPayloads()) expect(containsAnyMarker(s.body)).toBe(false);
  });
});

describe('5. the dry-run store fails: the run completes as a mechanical day', () => {
  it('archives the mechanical edition, raises an alert without the draft, and stores nothing of it publicly', async () => {
    db.failDryRunInsert = true;
    const out = await runBrief();
    expect(out.status).toBe(200);
    expect((out.body as { success: boolean }).success).toBe(true);
    expect(content().edition).toBe('mechanical');
    expect(containsAnyMarker(rowText())).toBe(false);
    expect(db.dryRuns).toHaveLength(0);

    const alerts = to(RESEND_URL)
      .filter((s) => !isOperatorEmail(s))
      .map((s) => String(parsed(s).subject));
    expect(alerts).toContain(`[WARNING] Dry run not stored: ${TODAY}`);
    expect(alerts).toContain(`[INFO] DRY RUN ${TODAY}`);
    for (const s of nonOperatorPayloads()) expect(containsAnyMarker(s.body)).toBe(false);
    // The operator still gets the draft, told it was not stored.
    const op = sent.filter(isOperatorEmail);
    expect(op).toHaveLength(1);
    expect(String(parsed(op[0]).text)).toContain('Stored in brief_dry_runs: NO');
  });
});

describe('6. a marker in the draft subject and body reaches no reader surface', () => {
  it('guard: with the mode live, the same harness finds the markers on the surfaces', async () => {
    vi.stubEnv('BRIEF_MODEL_MODE', 'live');
    await runBrief();
    const s = await readerSurfaces();
    for (const name of [
      'public JSON for the date (/api/v1/brief?date)',
      'brief page (/brief/:date)',
      'RSS feed',
      'Atom feed',
      'email HTML',
      'email plain text',
    ]) {
      expect(s[name], name).toContain(BODY_MARKER);
    }
    expect(s['email subject']).toContain(SUBJECT_MARKER);
    expect(s['archive list (/api/briefs)']).toContain(SUBJECT_MARKER);
  });

  it('dry run: in no field of daily_briefs, the brief page, the public JSON, either feed or the email', async () => {
    await runBrief();
    for (const m of MARKERS) expect(rowText()).not.toContain(m);
    const s = await readerSurfaces();
    expect(Object.keys(s)).toHaveLength(10);
    for (const [name, text] of Object.entries(s)) {
      expect(text.length, name).toBeGreaterThan(0);
      for (const m of MARKERS) expect(text, `${name} carries ${m}`).not.toContain(m);
    }
    expect(beehiivTraffic()).toEqual([]);
    expect(s['email subject']).toBe(`The Ledger, unchanged — mechanical edition, ${TODAY} — The NexusWatch Brief`);
  });
});

describe('7. the delivery job on a dry-run day', () => {
  it('sends the mechanical edition with its masthead line', async () => {
    await runBrief();
    const s = await readerSurfaces();
    expect(s['email HTML']).toContain(MECHANICAL_EDITION_LINE);
    expect(s['email plain text']).toContain(MECHANICAL_EDITION_LINE);
    expect(s['email plain text']).toContain(DRY_RUN_CLAUSE);
  });
});

describe('8. the operator email goes only to ADMIN_EMAILS; Discord sees no draft', () => {
  it('with a Discord webhook set, no Discord payload carries the draft; the email says DRY RUN', async () => {
    vi.stubEnv('DISCORD_APPROVAL_WEBHOOK_URL', WEBHOOK);
    db.subscribers = [{ email: READER, timezone: 'UTC' }];
    await runBrief();

    const discord = to(WEBHOOK);
    expect(discord.length).toBeGreaterThan(0);
    for (const d of discord) for (const m of MARKERS) expect(d.body).not.toContain(m);
    // The general alert went to Discord: the date, the verdicts, DRY RUN.
    const general = discord.map((d) => String(parsed(d).content)).filter((c) => c.includes('DRY RUN'));
    expect(general).toHaveLength(1);
    expect(general[0]).toContain(`DRY RUN ${TODAY}`);
    expect(general[0]).toContain('Grounding gate: pass');

    const op = sent.filter(isOperatorEmail);
    expect(op).toHaveLength(1);
    const mail = parsed(op[0]);
    expect(mail.to).toEqual([ADMIN]);
    expect(mail.subject).toBe(`[INFO] DRY RUN, not sent to readers: ${TODAY}`);
    expect(String(mail.text)).toContain('DRY RUN, not sent to readers.');
    for (const m of MARKERS) expect(String(mail.text)).toContain(m);

    // The brief job sends nothing to subscribers itself; delivery is separate.
    expect(to(RESEND_BATCH_URL)).toHaveLength(0);
    for (const s of nonOperatorPayloads()) expect(containsAnyMarker(s.body)).toBe(false);
  });
});

describe('9. no new place calls the model', () => {
  it('exactly one model request and one spend record per run, dry run or live', async () => {
    await runBrief();
    expect(to(MODEL_URL)).toHaveLength(1);
    expect(recordAnthropicSpend).toHaveBeenCalledTimes(1);
    sent = [];
    db.row = null;
    vi.mocked(recordAnthropicSpend).mockClear();
    vi.stubEnv('BRIEF_MODEL_MODE', 'live');
    await runBrief();
    expect(to(MODEL_URL)).toHaveLength(1);
    expect(recordAnthropicSpend).toHaveBeenCalledTimes(1);
  });

  it('the dry-run module holds no model host and makes no request of its own', () => {
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const mod = strip(readFileSync(join(process.cwd(), 'api/_lib/brief-dry-run.ts'), 'utf8'));
    expect(mod).not.toContain('anthropic.com');
    expect(mod).not.toMatch(/\bfetch\(/);
    const handler = strip(readFileSync(join(process.cwd(), 'api/cron/daily-brief.ts'), 'utf8'));
    expect(handler.split('api.anthropic.com').length - 1).toBe(1);
  });
});

describe('fail safe: when the model call fails, behaviour is exactly as today, and the attempt is recorded', () => {
  const failures = [
    [
      'HTTP 400 (credit)',
      () => (net.model = { status: 400, body: { error: { message: 'synthetic credit too low' } } }),
    ],
    ['cut off at max_tokens', () => (net.model = { status: 200, body: modelReply(DRAFTS.passing, 'max_tokens') })],
  ] as const;

  it.each(failures)('%s', async (_, fail) => {
    const run = async () => {
      fail();
      vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
      return call(dailyBrief, { ...cron, method: 'POST' });
    };
    vi.stubEnv('BRIEF_MODEL_MODE', 'live');
    const live = await run();
    const liveRow = rowText();
    const liveOut = sent.filter((s) => s.url !== MODEL_URL).map((s) => s.body);

    // A fresh morning for the comparison: the same keyed alarm at the same
    // instant would otherwise be (rightly) deduplicated.
    db.row = null;
    db.alerts = new Map();
    sent = [];
    vi.stubEnv('BRIEF_MODEL_MODE', undefined as unknown as string);
    const dry = await run();

    expect(dry.body).toEqual(live.body);
    expect(rowText()).toBe(liveRow);
    expect(content().briefText).toContain('no model draft was produced today');
    // Every outbound payload (the critical alert) is the same; no operator
    // email, no DRY RUN alert: there was no draft.
    expect(sent.filter((s) => s.url !== MODEL_URL).map((s) => s.body)).toEqual(liveOut);
    expect(to(RESEND_URL).map((s) => String(parsed(s).subject))).toEqual([
      expect.stringMatching(/^\[CRITICAL\] The brief shipped as the mechanical edition/),
    ]);

    expect(db.dryRuns).toHaveLength(1);
    expect(db.dryRuns[0]).toMatchObject({
      would_have_shipped: false,
      grounding_verdict: 'not-run',
      structure_verdict: 'not-run',
      claims_verdict: 'not-run',
      draft_text: null,
    });
    expect(String(db.dryRuns[0].outcome)).toBe(String((dry.body as { ai: string }).ai));
  });
});

describe('fail safe: the operator email fails', () => {
  it.each([
    ['Resend refuses', () => (net.resendEmailStatus = 500)],
    ['the request throws', () => (net.resendEmailThrows = true)],
  ])('%s: the run completes and readers get the mechanical edition', async (_, fail) => {
    fail();
    const out = await runBrief();
    expect(out.status).toBe(200);
    expect(content().edition).toBe('mechanical');
    expect(containsAnyMarker(rowText())).toBe(false);
    expect(db.dryRuns).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Review 6 (REVIEW-6.md, DRY-RUN), should-fix 1 and 2.
// ---------------------------------------------------------------------------

const subjects = (mail: Record<string, unknown>[]) => mail.map((m) => String(m.subject));
/** Alert mail (not the operator email) sent since `before`. */
const alertMailSince = (before: number) =>
  sent
    .slice(before)
    .filter((s) => s.url === RESEND_URL && !isOperatorEmail(s))
    .map(parsed);

describe('review 6, should-fix 1: a reply that is only a SUBJECT line', () => {
  it('is exactly as today, is recorded as written, and sends no operator email', async () => {
    const subjectOnly = `SUBJECT: A dry run ${SUBJECT_MARKER} subject for a test day`;
    vi.stubEnv('BRIEF_MODEL_MODE', 'live');
    const live = await runBrief(subjectOnly);
    const liveRow = rowText();
    const liveOut = sent.filter((s) => s.url !== MODEL_URL).map((s) => s.body);

    db.row = null;
    db.alerts = new Map();
    sent = [];
    vi.stubEnv('BRIEF_MODEL_MODE', undefined as unknown as string);
    const dry = await runBrief(subjectOnly);

    expect((dry.body as { ai: string }).ai).toBe('ai-empty-response');
    expect(dry.body).toEqual(live.body);
    expect(rowText()).toBe(liveRow);
    expect(containsAnyMarker(rowText())).toBe(false);
    expect(sent.filter((s) => s.url !== MODEL_URL).map((s) => s.body)).toEqual(liveOut);
    expect(sent.filter(isOperatorEmail)).toHaveLength(0);
    expect(subjects(alertMailSince(0))).toEqual([
      '[CRITICAL] The brief shipped as the mechanical edition (ai-empty-response)',
    ]);
    expect(db.dryRuns).toHaveLength(1);
    expect(db.dryRuns[0]).toMatchObject({
      outcome: 'ai-empty-response',
      would_have_shipped: false,
      grounding_verdict: 'not-run',
      structure_verdict: 'not-run',
      claims_verdict: 'not-run',
      draft_text: subjectOnly,
    });
  });
});

describe('review 6, should-fix 2: an earlier mechanical-edition alarm is stood down', () => {
  const creditFailure = { status: 400, body: { error: { message: 'synthetic credit too low' } } };
  const day = async (date: string, model: { status: number; body: unknown }) => {
    db.row = null;
    net.model = model;
    vi.setSystemTime(new Date(`${date}T10:00:00Z`));
    const before = sent.length;
    await call(dailyBrief, { ...cron, method: 'POST' });
    return alertMailSince(before);
  };
  const ok = { status: 200, body: modelReply(DRAFTS.passing) };
  const refused = { status: 200, body: modelReply(DRAFTS.structure) };

  it.each([
    ['a dry-run day', undefined, `2026-11-24: dry run. The model wrote a draft and it cleared every gate`],
    ['a live model day (unchanged)', 'live', `2026-11-24: the model wrote today's issue and it cleared every gate.`],
  ])('%s whose draft cleared every gate sends the all-clear', async (_, mode, note) => {
    // Day 1: credit fails. The keyed alarm is raised.
    vi.stubEnv('BRIEF_MODEL_MODE', undefined as unknown as string);
    expect(subjects(await day('2026-11-23', creditFailure))).toEqual([
      '[CRITICAL] The brief shipped as the mechanical edition (ai-failed)',
    ]);
    expect(db.alerts.has('brief:fallback')).toBe(true);

    // Day 2: the draft clears every gate.
    vi.stubEnv('BRIEF_MODEL_MODE', mode as string);
    const mail = await day('2026-11-24', ok);
    const resolved = mail.filter((m) => String(m.subject).includes('RESOLVED'));
    expect(subjects(resolved)).toEqual([
      '[WARNING] RESOLVED — The brief shipped as the mechanical edition (ai-failed)',
    ]);
    expect(String(resolved[0].text)).toContain(note);
    expect(String(resolved[0].text)).toContain('It lasted about 24h.');
    expect(db.alerts.has('brief:fallback')).toBe(false);
    for (const m of mail) expect(containsAnyMarker(JSON.stringify(m))).toBe(false);

    // Day 3: credit fails again. A new outage, not the old one "ongoing".
    vi.stubEnv('BRIEF_MODEL_MODE', undefined as unknown as string);
    const again = await day('2026-11-25', creditFailure);
    expect(subjects(again)).toEqual(['[CRITICAL] The brief shipped as the mechanical edition (ai-failed)']);
    expect(String(again[0].text)).not.toContain('Ongoing for about');
  });

  it('a dry-run day whose draft a gate refused clears nothing (as on a live day), so the old alarm stays open', async () => {
    await day('2026-11-23', creditFailure);
    const mail = await day('2026-11-24', refused);
    expect(subjects(mail)).toEqual(['[INFO] DRY RUN 2026-11-24']);
    expect(db.alerts.has('brief:fallback')).toBe(true);
    // The harness does see a stale condition: the next failure reports it.
    const again = await day('2026-11-25', creditFailure);
    expect(String(again[0].text)).toContain('Ongoing for about 48h');
  });
});

// ---------------------------------------------------------------------------
// beehiiv is retired (RETIRE-BEEHIIV). Every brief path, with its old settings
// still present: nothing is sent to beehiiv, nothing about it is written or
// alerted, and the archive and the delivery still happen.
// ---------------------------------------------------------------------------

describe('beehiiv is retired: no brief path sends to it or alerts about it', () => {
  const credit = { status: 400, body: { error: { message: 'synthetic credit too low' } } };
  const productionShaped = { BEEHIIV_PUBLICATION_ID: undefined, BEEHIIV_PUB_ID: BEEHIIV_MALFORMED_ID };
  const cases: Array<
    [string, string | undefined, { status: number; body: unknown }, Record<string, string | undefined>]
  > = [
    ['dry run, the draft clears every gate', undefined, { status: 200, body: modelReply(DRAFTS.passing) }, {}],
    ['live, the draft ships', 'live', { status: 200, body: modelReply(DRAFTS.passing) }, {}],
    ['live, a gate refuses the draft', 'live', { status: 200, body: modelReply(DRAFTS.structure) }, {}],
    ['live, the model call fails', 'live', credit, {}],
    [
      'live, the malformed id production holds today',
      'live',
      { status: 200, body: modelReply(DRAFTS.passing) },
      productionShaped,
    ],
    ['dry run, the malformed id production holds today', undefined, credit, productionShaped],
  ];

  it.each(cases)('%s', async (_, mode, model, env) => {
    vi.stubEnv('BRIEF_MODEL_MODE', mode as string);
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
    net.model = model;
    vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
    const out = await call(dailyBrief, { ...cron, method: 'POST' });
    expect(out.status).toBe(200);

    // The delivery job, an hour later: the reader still gets today's brief.
    db.subscribers = [{ email: READER, timezone: 'UTC' }];
    vi.setSystemTime(new Date(`${TODAY}T11:00:00Z`));
    await call(deliverBriefs, cron);
    expect(to(RESEND_BATCH_URL)).toHaveLength(1);
    expect(db.row!.summary.length).toBeGreaterThan(0);

    // No request to a beehiiv host, and no alert or other payload about it.
    expect(beehiivTraffic()).toEqual([]);
    // No delivery-log row, alert_state row or any other statement names it.
    expect(JSON.stringify(db.queries)).not.toMatch(/beehiiv/i);
    expect([...db.alerts.keys()].filter((k) => /beehiiv/i.test(k))).toEqual([]);
  });
});

describe('beehiiv is retired: its frozen failure streak in the log never pages', () => {
  /** N consecutive failed days for a channel, ending the day before TODAY. */
  const failedDays = (channel: string, days: number, error: string) =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date('2026-11-22T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - (days - 1 - i));
      return { channel, brief_date: d.toISOString().slice(0, 10), status: 'failed', error };
    });
  const streakMail = () =>
    to(RESEND_URL)
      .map(parsed)
      .filter((m) => String(m.subject).startsWith('NexusWatch: '));

  it('199 failed beehiiv days (a repeat boundary) are in the log: no alert names beehiiv', async () => {
    db.deliveryLog = failedDays('beehiiv', 199, 'beehiiv 400: publicationid pattern does not match');
    vi.stubEnv('BRIEF_MODEL_MODE', 'live');
    const out = await runBrief();
    expect(out.status).toBe(200);
    expect(streakMail()).toEqual([]);
    expect(beehiivTraffic()).toEqual([]);
  });

  it('guard: the same frozen streak on a live channel does page, so the check really ran', async () => {
    db.deliveryLog = failedDays('notion', 199, 'notion page create 401: unauthorized');
    vi.stubEnv('BRIEF_MODEL_MODE', 'live');
    await runBrief();
    expect(streakMail().map((m) => m.subject)).toEqual(['NexusWatch: notion delivery has failed 199 days running']);
  });
});
