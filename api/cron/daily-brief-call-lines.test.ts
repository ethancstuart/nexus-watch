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

const db = {
  open: OPEN_ROWS as unknown[],
  resolved: RESOLVED_ROWS as unknown[],
  totals: { total: 3, hits: 1 },
  failOpenQuery: false,
  archived: null as { briefText?: string; openCallLines?: string[]; resolvedCallLines?: string[] } | null,
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

  // The open book (prompt and mechanical edition).
  if (text.includes('FROM calls') && text.includes(OPEN_CALLS_QUERY)) {
    if (db.failOpenQuery) throw new Error('synthetic: relation "calls" is unavailable');
    return db.open;
  }
  // Resolved in the window: totals, the page, the window's corrections.
  if (
    text.startsWith("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'hit')::int AS hits FROM calls")
  ) {
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

describe('no model key: the mechanical edition carries the real call lines', () => {
  it('calls exist: the top open call and the resolved lines are printed, never "No open calls today."', async () => {
    const out = await runBrief();
    expect(out.body.ai).toBe('no-api-key');
    expect(modelRequests).toHaveLength(0);

    const text = mechanicalText();
    expect(text).toContain(TOP_OPEN_LINE);
    expect(text).toContain(RESOLVED_LINES[0]);
    expect(text).toContain(RESOLVED_LINES[1]);
    expect(text).not.toContain('No open calls today.');
    // Record first, then the open call, as on a model day.
    expect(text.indexOf(RESOLVED_LINES[0])).toBeLessThan(text.indexOf(TOP_OPEN_LINE));
    // The archive row carries the same lines the edition was built from.
    expect(db.archived!.openCallLines).toEqual(OPEN_LINES);
    expect(db.archived!.resolvedCallLines).toEqual(RESOLVED_LINES);
  });

  it('the open-call query throws: the edition does not say the book is empty, and the run completes', async () => {
    db.failOpenQuery = true;
    const out = await runBrief();
    expect(out.status).toBe(200);
    expect(out.body.ai).toBe('no-api-key');

    const text = mechanicalText();
    expect(text).not.toContain('No open calls today.');
    expect(text).toContain('Open calls could not be read today.');
    expect(text).not.toContain(TOP_OPEN_LINE);
  });

  it("Sunday: the resolved lines cover the last 7 days, as the prompt's always did", async () => {
    await runBrief(SUNDAY);
    const text = mechanicalText();
    expect(text).toContain(RESOLVED_LINES[0].replace('settled today', 'settled in the last 7 days'));
    expect(text).toContain(TOP_OPEN_LINE);
  });

  it('the query succeeds with zero open calls: "No open calls today." still appears', async () => {
    db.open = [];
    await runBrief();
    const text = mechanicalText();
    expect(text).toContain('No open calls today.');
    expect(text).not.toContain('Open calls could not be read today.');
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
    // The resolved reads share the failed read's try, so this section is as it was (see REL4.md, not fixed).
    expect(promptSection(prompt, 'RESOLVED CALLS')).toBe('No calls resolved today.');
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
    expect(unread.replace(asJson(OPEN_CALLS_UNREAD), 'No open calls.')).toBe(readAndEmpty);
  });

  it('a read that succeeds never carries the unread wording, with calls, with none, or on a Sunday', async () => {
    for (const setup of [
      () => {},
      () => {
        db.open = [];
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
      }
    }
  });

  it('the model call fails: the mechanical edition carries the same lines', async () => {
    const out = await runBrief();
    expect(out.body.ai).toMatch(/^ai-failed:500/);
    const text = mechanicalText();
    expect(text).toContain(TOP_OPEN_LINE);
    expect(text).toContain(RESOLVED_LINES[0]);
    expect(text).not.toContain('No open calls today.');
  });
});
