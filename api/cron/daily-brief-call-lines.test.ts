import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * THE CALL LINES ARE READ WHETHER OR NOT A MODEL KEY IS SET.
 *
 * 23 Nov 2026 was the first day production ran with no ANTHROPIC_API_KEY. The
 * open-call and resolved-call reads sat inside the key-only branch, so the
 * mechanical edition printed "No open calls today." over a book of hundreds
 * (the Ledger line spliced above it gave the real count), and the day's
 * resolutions were silently dropped.
 *
 * The real handler runs against a fake database and a stubbed fetch, as in
 * daily-brief-dry-run.test.ts. Hermetic: no network, no model call, no
 * database, synthetic keys. The clock is pinned to Monday 2026-11-23 10:00Z.
 */

const TODAY = '2026-11-23';
const SUNDAY = '2026-11-22';
const MODEL_URL = 'https://api.anthropic.com/v1/messages';
const OPEN_CALLS_QUERY = "WHERE status = 'pending' AND base_rate IS NOT NULL";

// ---------------------------------------------------------------------------
// Fixtures: the rows the database would return, in the order it returns them.
// ---------------------------------------------------------------------------

const CII_ROWS = [
  {
    country_code: 'IR',
    country_name: 'Iran',
    score: 70,
    deviation: 4,
    components: { conflict: 14, disasters: 1, governance: 9, marketExposure: 6, infrastructure: 3 },
  },
];

const OPEN_ROWS = [
  { kind: 'censorship_event', country_code: 'IR', p: 0.62, base: 0.44, resolves_on: '2026-12-01', threshold_pct: null },
  { kind: 'fx_devaluation', country_code: 'UG', p: 0.38, base: 0.25, resolves_on: '2026-12-05', threshold_pct: 3 },
  { kind: 'some_future_kind', country_code: 'KZ', p: 0.2, base: 0.2, resolves_on: '2026-12-09', threshold_pct: null },
];

const RESOLVED_ROWS = [
  {
    kind: 'fx_devaluation',
    country_code: 'UG',
    probability: 0.4,
    base_rate: 0.3,
    status: 'miss',
    resolves_on: '2026-11-23',
    evidence_count: null,
    corrected_status: null,
  },
  {
    kind: 'censorship_event',
    country_code: 'KZ',
    probability: 0.16,
    base_rate: 0.1,
    status: 'hit',
    resolves_on: '2026-11-23',
    evidence_count: 2,
    corrected_status: null,
  },
];

/**
 * What the prompt's OUR OPEN CALLS section says when the open-call read failed. Before rel4 it said
 * "No open calls.", the same words as a book read and found empty, so the model could write the false
 * "No open calls today." The words are pinned here; a successful read never carries them.
 */
const OPEN_CALLS_UNREAD =
  'Open calls could not be read today. Make no statement about open calls: do not say there are none, do not ' +
  'describe any, and do not write "No open calls today." or "No calls on the book this week."';

/**
 * What the prompt's RESOLVED CALLS section says when the resolved-call reads failed (or never ran, because
 * the open-call read before them failed). Before rel4 it said "No calls resolved today." (Sunday: "No calls
 * resolved this week."), the words of a window read and found empty.
 */
const RESOLVED_CALLS_UNREAD =
  'Resolved calls could not be read today. Make no statement about resolved calls: do not say none resolved, ' +
  'do not describe any, and do not write "No calls resolved today." or "No calls on the book this week."';

/** The lines these fixtures produce: worked by hand from the formatters. */
const TOP_OPEN_LINE =
  'Iran (IR): 62% chance of a confirmed censorship event by 2026-12-01 — +18pts vs its base rate of 44%';
const OPEN_LINES = [
  TOP_OPEN_LINE,
  'UG (UG): 38% chance the currency depreciates ≥3% peak-vs-issue by 2026-12-05 — +13pts vs its base rate of 25%',
  'KZ (KZ): 20% chance of the outcome it names, against its declared external source, by 2026-12-09 — in line with its base rate',
];
const RESOLVED_LINES = [
  '3 calls settled today against external ground truth: 1 hit, 2 miss.',
  'UG (UG): MISS — we said 40% (base rate 30%) for currency depreciation by 2026-11-23',
  'KZ (KZ): HIT — we said 16% (base rate 10%) for a confirmed censorship event by 2026-11-23 — OONI confirmed blocking on 2 days in the window',
  '…and 1 more, listed in full on the ledger.',
];

// ---------------------------------------------------------------------------
// Fake database
// ---------------------------------------------------------------------------

/**
 * The mechanical edition's own record (gatherRecord, plan R1): today's
 * resolutions with their call ids, and the open book. Read by separate queries
 * from the prompt's, so each side can fail on its own.
 */
const RECORD_RESOLVED = RESOLVED_ROWS.map((r, i) => ({
  id: 7001 + i,
  claim: `${r.country_code} claim, frozen at issue.`,
  threshold: 1,
  threshold_pct: r.kind === 'fx_devaluation' ? 2.5 : null,
  made_on: '2026-11-09',
  ...r,
}));
const RECORD_NEXT = [
  {
    id: 7101,
    kind: 'fx_devaluation',
    country_code: 'UG',
    claim: 'UGX depreciates 3.00% or more against USD at any point within 14 days, from 3700.00.',
    probability: 0.38,
    base_rate: 0.25,
    threshold: 1,
    threshold_pct: 3,
    made_on: '2026-11-10',
    resolves_on: '2026-11-24',
    status: 'pending',
    evidence_count: null,
    corrected_status: null,
  },
];

const db = {
  open: OPEN_ROWS as unknown[],
  resolved: RESOLVED_ROWS as unknown[],
  totals: { total: 3, hits: 1 },
  failOpenQuery: false,
  failResolvedQuery: false,
  recordPage: RECORD_RESOLVED as unknown[],
  recordTotals: { total: 3, hits: 1 },
  recordOpen: { open_total: 3, held: 0 },
  recordNext: RECORD_NEXT as unknown[],
  failRecordResolved: false,
  failRecordOpen: false,
  recordQueries: [] as string[],
  archived: null as {
    briefText?: string;
    openCallLines?: string[];
    resolvedCallLines?: string[];
    record?: unknown;
  } | null,
  claimed: false,
};

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

async function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
  const text = norm(strings.join('$?'));

  if (text.startsWith('INSERT INTO daily_briefs')) {
    if (db.claimed) return [];
    db.claimed = true;
    return [{ brief_date: values[0] }];
  }
  if (text.startsWith('UPDATE daily_briefs SET content = $?, summary = $?')) {
    db.archived = JSON.parse(values[0] as string) as typeof db.archived;
    return [];
  }

  // CII, so names resolve (Iran) and the map reaches the call lines.
  if (text.startsWith('SELECT DISTINCT ON (country_code) country_code, country_name, score, components')) {
    return CII_ROWS;
  }

  // The mechanical edition's record: today's resolutions (the calendar day, every
  // day of the week) and the open book.
  if (
    text.includes('resolved_at::date = CURRENT_DATE') &&
    /^SELECT (COUNT\(\*\)::int AS total|c\.id::int AS id|c\.status, cc\.corrected_status)/.test(text)
  ) {
    db.recordQueries.push(text);
    if (db.failRecordResolved) throw new Error("synthetic: the record's resolved read is unavailable");
    if (text.startsWith('SELECT COUNT(*)::int AS total')) return [db.recordTotals];
    if (text.startsWith('SELECT c.id::int AS id')) return db.recordPage;
    return [];
  }
  if (
    text.startsWith('SELECT COUNT(*)::int AS open_total') ||
    (text.startsWith('SELECT c.id::int AS id') && text.includes("c.status = 'pending'"))
  ) {
    db.recordQueries.push(text);
    if (db.failRecordOpen) throw new Error("synthetic: the record's open read is unavailable");
    return text.startsWith('SELECT COUNT') ? [db.recordOpen] : db.recordNext;
  }

  // The open book (the prompt's lines).
  if (text.includes('FROM calls') && text.includes(OPEN_CALLS_QUERY)) {
    if (db.failOpenQuery) throw new Error('synthetic: relation "calls" is unavailable');
    return db.open;
  }
  // Resolved in the window: totals, the page, the window's corrections.
  if (
    text.startsWith("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'hit')::int AS hits FROM calls")
  ) {
    if (db.failResolvedQuery) throw new Error('synthetic: the resolved-call read is unavailable');
    return [db.totals];
  }
  if (text.startsWith('SELECT c.kind, c.country_code, c.probability::float AS probability')) return db.resolved;
  if (text.startsWith('SELECT c.status, cc.corrected_status FROM calls c JOIN')) return [];
  if (text.startsWith('SELECT COUNT(*)::int AS n FROM calls')) return [{ n: 0 }];

  // The Ledger line's open count: the real book, whatever the lines say.
  if (text.startsWith('SELECT COUNT(*)::int AS n, (MIN(resolves_on)')) {
    return [{ n: db.open.length, next_resolves: '2026-12-01' }];
  }

  // Everything else (OONI, sanctions, ledger history, alerts, logs): empty.
  return [];
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));
vi.mock('../_lib/llm-budget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/llm-budget.js')>()),
  checkBudget: vi.fn(async () => ({ ok: true, spend_today: 0, cap: 9 })),
  recordAnthropicSpend: vi.fn(async () => undefined),
}));

const { default: dailyBrief } = await import('./daily-brief.js');

// ---------------------------------------------------------------------------
// Stubbed network: the model answers 500, every feed is unavailable.
// ---------------------------------------------------------------------------

let modelRequests: string[] = [];
const fetchStub = vi.fn(async (input: unknown, init?: { body?: unknown }) => {
  const url = String(input);
  if (url === MODEL_URL) {
    modelRequests.push(typeof init?.body === 'string' ? init.body : '');
    return new Response('synthetic outage', { status: 500 });
  }
  return new Response('not found', { status: 404 });
});

async function runBrief(day = TODAY): Promise<{ status: number; body: { ai?: string } }> {
  const out = { status: 200, body: {} as { ai?: string } };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(b: unknown) {
      out.body = b as { ai?: string };
      return res;
    },
    send() {
      return res;
    },
    setHeader() {
      return res;
    },
    end() {
      return res;
    },
  };
  vi.setSystemTime(new Date(`${day}T10:00:00Z`));
  await dailyBrief(
    { method: 'POST', headers: { authorization: 'Bearer test-secret' }, query: {} } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return out;
}

/** The text of one `=== HEADER ===` section of the model's data context. */
function promptSection(prompt: string, header: string): string {
  const start = prompt.indexOf(`=== ${header}`);
  expect(start).toBeGreaterThan(-1);
  const body = prompt.indexOf('\n', start) + 1;
  return prompt.slice(body, prompt.indexOf('\n\n===', body));
}

const modelPrompt = () => {
  expect(modelRequests).toHaveLength(1);
  return (JSON.parse(modelRequests[0]) as { messages: Array<{ content: string }> }).messages[0].content;
};

const mechanicalText = () => {
  expect(db.archived?.briefText).toBeTruthy();
  return db.archived!.briefText!;
};

beforeEach(() => {
  db.open = OPEN_ROWS;
  db.resolved = RESOLVED_ROWS;
  db.totals = { total: 3, hits: 1 };
  db.failOpenQuery = false;
  db.failResolvedQuery = false;
  db.recordPage = RECORD_RESOLVED;
  db.recordTotals = { total: 3, hits: 1 };
  db.recordOpen = { open_total: 3, held: 0 };
  db.recordNext = RECORD_NEXT;
  db.failRecordResolved = false;
  db.failRecordOpen = false;
  db.recordQueries = [];
  db.archived = null;
  db.claimed = false;
  modelRequests = [];
  fetchStub.mockClear();
  vi.stubGlobal('fetch', fetchStub);
  vi.useFakeTimers({ toFake: ['Date'] });
  const env: Record<string, string | undefined> = {
    CRON_SECRET: 'test-secret',
    DATABASE_URL: 'postgres://synthetic.invalid/none',
    ANTHROPIC_API_KEY: undefined,
    BRIEF_MODEL: undefined,
    BRIEF_MODEL_MODE: undefined,
    RESEND_API_KEY: undefined,
    ADMIN_EMAILS: undefined,
    DISCORD_APPROVAL_WEBHOOK_URL: undefined,
    NOTION_API_KEY: undefined,
    TWELVEDATA_API_KEY: undefined,
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

/**
 * CHANGED WITH R1 (the record-only edition): the mechanical edition is built
 * from its own record reads (gatherRecord), not from the prompt's lines. What
 * the 23 Nov fix established still holds, on the record's own reads: they run
 * with or without a key, and an unread book or day is never printed as empty.
 */
describe('no model key: the mechanical edition carries the real record', () => {
  const RESOLVED_AGGREGATE = '3 calls settled today against external ground truth: 1 hit, 2 miss.';
  const UG_RESOLVED =
    'UG (UG): MISS — we said 40% (base rate 30%) for currency depreciation of 2.5% or more against USD by 2026-11-23. [Call #7001](https://nexuswatch.dev/call/7001)';
  const KZ_RESOLVED =
    'KZ (KZ): HIT — we said 16% (base rate 10%) for a confirmed censorship event by 2026-11-23 — OONI confirmed blocking on 2 days in the window. [Call #7002](https://nexuswatch.dev/call/7002)';
  const UG_NEXT =
    'UG (UG): we say 38% (base rate 25%) for currency depreciation of 3% or more against USD by 2026-11-24. [Call #7101](https://nexuswatch.dev/call/7101)';

  it('calls exist: what resolved and what is open are printed, linked, never "No open calls today."', async () => {
    const out = await runBrief();
    expect(out.body.ai).toBe('no-api-key');
    expect(modelRequests).toHaveLength(0);

    const text = mechanicalText();
    expect(text).toContain(RESOLVED_AGGREGATE);
    expect(text).toContain(`- ${UG_RESOLVED}`);
    expect(text).toContain(`- ${KZ_RESOLVED}`);
    expect(text).toContain('3 calls are open.');
    expect(text).toContain(`- ${UG_NEXT}`);
    expect(text).not.toContain('No open calls today.');
    // What resolved first, then what is open.
    expect(text.indexOf(RESOLVED_AGGREGATE)).toBeLessThan(text.indexOf('3 calls are open.'));
    // The archive row carries the record the edition was built from, not the prompt's lines.
    expect(db.archived!.record).toMatchObject({ resolved: { read: true, total: 3 }, open: { read: true, total: 3 } });
    expect(db.archived!.openCallLines).toBeUndefined();
    expect(db.archived!.resolvedCallLines).toBeUndefined();
  });

  it('the open reads throw: the edition does not say the book is empty, and the run completes', async () => {
    db.failOpenQuery = true;
    db.failRecordOpen = true;
    const out = await runBrief();
    expect(out.status).toBe(200);
    expect(out.body.ai).toBe('no-api-key');

    const text = mechanicalText();
    expect(text).not.toContain('No open calls today.');
    expect(text).toContain('Open calls could not be read today.');
    expect(text).not.toContain(UG_NEXT);
  });

  it("Sunday: the edition's resolutions are today's, as the Ledger line and the subject count them", async () => {
    await runBrief(SUNDAY);
    const text = mechanicalText();
    expect(text).toContain(RESOLVED_AGGREGATE);
    expect(text).not.toContain('in the last 7 days');
    const resolvedReads = db.recordQueries.filter((q) => q.includes('resolved_at::date'));
    expect(resolvedReads).toHaveLength(3);
    for (const q of resolvedReads) {
      expect(q).toContain('resolved_at::date = CURRENT_DATE');
      expect(q).not.toContain('CURRENT_DATE - ');
    }
  });

  it('the resolved reads throw: the edition says they could not be read, never that none resolved, and keeps the open calls', async () => {
    db.failResolvedQuery = true;
    db.failRecordResolved = true;
    for (const day of [TODAY, SUNDAY]) {
      db.archived = null;
      db.claimed = false;
      const out = await runBrief(day);
      expect(out.status).toBe(200);
      const text = mechanicalText();
      expect(text).toContain('Resolved calls could not be read today.');
      expect(text).not.toMatch(/No calls resolved|settled today|came due/);
      expect(text).toContain(UG_NEXT);
      expect(text).toContain("Why this call: today's resolutions could not be read.");
    }
  });

  it('the open reads throw: what resolved is still printed (the two reads are independent)', async () => {
    db.failOpenQuery = true;
    db.failRecordOpen = true;
    await runBrief();
    const text = mechanicalText();
    expect(text).toContain(RESOLVED_AGGREGATE);
    expect(text).toContain('Open calls could not be read today.');
  });

  it('the reads succeed with zero open calls: "No open calls today." still appears', async () => {
    db.open = [];
    db.recordOpen = { open_total: 0, held: 0 };
    db.recordNext = [];
    await runBrief();
    const text = mechanicalText();
    expect(text).toContain('No open calls today.');
    expect(text).not.toContain('Open calls could not be read today.');
  });

  it('the prompt-side reads failing does not make the edition call anything empty or unread', async () => {
    // The record is read separately: the prompt's failure does not reach it.
    db.failOpenQuery = true;
    db.failResolvedQuery = true;
    await runBrief();
    const text = mechanicalText();
    expect(text).toContain(RESOLVED_AGGREGATE);
    expect(text).toContain(`- ${UG_NEXT}`);
    expect(text).not.toContain('could not be read');
  });
});

describe('model key set: the prompt is handed exactly the call lines it was before', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-anthropic-key');
  });

  it('calls exist: the RESOLVED and OPEN sections are unchanged, byte for byte', async () => {
    await runBrief();
    const prompt = modelPrompt();
    expect(promptSection(prompt, 'RESOLVED CALLS')).toBe(RESOLVED_LINES.join('\n'));
    expect(promptSection(prompt, 'OUR OPEN CALLS')).toBe(OPEN_LINES.join('\n'));
  });

  it('Sunday: the 7-day window and its labels are unchanged', async () => {
    await runBrief(SUNDAY);
    const prompt = modelPrompt();
    expect(promptSection(prompt, 'RESOLVED CALLS')).toBe(
      [RESOLVED_LINES[0].replace('settled today', 'settled in the last 7 days'), ...RESOLVED_LINES.slice(1)].join('\n'),
    );
    expect(promptSection(prompt, 'OUR OPEN CALLS')).toBe(OPEN_LINES.join('\n'));
  });

  it('zero calls: the sections say so, in the words they used before', async () => {
    db.open = [];
    db.resolved = [];
    db.totals = { total: 0, hits: 0 };
    await runBrief();
    const prompt = modelPrompt();
    expect(promptSection(prompt, 'RESOLVED CALLS')).toBe('No calls resolved today.');
    expect(promptSection(prompt, 'OUR OPEN CALLS')).toBe('No open calls.');
  });

  it('the open-call query throws: the prompt says the book could not be read, and to say nothing about it', async () => {
    db.failOpenQuery = true;
    await runBrief();
    const prompt = modelPrompt();
    expect(promptSection(prompt, 'OUR OPEN CALLS')).toBe(OPEN_CALLS_UNREAD);
    expect(prompt).not.toContain('No open calls.');
    // The resolved reads follow the open read in the same try, so they never ran: not an empty window either.
    expect(promptSection(prompt, 'RESOLVED CALLS')).toBe(RESOLVED_CALLS_UNREAD);
    // The words appear only inside the instruction that forbids them.
    expect(prompt.replace(RESOLVED_CALLS_UNREAD, '')).not.toContain('No calls resolved today.');
  });

  it('the resolved-call read throws: its section says it could not be read; the open calls are as before', async () => {
    db.failResolvedQuery = true;
    for (const day of [TODAY, SUNDAY]) {
      db.claimed = false;
      modelRequests = [];
      await runBrief(day);
      const prompt = modelPrompt();
      expect(promptSection(prompt, 'RESOLVED CALLS')).toBe(RESOLVED_CALLS_UNREAD);
      expect(prompt.replace(RESOLVED_CALLS_UNREAD, '')).not.toMatch(/No calls resolved (today|this week)\./);
      expect(promptSection(prompt, 'OUR OPEN CALLS')).toBe(OPEN_LINES.join('\n'));
    }
  });

  it('the resolved-call read throws: every other byte is the request of a window read and found empty', async () => {
    for (const day of [TODAY, SUNDAY]) {
      db.failResolvedQuery = false;
      db.resolved = [];
      db.totals = { total: 0, hits: 0 };
      db.claimed = false;
      modelRequests = [];
      await runBrief(day);
      const readAndEmpty = modelRequests[0];
      db.failResolvedQuery = true;
      db.claimed = false;
      modelRequests = [];
      await runBrief(day);
      const unread = modelRequests[0];
      const asJson = (t: string) => JSON.stringify(t).slice(1, -1);
      expect(unread.split(asJson(RESOLVED_CALLS_UNREAD))).toHaveLength(2);
      const emptyWords = day === SUNDAY ? 'No calls resolved this week.' : 'No calls resolved today.';
      expect(unread.replace(asJson(RESOLVED_CALLS_UNREAD), emptyWords)).toBe(readAndEmpty);
    }
  });

  it('the open-call query throws: every other byte of the request is the read-and-empty request', async () => {
    db.open = [];
    db.resolved = [];
    db.totals = { total: 0, hits: 0 };
    await runBrief();
    const readAndEmpty = modelRequests[0];
    modelRequests = [];
    db.claimed = false; // a second run on the same day must be able to claim the edition again
    db.failOpenQuery = true;
    await runBrief();
    const unread = modelRequests[0];
    expect(unread).not.toBe(readAndEmpty);
    // Request bodies are JSON, so the sentence appears there JSON-escaped.
    const asJson = (s: string) => JSON.stringify(s).slice(1, -1);
    expect(unread.split(asJson(OPEN_CALLS_UNREAD))).toHaveLength(2);
    expect(
      unread
        .replace(asJson(OPEN_CALLS_UNREAD), 'No open calls.')
        .replace(asJson(RESOLVED_CALLS_UNREAD), 'No calls resolved today.'),
    ).toBe(readAndEmpty);
  });

  it('a read that succeeds never carries the unread wording, with calls, with none, or on a Sunday', async () => {
    for (const setup of [
      () => {},
      () => {
        db.open = [];
      },
      () => {
        db.resolved = [];
        db.totals = { total: 0, hits: 0 };
      },
      () => {
        db.open = [];
        db.resolved = [];
        db.totals = { total: 0, hits: 0 };
      },
    ]) {
      for (const day of [TODAY, SUNDAY]) {
        db.open = OPEN_ROWS;
        db.resolved = RESOLVED_ROWS;
        db.totals = { total: 3, hits: 1 };
        db.claimed = false;
        modelRequests = [];
        setup();
        await runBrief(day);
        const prompt = modelPrompt();
        expect(prompt).not.toContain('could not be read');
        expect(promptSection(prompt, 'OUR OPEN CALLS')).toBe(
          db.open.length > 0 ? OPEN_LINES.join('\n') : 'No open calls.',
        );
        const sunday = day === SUNDAY;
        expect(promptSection(prompt, 'RESOLVED CALLS')).toBe(
          db.resolved.length > 0
            ? [
                sunday ? RESOLVED_LINES[0].replace('settled today', 'settled in the last 7 days') : RESOLVED_LINES[0],
                ...RESOLVED_LINES.slice(1),
              ].join('\n')
            : sunday
              ? 'No calls resolved this week.'
              : 'No calls resolved today.',
        );
      }
    }
  });

  // CHANGED WITH R1: the mechanical edition carries the record, not the prompt's lines.
  it('the model call fails: the mechanical edition carries the record', async () => {
    const out = await runBrief();
    expect(out.body.ai).toMatch(/^ai-failed:500/);
    const text = mechanicalText();
    expect(text).toContain('3 calls settled today against external ground truth: 1 hit, 2 miss.');
    expect(text).toContain('[Call #7101](https://nexuswatch.dev/call/7101)');
    expect(text).not.toContain(TOP_OPEN_LINE);
    expect(text).not.toContain('No open calls today.');
  });
});
