import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * beehiiv is retired (RETIRE-BEEHIIV). Every path through the sign-up handler
 * runs here with the beehiiv settings still set, as production has them until
 * the owner deletes them: a well formed id (the case the old code sent to) and
 * the malformed id production holds today. Nothing may be sent to beehiiv or
 * logged about it, and the rest of each path must still happen. Hermetic:
 * fetch and the database are stubbed, every address is at example.test, and
 * the ids and keys are synthetic.
 */

const db = { optedOut: false, queries: [] as Array<{ text: string; values: unknown[] }> };

async function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
  const text = strings.join('$?').replace(/\s+/g, ' ').trim();
  db.queries.push({ text, values });
  if (text.startsWith('INSERT INTO email_subscribers')) return [{ unsubscribed: db.optedOut }];
  return [];
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));

const { default: subscribe } = await import('./subscribe.js');
const { resubscribeToken } = await import('./_lib/unsubscribe-token.js');

const READER = 'reader@example.test';
const RESEND_URL = 'https://api.resend.com/emails';

let sent: Array<{ url: string; body: string }>;
let consoleLines: string[];

interface Out {
  status: number;
  body: unknown;
}

async function call(req: { method: string; query?: Record<string, string>; body?: unknown }): Promise<Out> {
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
  await subscribe({ headers: {}, query: {}, ...req } as unknown as VercelRequest, res as unknown as VercelResponse);
  return out;
}

/** Any request to a beehiiv host, any payload naming it, or any log line about it. */
const beehiivTrace = () => [
  ...sent.filter((s) => /beehiiv/i.test(new URL(s.url).hostname) || /beehiiv/i.test(s.body)).map((s) => s.url),
  ...consoleLines.filter((l) => /beehiiv/i.test(l)),
];

const SETTINGS: Array<[string, Record<string, string | undefined>]> = [
  ['a well formed beehiiv id set', { BEEHIIV_PUBLICATION_ID: 'pub_00000000-1111-2222-3333-444444444444' }],
  [
    'the malformed id production holds today',
    { BEEHIIV_PUBLICATION_ID: undefined, BEEHIIV_PUB_ID: 'Qk7Xv-9mZp-W3tR-Lc8Yd-NbHs4-Ugj2' },
  ],
];

beforeEach(() => {
  db.optedOut = false;
  db.queries = [];
  sent = [];
  consoleLines = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { body?: unknown }) => {
      sent.push({ url: String(input), body: typeof init?.body === 'string' ? init.body : '' });
      return new Response('{"id":"msg_synthetic"}', { status: 200 });
    }),
  );
  const env: Record<string, string | undefined> = {
    DATABASE_URL: 'postgres://synthetic.invalid/none',
    RESEND_API_KEY: 'synthetic-resend-key',
    CRON_SECRET: 'synthetic-cron-secret',
    AUTH_SECRET: undefined,
    BEEHIIV_API_KEY: 'synthetic-beehiiv-key',
    BEEHIIV_PUBLICATION_ID: undefined,
    BEEHIIV_PUB_ID: undefined,
  };
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(SETTINGS)('beehiiv is retired: the sign-up handler, with %s', (_, settings) => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(settings)) vi.stubEnv(k, v as string);
  });

  it('a new sign-up: saved, welcomed by Resend, and nothing to beehiiv', async () => {
    const out = await call({ method: 'POST', body: { email: READER, source: 'landing', timezone: 'Europe/Paris' } });
    expect(out).toEqual({
      status: 200,
      body: { success: true, message: 'Subscribed to NexusWatch Intelligence Brief' },
    });
    expect(db.queries.filter((q) => q.text.startsWith('INSERT INTO email_subscribers'))).toHaveLength(1);
    expect(sent.map((s) => s.url)).toEqual([RESEND_URL]);
    expect(JSON.parse(sent[0].body)).toMatchObject({ to: [READER], subject: 'Welcome to NexusWatch Intelligence' });
    expect(beehiivTrace()).toEqual([]);
  });

  it('an opted-out address signs up again: one confirmation mail, and nothing to beehiiv', async () => {
    db.optedOut = true;
    const out = await call({ method: 'POST', body: { email: READER, source: 'landing' } });
    expect(out).toEqual({
      status: 200,
      body: { success: true, message: 'Subscribed to NexusWatch Intelligence Brief' },
    });
    expect(sent.map((s) => s.url)).toEqual([RESEND_URL]);
    expect(JSON.parse(sent[0].body)).toMatchObject({ to: [READER], subject: 'Confirm you want the brief again' });
    expect(beehiivTrace()).toEqual([]);
  });

  it('the re-subscribe link, opened: a form, no change, and no request at all', async () => {
    const out = await call({ method: 'GET', query: { e: READER, t: resubscribeToken(READER)! } });
    expect(out.status).toBe(200);
    expect(String(out.body)).toContain('Start the brief again?');
    expect(db.queries).toEqual([]);
    expect(sent).toEqual([]);
    expect(beehiivTrace()).toEqual([]);
  });

  it('the re-subscribe confirmed: the reader is back on the list, and nothing to beehiiv', async () => {
    const out = await call({ method: 'POST', query: { e: READER, t: resubscribeToken(READER)! } });
    expect(out.status).toBe(200);
    expect(String(out.body)).toContain('You’re back on the list');
    expect(db.queries.map((q) => q.text)).toEqual([
      'UPDATE email_subscribers SET unsubscribed = FALSE WHERE LOWER(email) = $?',
    ]);
    expect(db.queries[0].values).toEqual([READER]);
    expect(sent).toEqual([]);
    expect(beehiivTrace()).toEqual([]);
  });
});
