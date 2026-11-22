import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BRIEF_MODEL_MODE_VAR,
  buildDryRunRecord,
  dryRunAlert,
  getBriefModelMode,
  newDryRunAttempt,
  operatorEmail,
  recordDryRun,
  summariseGates,
  type DryRunGates,
  type DryRunRecord,
  type SqlTag,
} from './brief-dry-run.js';
import { groundDraft } from './grounding.js';
import { DAILY_SECTIONS, validateBriefStructure } from './brief-structure.js';
import { checkComparativeClaims } from './comparative-claims.js';

/**
 * The dry run's pure parts and its two outbound paths, hermetically: fetch is
 * stubbed, the database is a recording fake, every address is example.test.
 * The handler-level tests are in api/cron/daily-brief-dry-run.test.ts.
 */

const ADMIN_A = 'owner-one@example.test';
const ADMIN_B = 'owner-two@example.test';
const WEBHOOK = 'https://discord.example.test/api/webhooks/1/synthetic';
const MARKER = 'QZXDRAFTMARKERQZX';

let fetchMock: ReturnType<typeof vi.fn>;
const fetched = () => fetchMock.mock.calls.map((c) => ({ url: String(c[0]), body: String(c[1]?.body ?? '') }));

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('RESEND_API_KEY', 'synthetic-resend-key');
  vi.stubEnv('ADMIN_EMAILS', `${ADMIN_A}, ${ADMIN_B}`);
  vi.stubEnv('DISCORD_APPROVAL_WEBHOOK_URL', '');
  vi.stubEnv('DISCORD_APPROVAL_ENABLED', '');
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'msg_synthetic' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BRIEF_MODEL_MODE: exactly `live` is live, everything else is a dry run', () => {
  it('is the variable the design names', () => {
    expect(BRIEF_MODEL_MODE_VAR).toBe('BRIEF_MODEL_MODE');
  });

  it.each([
    [undefined, 'dry-run'],
    ['', 'dry-run'],
    ['live', 'live'],
    ['LIVE', 'dry-run'],
    ['LIVE ', 'dry-run'],
    ['Live', 'dry-run'],
    [' live', 'dry-run'],
    ['live ', 'dry-run'],
    ['live\n', 'dry-run'],
    ['"live"', 'dry-run'],
    ['lives', 'dry-run'],
    ['true', 'dry-run'],
    ['1', 'dry-run'],
    ['yes', 'dry-run'],
    ['on', 'dry-run'],
    ['false', 'dry-run'],
    ['0', 'dry-run'],
    ['dry-run', 'dry-run'],
    ['dry_run', 'dry-run'],
  ])('%j → %s', (value, mode) => {
    expect(getBriefModelMode({ BRIEF_MODEL_MODE: value })).toBe(mode);
  });

  it('reads the process environment when given none, as the handler calls it', () => {
    vi.stubEnv('BRIEF_MODEL_MODE', 'live');
    expect(getBriefModelMode()).toBe('live');
    vi.stubEnv('BRIEF_MODEL_MODE', 'LIVE ');
    expect(getBriefModelMode()).toBe('dry-run');
  });

  it('an environment that throws when read is a dry run, not an exception', () => {
    const hostile = new Proxy({} as Record<string, string | undefined>, {
      get() {
        throw new Error('unreadable');
      },
    });
    expect(getBriefModelMode(hostile)).toBe('dry-run');
  });
});

// A draft that passes all three gates against an empty context: the five
// sections, the falsifiability clause, no numerals, no comparison.
const PASSING = [
  `${DAILY_SECTIONS[0]}`,
  'No open calls today.',
  `${DAILY_SECTIONS[1]}`,
  `**A quiet board ${MARKER}.** Nothing crossed a threshold.`,
  `${DAILY_SECTIONS[2]}`,
  'Nothing moved. **What would change our mind:** a confirmed OONI blocking event in any country.',
  `${DAILY_SECTIONS[3]}`,
  '- Nothing withheld today.',
  `${DAILY_SECTIONS[4]}`,
  'Quiet.',
].join('\n\n');

const gatesFor = (draft: string) =>
  summariseGates(groundDraft(draft, ''), validateBriefStructure(draft, false), checkComparativeClaims(draft, ''));

describe('summariseGates: each gate, its verdict and its reason', () => {
  it('a clean draft passes all three', () => {
    expect(gatesFor(PASSING)).toEqual({
      grounding: { verdict: 'pass', reason: '0/0 unsupported numerals' },
      structure: { verdict: 'pass', reason: null },
      claims: { verdict: 'pass', reason: null },
    });
  });

  it('records every refusal, not only the first the handler acts on', () => {
    const bad = `${PASSING.replace(`${DAILY_SECTIONS[4]}\n\nQuiet.`, '')}\n\nOONI logged 5 network blocks, then 9999, 8888, 7777 and 6666.`;
    const g = gatesFor(bad);
    expect(g.grounding).toEqual({ verdict: 'refused', reason: '4/5 unsupported numerals [9999, 8888, 7777, 6666]' });
    expect(g.structure.verdict).toBe('refused');
    expect(g.structure.reason).toContain('missing=[the long fuse]');
    expect(g.claims.verdict).toBe('refused');
    expect(g.claims.reason).toMatch(/^comparative-claim-failed: .*"5 network blocks"/);
  });
});

describe('buildDryRunRecord', () => {
  it('a failed model call: every gate not run, no draft, no tokens', () => {
    const r = buildDryRunRecord({
      briefDate: '2026-11-23',
      runId: 'run-1',
      outcome: 'ai-failed:400:synthetic',
      wouldHaveShipped: false,
      attempt: newDryRunAttempt(),
    });
    expect(r.gates).toEqual({
      grounding: { verdict: 'not-run', reason: null },
      structure: { verdict: 'not-run', reason: null },
      claims: { verdict: 'not-run', reason: null },
    });
    expect(r.draftText).toBeNull();
    expect(r.draftSubject).toBeNull();
    expect([r.inputTokens, r.outputTokens, r.cacheReadInputTokens]).toEqual([null, null, null]);
  });

  it('keeps token counts the API reported as whole numbers, and nothing else', () => {
    const attempt = {
      ...newDryRunAttempt(),
      usage: { input_tokens: 15000, output_tokens: 2100, cache_read_input_tokens: 0 },
    };
    const r = buildDryRunRecord({ briefDate: 'd', runId: 'r', outcome: 'o', wouldHaveShipped: true, attempt });
    expect([r.inputTokens, r.outputTokens, r.cacheReadInputTokens]).toEqual([15000, 2100, 0]);
    for (const odd of [-1, 1.5, '15000', Number.NaN, null, 2 ** 40]) {
      const a = { ...newDryRunAttempt(), usage: { input_tokens: odd } };
      expect(
        buildDryRunRecord({ briefDate: 'd', runId: 'r', outcome: 'o', wouldHaveShipped: true, attempt: a }).inputTokens,
      ).toBeNull();
    }
  });

  it('an empty draft is stored as no draft', () => {
    const attempt = { ...newDryRunAttempt(), draftText: '' };
    expect(
      buildDryRunRecord({ briefDate: 'd', runId: 'r', outcome: 'o', wouldHaveShipped: false, attempt }).draftText,
    ).toBeNull();
  });
});

const record = (over: Partial<DryRunRecord> = {}): DryRunRecord => ({
  briefDate: '2026-11-23',
  runId: '2026-11-23-1795428000000',
  model: 'claude-sonnet-5-5',
  outcome: 'ai-success (grounding 0/0 unsupported)',
  wouldHaveShipped: true,
  stopReason: 'end_turn',
  gates: gatesFor(PASSING),
  draftSubject: `The ${MARKER} subject line for a test day`,
  draftText: PASSING,
  inputTokens: 15000,
  outputTokens: 2100,
  cacheReadInputTokens: 0,
  ...over,
});

describe('dryRunAlert: the general path carries the date, the verdicts and DRY RUN, nothing else', () => {
  const quoting: DryRunGates = {
    grounding: { verdict: 'refused', reason: `quoting the draft: ${MARKER}` },
    structure: { verdict: 'refused', reason: `extra=[${MARKER}]` },
    claims: { verdict: 'refused', reason: `"${MARKER}"` },
  };

  it('is exactly the date, the three verdicts and whether it would have shipped', () => {
    expect(dryRunAlert('2026-11-23', gatesFor(PASSING), true)).toEqual({
      severity: 'info',
      title: 'DRY RUN 2026-11-23',
      body: 'DRY RUN 2026-11-23\nGrounding gate: pass\nStructure gate: pass\nClaim gate: pass\nWould have shipped: yes',
    });
  });

  it('never carries a gate reason, which can quote the draft', () => {
    const a = dryRunAlert('2026-11-23', quoting, false);
    expect(JSON.stringify(a)).not.toContain(MARKER);
    expect(a.body).toContain('Grounding gate: refused');
    expect(a.body).toContain('Would have shipped: no');
  });

  it('has no dedup key: one per run, never an "ongoing" reminder', () => {
    expect(dryRunAlert('2026-11-23', null, false).key).toBeUndefined();
  });
});

describe('operatorEmail: the draft and the gate results, for ADMIN_EMAILS only', () => {
  it('heads with DRY RUN, not sent to readers, and carries the draft, subject, reasons and tokens', () => {
    const e = operatorEmail(record({ gates: gatesFor(`${PASSING}\n\n9999 8888 7777 6666`) }), true);
    expect(e.title).toBe('DRY RUN, not sent to readers: 2026-11-23');
    expect(e.body.startsWith('DRY RUN, not sent to readers.')).toBe(true);
    expect(e.body).toContain(PASSING);
    expect(e.body).toContain(`Declared subject: The ${MARKER} subject line for a test day`);
    expect(e.body).toContain('- Grounding: refused (4/4 unsupported numerals [9999, 8888, 7777, 6666])');
    expect(e.body).toContain('Tokens: input 15000, output 2100, cache read 0');
    expect(e.body).toContain('Stored in brief_dry_runs: yes (run 2026-11-23-1795428000000)');
    expect(e.title).not.toContain(MARKER);
  });

  it('says so when the row was not stored', () => {
    expect(operatorEmail(record(), false).body).toContain('Stored in brief_dry_runs: NO, see the runtime log');
  });
});

describe('recordDryRun: stores privately, emails the operator, never throws', () => {
  let statements: { text: string; values: unknown[] }[];
  const recordingSql: SqlTag = async (strings, ...values) => {
    statements.push({ text: strings.join('$?').replace(/\s+/g, ' ').trim(), values });
    return [];
  };
  beforeEach(() => {
    statements = [];
    vi.stubEnv('DISCORD_APPROVAL_WEBHOOK_URL', WEBHOOK);
  });

  it('writes one row to brief_dry_runs with every field, then emails ADMIN_EMAILS the draft', async () => {
    const r = record();
    const out = await recordDryRun(recordingSql, r);
    expect(out.stored).toBe(true);
    expect(out.emailed?.delivered).toBe(true);
    expect(statements).toHaveLength(1);
    const { text, values } = statements[0];
    expect(text.startsWith('INSERT INTO brief_dry_runs')).toBe(true);
    const columns = /\(([^)]*)\) VALUES/
      .exec(text)![1]
      .split(',')
      .map((c) => c.trim());
    expect(columns).toEqual([
      'brief_date',
      'run_id',
      'model',
      'outcome',
      'would_have_shipped',
      'stop_reason',
      'grounding_verdict',
      'grounding_reason',
      'structure_verdict',
      'structure_reason',
      'claims_verdict',
      'claims_reason',
      'draft_subject',
      'draft_text',
      'input_tokens',
      'output_tokens',
      'cache_read_input_tokens',
    ]);
    expect(values).toEqual([
      r.briefDate,
      r.runId,
      r.model,
      r.outcome,
      true,
      'end_turn',
      'pass',
      '0/0 unsupported numerals',
      'pass',
      null,
      'pass',
      null,
      r.draftSubject,
      r.draftText,
      15000,
      2100,
      0,
    ]);
    // The only outbound request is the operator email; nothing reached Discord.
    expect(fetched().map((f) => f.url)).toEqual(['https://api.resend.com/emails']);
    expect(JSON.parse(fetched()[0].body).to).toEqual([ADMIN_A, ADMIN_B]);
  });

  it.each([
    [
      'rejects',
      (async () => {
        throw new Error('relation "brief_dry_runs" does not exist');
      }) as SqlTag,
    ],
    [
      'throws synchronously',
      (() => {
        throw new Error('synthetic sync failure owner-one@example.test');
      }) as unknown as SqlTag,
    ],
  ])('storage that %s: logged and alerted without the draft, the email still goes, nothing thrown', async (_, sql) => {
    const out = await recordDryRun(sql, record());
    expect(out.stored).toBe(false);
    const discord = fetched().filter((f) => f.url === WEBHOOK);
    expect(discord).toHaveLength(1);
    expect(discord[0].body).toContain('Dry run not stored: 2026-11-23');
    expect(discord[0].body).not.toContain(MARKER);
    const email = fetched().filter((f) => f.url === 'https://api.resend.com/emails');
    expect(email).toHaveLength(1);
    expect(JSON.parse(email[0].body).text).toContain('Stored in brief_dry_runs: NO');
    const logged = vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(' '));
    expect(logged.some((l) => l.includes('dry run NOT stored for 2026-11-23'))).toBe(true);
    for (const l of logged) expect(l).not.toContain('example.test');
  });

  it('no draft (the model call failed): the attempt is stored, no email is sent', async () => {
    const out = await recordDryRun(
      recordingSql,
      record({ draftText: null, draftSubject: null, wouldHaveShipped: false }),
    );
    expect(out).toEqual({ stored: true, emailed: null });
    expect(statements).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failed operator email is reported, not thrown', async () => {
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }));
    const out = await recordDryRun(recordingSql, record());
    expect(out.stored).toBe(true);
    expect(out.emailed?.delivered).toBe(false);
  });
});
