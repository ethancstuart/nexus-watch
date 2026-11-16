import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { unsubscribeUrl } from '../_lib/unsubscribe-token.js';
import { MECHANICAL_EDITION_LINE } from './daily-brief.js';

/**
 * deliver-briefs end to end against a fake database and a stubbed Resend:
 * who is selected at a given hour, and that what goes out is still the full,
 * per-recipient document. Synthetic rows only; no network.
 */

interface Query {
  text: string;
  values: unknown[];
}

const db = {
  /** The brief for 2026-11-16 (the day most tests run on). */
  brief: null as null | Record<string, unknown>,
  /** Briefs for other dates, keyed by date. */
  otherBriefs: {} as Record<string, Record<string, unknown>>,
  subscribers: [] as Array<{ email: unknown; timezone: unknown }>,
  queries: [] as Query[],
  /** The dedup table, keyed `email|date`. */
  claims: new Set<string>(),
  /** Addresses whose claim INSERT throws (a transient database error). */
  failClaim: new Set<string>(),
  /** Order of claims, releases and sends, to prove the order per chunk. */
  events: [] as string[],
  /** Simulate the function being killed: the Nth claim statement never returns. */
  hangOnClaim: 0,
  claimCount: 0,
  /** Addresses an overlapping run claims after our SELECT, just before our claim INSERT. */
  claimedByOtherRun: new Set<string>(),
};

/** Resolved when a simulated kill point is reached. */
let killReached: () => void = () => {};

/** Whitespace-collapsed statement text; `$?` marks each parameter. */
const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

/**
 * The only statements this fake answers, word for word. It emulates what
 * each one SAYS, so it must only ever answer that exact statement: matching
 * on a fragment (as it once did) let `AND TRUE OR EXISTS (… prior …)` through
 * with the guard still applied by the fake. Anything else throws, so a
 * changed query fails here until its emulation is updated with it.
 */
const SQL = {
  probe: norm(`SELECT column_name FROM information_schema.columns
    WHERE table_name = 'daily_briefs' AND column_name IN ('email_html', 'plain_text')`),
  brief: norm(`SELECT brief_date, summary, content, email_html, plain_text FROM daily_briefs
    WHERE brief_date = $? LIMIT 1`),
  undelivered: norm(`SELECT es.email, es.timezone FROM email_subscribers es
    WHERE es.unsubscribed = FALSE
      AND NOT EXISTS ( SELECT 1 FROM brief_subscriber_delivery bsd
        WHERE bsd.subscriber_email = es.email AND bsd.brief_date = $? )`),
  undeliveredWithPrior: norm(`SELECT es.email, es.timezone FROM email_subscribers es
    WHERE es.unsubscribed = FALSE
      AND NOT EXISTS ( SELECT 1 FROM brief_subscriber_delivery bsd
        WHERE bsd.subscriber_email = es.email AND bsd.brief_date = $? )
      AND EXISTS ( SELECT 1 FROM brief_subscriber_delivery prior
        WHERE prior.subscriber_email = es.email AND prior.brief_date < $? )`),
  adminSent: norm(`SELECT subscriber_email FROM brief_subscriber_delivery
    WHERE brief_date = $? AND subscriber_email = ANY($?)`),
  claim: norm(`INSERT INTO brief_subscriber_delivery (subscriber_email, brief_date, channel)
    SELECT e, $?::date, 'resend' FROM unnest($?::text[]) AS e
    ON CONFLICT (subscriber_email, brief_date) DO NOTHING
    RETURNING subscriber_email`),
  release: norm(`DELETE FROM brief_subscriber_delivery
    WHERE brief_date = $?::date AND subscriber_email = ANY($?::text[])`),
};

const sentBefore = (email: string, date: string) =>
  [...db.claims].some((k) => k.startsWith(`${email}|`) && k.split('|')[1] < date);

function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): unknown[] | Promise<unknown[]> {
  const text = norm(strings.join('$?'));
  db.queries.push({ text, values });
  switch (text) {
    case SQL.probe:
      return [{ column_name: 'email_html' }, { column_name: 'plain_text' }];
    case SQL.brief: {
      const [date] = values as [string];
      const b = date === '2026-11-16' ? db.brief : db.otherBriefs[date];
      return b ? [b] : [];
    }
    case SQL.undelivered:
    case SQL.undeliveredWithPrior: {
      const [date, priorBefore] = values as [string, string?];
      if (text === SQL.undeliveredWithPrior) expect(priorBefore).toBe(date);
      return db.subscribers.filter((s) => {
        const email = String(s.email);
        if (db.claims.has(`${email}|${date}`)) return false; // NOT EXISTS
        return text === SQL.undelivered || sentBefore(email, date); // AND EXISTS (prior)
      });
    }
    case SQL.adminSent: {
      const [date, emails] = values as [string, string[]];
      return emails.filter((e) => db.claims.has(`${e}|${date}`)).map((e) => ({ subscriber_email: e }));
    }
    case SQL.claim: {
      // One statement per chunk: (date, emails[]) → only the rows it inserted.
      const [date, emails] = values as [string, string[]];
      db.claimCount += 1;
      if (db.claimCount === db.hangOnClaim) {
        killReached();
        return new Promise(() => {}); // killed here: the statement never returns
      }
      if (emails.some((e) => db.failClaim.has(e))) throw new Error('synthetic database error');
      // An overlapping run claims these between our SELECT and this INSERT.
      for (const e of db.claimedByOtherRun) db.claims.add(`${e}|${date}`);
      db.events.push(`claim ${emails.length}`);
      const inserted = emails.filter((e) => !db.claims.has(`${e}|${date}`)); // ON CONFLICT DO NOTHING
      for (const e of inserted) db.claims.add(`${e}|${date}`);
      return inserted.map((e) => ({ subscriber_email: e }));
    }
    case SQL.release: {
      const [date, emails] = values as [string, string[]];
      db.events.push(`release ${emails.length}`);
      for (const e of emails) db.claims.delete(`${e}|${date}`);
      return [];
    }
    default:
      throw new Error(`fake database: unrecognised statement: ${text}`);
  }
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));

const { default: handler } = await import('./deliver-briefs.js');

const READY_BRIEF = {
  brief_date: '2026-11-16',
  summary: '<div>fragment — must never be sent</div>',
  content: { subject: 'Synthetic headline' },
  email_html: '<!DOCTYPE html><html><body>Brief <a href="%%UNSUB_URL%%">Unsubscribe</a></body></html>',
  plain_text: 'Brief. Unsubscribe: %%UNSUB_URL%%',
};

const SUBSCRIBERS = [
  { email: 'london@example.test', timezone: 'Europe/London' },
  { email: 'kolkata@example.test', timezone: 'Asia/Kolkata' },
  { email: 'utc@example.test', timezone: 'UTC' },
  { email: 'bad@example.test', timezone: 'America/Not_A_Zone' },
  { email: 'null@example.test', timezone: null },
  { email: 'tokyo@example.test', timezone: 'Asia/Tokyo' }, // 22:00Z
  { email: 'la@example.test', timezone: 'America/Los_Angeles' }, // 15:00Z
];

const CRON_SECRET = 'synthetic-cron-secret';

let fetchMock: ReturnType<typeof vi.fn>;

async function runAt(iso: string) {
  vi.setSystemTime(new Date(iso));
  let body: unknown;
  const res = {
    status: () => res,
    json: (b: unknown) => {
      body = b;
      return res;
    },
  } as unknown as VercelResponse;
  // A real-shaped cron request: the handler's auth must pass because the
  // request is authorised, not because no secret is configured.
  await handler({ headers: { authorization: `Bearer ${CRON_SECRET}` } } as unknown as VercelRequest, res);
  const payloads = fetchMock.mock.calls.flatMap(
    (c) => JSON.parse((c[1] as { body: string }).body) as Array<Record<string, unknown>>,
  );
  return { body: body as Record<string, unknown>, payloads, recipients: payloads.map((p) => (p.to as string[])[0]) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/none');
  vi.stubEnv('RESEND_API_KEY', 'synthetic-test-key');
  vi.stubEnv('ADMIN_EMAILS', '');
  vi.stubEnv('AUTH_SECRET', 'synthetic-test-secret');
  fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    db.events.push(`send ${(JSON.parse(init.body) as unknown[]).length}`);
    return { ok: true, text: async () => '' };
  });
  vi.stubGlobal('fetch', fetchMock);
  db.brief = READY_BRIEF;
  db.otherBriefs = {};
  db.subscribers = SUBSCRIBERS;
  db.queries = [];
  db.claims = new Set();
  db.failClaim = new Set();
  db.events = [];
  db.hangOnClaim = 0;
  db.claimCount = 0;
  db.claimedByOtherRun = new Set();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('deliver-briefs: cron auth', () => {
  it('refuses a request without the cron secret, before touching the database', async () => {
    let status = 0;
    const res = {
      status: (n: number) => {
        status = n;
        return res;
      },
      json: () => res,
    } as unknown as VercelResponse;
    await handler({ headers: {} } as VercelRequest, res);
    expect(status).toBe(401);
    expect(db.queries).toEqual([]);
  });
});

describe('deliver-briefs: selection', () => {
  it('sends nothing before the brief exists, even to readers whose 07:00 has passed', async () => {
    db.brief = null;
    const { recipients, body } = await runAt('2026-11-16T08:00:39Z');
    expect(recipients).toEqual([]);
    expect(body.skipped).toBe(true);
  });

  it('sends nothing while the brief is only the pending claim (no renderable document)', async () => {
    db.brief = {
      brief_date: '2026-11-16',
      summary: '',
      content: { pending: true },
      email_html: null,
      plain_text: null,
    };
    const { recipients } = await runAt('2026-11-16T10:00:39Z');
    expect(recipients).toEqual([]);
  });

  it('at 11:00Z, everyone whose 07:00 has passed is sent — including the zones main never reached', async () => {
    const { recipients } = await runAt('2026-11-16T11:00:39Z');
    expect(recipients.sort()).toEqual(
      [
        'bad@example.test',
        'kolkata@example.test',
        'london@example.test',
        'null@example.test',
        'utc@example.test',
      ].sort(),
    );
  });

  it('at 15:00Z, Los Angeles is due too; Tokyo still is not', async () => {
    const { recipients } = await runAt('2026-11-16T15:00:39Z');
    expect(recipients).toContain('la@example.test');
    expect(recipients).not.toContain('tokyo@example.test');
  });

  it('the subscriber query is parameterised and no longer hands the zone to Postgres', async () => {
    await runAt('2026-11-16T11:00:39Z');
    const q = db.queries.find((x) => x.text.includes('FROM email_subscribers'))!;
    expect(q.text).toContain('es.unsubscribed = FALSE');
    expect(q.text).not.toMatch(/AT TIME ZONE|pg_timezone_names/);
    expect(q.values).toEqual(['2026-11-16']);
    expect(q.text).not.toContain('prior.brief_date');
  });
});

describe('deliver-briefs: nobody is sent twice now that the window stays open all day', () => {
  it('claims the dedup rows before sending, under the UTC brief date', async () => {
    const { recipients } = await runAt('2026-11-16T11:00:39Z');
    for (const r of recipients) expect(db.claims.has(`${r}|2026-11-16`)).toBe(true);
    expect(db.events).toEqual(['claim 5', 'send 5']);
  });

  it('a second run the same day sends nothing new to people already sent', async () => {
    const first = await runAt('2026-11-16T11:00:39Z');
    fetchMock.mockClear();
    db.subscribers = SUBSCRIBERS; // the fake does not evaluate NOT EXISTS; the claim must still stop a resend
    const second = await runAt('2026-11-16T12:00:39Z');
    expect(first.recipients.length).toBeGreaterThan(0);
    expect(second.recipients).toEqual([]);
  });

  it('a row an overlapping run claims between our SELECT and our claim is not sent (RETURNING decides)', async () => {
    // Selected as undelivered by this run, then claimed by another run before
    // this run's INSERT: only the rows the INSERT returned may be sent.
    db.claimedByOtherRun.add('london@example.test');
    const { recipients } = await runAt('2026-11-16T11:00:39Z');
    const selected = db.queries.find((q) => q.text.includes('FROM email_subscribers'))!;
    expect(selected).toBeDefined();
    expect(recipients).not.toContain('london@example.test');
    expect(recipients).toContain('kolkata@example.test');
    expect(recipients).toHaveLength(4);
  });

  it('a claim statement that fails sends nothing in that chunk; the next run sends it', async () => {
    db.failClaim.add('london@example.test');
    const first = await runAt('2026-11-16T11:00:39Z');
    expect(first.recipients).toEqual([]);
    expect(first.body.deferred).toBe(5);
    db.failClaim.clear();
    fetchMock.mockClear();
    const second = await runAt('2026-11-16T12:00:39Z');
    expect(second.recipients).toHaveLength(5);
  });

  it('a refused Resend batch releases its claims, so the next run sends it', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, text: async () => 'synthetic outage' }));
    const first = await runAt('2026-11-16T11:00:39Z');
    expect(first.body.sent).toBe(0);
    expect(db.claims.size).toBe(0);
    fetchMock.mockClear();
    const second = await runAt('2026-11-16T12:00:39Z');
    expect(second.recipients.length).toBe(5);
  });

  it('a Resend timeout keeps its claims: outcome unknown, so it is not sent again today', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('synthetic timeout');
    });
    await runAt('2026-11-16T11:00:39Z');
    expect(db.claims.size).toBe(5);
    fetchMock.mockClear();
    const second = await runAt('2026-11-16T12:00:39Z');
    expect(second.recipients).toEqual([]);
  });
});

describe('deliver-briefs: a kill or a refusal costs at most the chunk in flight', () => {
  // 250 readers due at once → chunks of 100, 100, 50.
  const MANY = Array.from({ length: 250 }, (_, i) => ({ email: `r${i}@example.test`, timezone: 'Europe/London' }));

  /** Start a run without awaiting it; resolves when the simulated kill point is reached. */
  function startKilledRun(iso: string): Promise<void> {
    const reached = new Promise<void>((r) => (killReached = r));
    vi.setSystemTime(new Date(iso));
    const res = { status: () => res, json: () => res } as unknown as VercelResponse;
    void handler({ headers: { authorization: `Bearer ${CRON_SECRET}` } } as unknown as VercelRequest, res);
    return reached;
  }
  const sentTo = () =>
    fetchMock.mock.calls.flatMap((c) =>
      (JSON.parse((c[1] as { body: string }).body) as Array<{ to: string[] }>).map((p) => p.to[0]),
    );

  it('killed between chunks: nobody is stranded, and the next run sends the rest exactly once', async () => {
    db.subscribers = MANY;
    db.hangOnClaim = 2; // killed as the second chunk's claim is issued
    await startKilledRun('2026-11-16T11:00:39Z');
    expect(sentTo()).toHaveLength(100);
    expect(db.claims.size).toBe(100); // only what was sent is marked delivered

    db.hangOnClaim = 0;
    await runAt('2026-11-16T12:00:39Z');
    const all = sentTo();
    expect(all).toHaveLength(250);
    expect(new Set(all).size).toBe(250);
  });

  it('killed while a chunk is being sent: at most that chunk is lost, nobody gets two', async () => {
    db.subscribers = MANY;
    let calls = 0;
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      calls += 1;
      if (calls === 2) {
        killReached();
        return new Promise(() => {}); // killed mid-send
      }
      db.events.push(`send ${(JSON.parse(init.body) as unknown[]).length}`);
      return { ok: true, text: async () => '' };
    });
    await startKilledRun('2026-11-16T11:00:39Z');
    expect(db.claims.size).toBe(200); // chunk 1 sent, chunk 2 in flight; chunk 3 untouched

    fetchMock.mockImplementation(async () => ({ ok: true, text: async () => '' }));
    fetchMock.mockClear();
    await runAt('2026-11-16T12:00:39Z');
    expect(sentTo()).toHaveLength(50); // chunk 3 only: the in-flight chunk is not resent
  });

  it('a refused chunk is released before the next chunk is claimed', async () => {
    db.subscribers = MANY;
    let calls = 0;
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      calls += 1;
      const n = (JSON.parse(init.body) as unknown[]).length;
      db.events.push(`send ${n}`);
      if (calls === 2) return { ok: false, status: 422, text: async () => 'synthetic refusal' };
      return { ok: true, text: async () => '' };
    });
    await runAt('2026-11-16T11:00:39Z');
    expect(db.events).toEqual(['claim 100', 'send 100', 'claim 100', 'send 100', 'release 100', 'claim 50', 'send 50']);
    expect(db.claims.size).toBe(150);

    fetchMock.mockImplementation(async () => ({ ok: true, text: async () => '' }));
    fetchMock.mockClear();
    await runAt('2026-11-16T12:00:39Z');
    expect(sentTo()).toHaveLength(100); // the refused chunk, once
  });
});

describe("deliver-briefs: carrying yesterday's brief over until today's exists", () => {
  const SHANGHAI = { email: 'shanghai@example.test', timezone: 'Asia/Shanghai' }; // due 23:00Z
  const SENT_BEFORE = 'shanghai@example.test|2026-11-15';

  it("before today's brief exists, a reader who missed yesterday's gets it — in their morning", async () => {
    db.subscribers = [SHANGHAI];
    db.claims.add(SENT_BEFORE);
    // 01:00Z on the 17th = 09:00 in Shanghai; no brief for the 17th yet
    const { recipients, body } = await runAt('2026-11-17T01:00:39Z');
    expect(recipients).toEqual(['shanghai@example.test']);
    expect(body).toMatchObject({ date: '2026-11-16', carriedOver: true });
    expect(db.claims.has('shanghai@example.test|2026-11-16')).toBe(true);
    const q = db.queries.find((x) => x.text.includes('FROM email_subscribers'))!;
    expect(q.text).toContain('prior.brief_date <');
    expect(q.values).toEqual(['2026-11-16', '2026-11-16']);
  });

  it("is never anyone's first brief — the deploy-day guard", async () => {
    db.subscribers = [SHANGHAI];
    const { recipients } = await runAt('2026-11-17T01:00:39Z');
    expect(recipients).toEqual([]);
  });

  it("stops once today's brief exists", async () => {
    db.subscribers = [SHANGHAI];
    db.claims.add(SENT_BEFORE);
    db.otherBriefs['2026-11-17'] = { ...READY_BRIEF, brief_date: '2026-11-17' };
    const { recipients, body } = await runAt('2026-11-17T11:00:39Z');
    expect(recipients).toEqual([]); // the 16th is closed; the 17th is not due until 23:00Z
    expect(body.reason).toMatch(/No subscribers due/);
  });

  it("stops at the reader's local midnight even if today's brief never comes", async () => {
    db.subscribers = [SHANGHAI];
    db.claims.add(SENT_BEFORE);
    const { recipients } = await runAt('2026-11-17T16:00:39Z'); // 00:00 on the 18th in Shanghai
    expect(recipients).toEqual([]);
  });

  it('does not carry over the admin copy', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.test');
    db.subscribers = [];
    const { recipients } = await runAt('2026-11-17T14:00:39Z'); // today's brief failed; 16th still loadable
    expect(recipients).toEqual([]);
  });
});

describe('deliver-briefs: a stored mechanical edition re-renders as one (lane M through loadBrief)', () => {
  // No stored email_html, so loadBrief re-renders from briefText. The edition
  // comes from the archived content, as lane M wrote it at generation time.
  const unrendered = (date: string, edition?: string) => ({
    brief_date: date,
    summary: '<div>fragment — must never be sent</div>',
    content: { briefText: '## Top Signal\n\nSynthetic body for a re-render test.', ...(edition ? { edition } : {}) },
    email_html: null,
    plain_text: null,
  });

  it("today's brief: the edition line is in the html and the text", async () => {
    db.brief = unrendered('2026-11-16', 'mechanical');
    const { payloads } = await runAt('2026-11-16T11:00:39Z');
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(p.html).toContain(MECHANICAL_EDITION_LINE);
      expect(p.text).toContain(MECHANICAL_EDITION_LINE);
    }
  });

  it('a carried-over brief keeps its own edition and its own date', async () => {
    db.brief = unrendered('2026-11-16', 'mechanical');
    db.subscribers = [{ email: 'shanghai@example.test', timezone: 'Asia/Shanghai' }];
    db.claims.add('shanghai@example.test|2026-11-15');
    const { payloads, body } = await runAt('2026-11-17T01:00:39Z'); // no brief for the 17th yet
    expect(body).toMatchObject({ date: '2026-11-16', carriedOver: true });
    expect(payloads).toHaveLength(1);
    expect(payloads[0].html).toContain(MECHANICAL_EDITION_LINE);
    expect(payloads[0].html).toContain('/brief/2026-11-16');
    expect(payloads[0].html).not.toContain('/brief/2026-11-17');
  });

  it('a model edition (or none stored) has no edition line', async () => {
    db.brief = unrendered('2026-11-16');
    const { payloads } = await runAt('2026-11-16T11:00:39Z');
    for (const p of payloads) expect(p.html).not.toContain(MECHANICAL_EDITION_LINE);
  });
});

describe('deliver-briefs: what is sent is unchanged', () => {
  it('only the full document, one recipient per message, with that recipient’s unsubscribe link and headers', async () => {
    const { payloads } = await runAt('2026-11-16T11:00:39Z');
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      const to = p.to as string[];
      expect(to).toHaveLength(1);
      expect(p.html).toMatch(/^<!DOCTYPE html>/);
      expect(p.html).not.toContain('fragment');
      expect(p.html).not.toContain('%%UNSUB_URL%%');
      expect(p.text).not.toContain('%%UNSUB_URL%%');
      const headers = p.headers as Record<string, string>;
      expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      expect(headers['List-Unsubscribe']).toBe(`<${unsubscribeUrl(to[0])}>`);
      expect(p.text).toContain(unsubscribeUrl(to[0]));
    }
  });
});

describe('deliver-briefs: admin copy timing is unchanged', () => {
  it('not before 13:00Z', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.test');
    db.subscribers = [];
    const { recipients } = await runAt('2026-11-16T12:00:39Z');
    expect(recipients).toEqual([]);
  });

  it('from 13:00Z', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.test');
    db.subscribers = [];
    const { recipients } = await runAt('2026-11-16T13:00:39Z');
    expect(recipients).toEqual(['admin@example.test']);
  });
});
