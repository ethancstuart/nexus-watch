import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * THE INCIDENT THIS ENCODES — 2026-11-07 to 2026-11-15. The brief shipped as
 * the mechanical edition nine mornings running and raised a `brief:fallback`
 * alert each time. A successful send logged nothing, so the runtime log could
 * not tell "sent" from "never attempted", and nobody could say whether any of
 * the nine emails arrived.
 *
 * Contract: every raiseAlert outcome writes EXACTLY ONE log line, and no line
 * ever contains an address, a body or a key. Everything here is synthetic:
 * fetch and the database are stubbed, and no request leaves the process.
 */

const ADDR_A = 'owner-one@example.test';
const ADDR_B = 'owner-two@example.test';
const FAKE_RESEND_KEY = 're_synthetic_key_do_not_log';
const FAKE_WEBHOOK = 'https://discord.example.test/api/webhooks/123/synthetic-token';
const BODY = 'distinctive-body-text-should-never-be-logged';

// Database stub: `neon()` returns a tagged-template function whose answers are
// scripted per test. Only used by the keyed (deduplicated) path.
let sqlAnswers: unknown[][] = [];
vi.mock('@neondatabase/serverless', () => ({
  neon: () => async () => sqlAnswers.shift() ?? [],
}));

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

function loggedLines(): string[] {
  return [...logSpy.mock.calls, ...errSpy.mock.calls].map((c) => c.map(String).join(' '));
}

function alertLines(): string[] {
  return loggedLines().filter((l) => l.includes('[alert]'));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  sqlAnswers = [];
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('DISCORD_APPROVAL_WEBHOOK_URL', '');
  vi.stubEnv('DISCORD_APPROVAL_ENABLED', '');
  vi.stubEnv('RESEND_API_KEY', FAKE_RESEND_KEY);
  vi.stubEnv('ADMIN_EMAILS', `${ADDR_A}, ${ADDR_B}`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function expectNothingSecret(lines: string[]) {
  const all = lines.join('\n');
  expect(all).not.toContain(ADDR_A);
  expect(all).not.toContain(ADDR_B);
  expect(all).not.toContain('example.test');
  expect(all).not.toContain(FAKE_RESEND_KEY);
  expect(all).not.toContain('synthetic-token');
  expect(all).not.toContain(BODY);
}

describe('raiseAlert logs exactly one line per outcome', () => {
  it('delivered by email: channel, provider message id and recipient count — no address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { id: 'msg_synthetic_123' })),
    );
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T1', body: BODY, severity: 'critical' });

    expect(r).toMatchObject({ delivered: true, channel: 'email', messageId: 'msg_synthetic_123' });
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('delivered');
    expect(lines[0]).toContain('channel=email');
    expect(lines[0]).toContain('id=msg_synthetic_123');
    expect(lines[0]).toContain('recipients=2');
    expectNothingSecret(loggedLines());
  });

  it('delivered but the provider gave no id: says so rather than inventing one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T2', body: BODY });

    expect(r.delivered).toBe(true);
    expect(r.messageId).toBeUndefined();
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('id=none');
  });

  it('delivered by Discord: channel logged, webhook URL never logged', async () => {
    vi.stubEnv('DISCORD_APPROVAL_WEBHOOK_URL', FAKE_WEBHOOK);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T3', body: BODY });

    expect(r).toMatchObject({ delivered: true, channel: 'discord' });
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('channel=discord');
    expectNothingSecret(loggedLines());
  });

  it('undelivered, provider refused: one line with the status, and an echoed address is scrubbed', async () => {
    // Providers echo the offending address in 4xx bodies. The reason is logged,
    // the address is not.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(`invalid recipient ${ADDR_A} for key ${FAKE_RESEND_KEY}`, { status: 422 })),
    );
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T4', body: BODY });

    expect(r).toMatchObject({ delivered: false, channel: 'email' });
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('undelivered');
    expect(lines[0]).toContain('resend_422');
    expectNothingSecret(loggedLines());
  });

  it('an address straddling the 120-character cut is scrubbed before it is cut, at every offset', async () => {
    // Review finding: the body was sliced to 120 characters BEFORE the scrub,
    // so an address crossing the cut lost its "@" and its local part was logged
    // in clear. Sweep the address across the cut, with a long local part.
    const { raiseAlert } = await import('./alert.js');
    for (let pad = 80; pad <= 125; pad++) {
      logSpy.mockClear();
      errSpy.mockClear();
      const body = `${'x'.repeat(pad)} ownerlocalpartwhichislong@${'d'.repeat(10)}.example.test tail`;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(body, { status: 422 })),
      );

      const r = await raiseAlert({ title: 'T-cut', body: BODY });

      const seen = [r.detail, ...alertLines()].join('\n');
      expect(seen, `pad=${pad}`).not.toContain('ownerlocal');
      expect(seen, `pad=${pad}`).not.toContain('example.test');
      expect(seen, `pad=${pad}`).not.toContain('@');
      expect(alertLines(), `pad=${pad}`).toHaveLength(1);
    }
  });

  it('a URL or key straddling the cut is scrubbed first too, and the result is still capped', async () => {
    const { raiseAlert } = await import('./alert.js');
    for (const pad of [90, 100, 110, 118]) {
      logSpy.mockClear();
      const body = `${'y'.repeat(pad)} ${FAKE_WEBHOOK} ${FAKE_RESEND_KEY} ${'z'.repeat(400)}`;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(body, { status: 500 })),
      );

      const r = await raiseAlert({ title: 'T-cut2', body: BODY });

      const seen = [r.detail, ...alertLines()].join('\n');
      expect(seen, `pad=${pad}`).not.toContain('discord.example');
      expect(seen, `pad=${pad}`).not.toContain('synthetic-token');
      expect(seen, `pad=${pad}`).not.toContain('re_synthetic');
      expect(r.detail.length).toBeLessThanOrEqual('resend_500: '.length + 120);
    }
  });

  it('undelivered, transport threw: one line, no URL from the error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`connect failed for ${FAKE_WEBHOOK}`);
      }),
    );
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T5', body: BODY });

    expect(r).toMatchObject({ delivered: false, channel: 'none' });
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('undelivered');
    expectNothingSecret(loggedLines());
  });

  it('undelivered, no channel configured: one line naming the missing variable by name, not the old duplicate', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T6', body: BODY });

    expect(r).toMatchObject({ delivered: false, channel: 'none', detail: 'RESEND_API_KEY unset' });
    expect(fetchSpy).not.toHaveBeenCalled();
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('undelivered');
    expect(lines[0]).toContain('RESEND_API_KEY unset');
    expectNothingSecret(loggedLines());
  });

  it('Discord refused and no email path: the Discord status is the reason, not a misleading "unset"', async () => {
    vi.stubEnv('DISCORD_APPROVAL_WEBHOOK_URL', FAKE_WEBHOOK);
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T7', body: BODY });

    expect(r.delivered).toBe(false);
    expect(r.detail).toContain('discord_404');
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('discord_404');
  });

  it('Discord refused, email delivers: one line, for the channel that actually carried it', async () => {
    vi.stubEnv('DISCORD_APPROVAL_WEBHOOK_URL', FAKE_WEBHOOK);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'msg_synthetic_456' }));
    vi.stubGlobal('fetch', fetchMock);
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T8', body: BODY });

    expect(r).toMatchObject({ delivered: true, channel: 'email', messageId: 'msg_synthetic_456' });
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('channel=email');
  });

  it('suppressed (keyed, inside the reminder window): one line, and nothing is sent', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/none');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    // INSERT ... ON CONFLICT answers [], the claiming UPDATE matches no row.
    sqlAnswers = [[], []];
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T9', body: BODY, key: 'brief:fallback' });

    expect(r).toMatchObject({ delivered: false, channel: 'suppressed' });
    expect(fetchSpy).not.toHaveBeenCalled();
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('suppressed');
    expect(lines[0]).toContain('key=brief:fallback');
    expectNothingSecret(loggedLines());
  });

  it('keyed and claimed, then delivered: still one line (the claim itself logs nothing)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/none');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { id: 'msg_synthetic_789' })),
    );
    sqlAnswers = [[], [{ first_seen: '2026-11-14T10:00:00Z', prior: null }]];
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T10', body: BODY, key: 'brief:fallback' });

    expect(r.delivered).toBe(true);
    expect(alertLines()).toHaveLength(1);
    expectNothingSecret(loggedLines());
  });

  it('keyed, claimed, delivery failed: one line, and the claim is released silently', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/none');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    sqlAnswers = [[], [{ first_seen: '2026-11-14T10:00:00Z', prior: null }], []];
    const { raiseAlert } = await import('./alert.js');

    const r = await raiseAlert({ title: 'T11', body: BODY, key: 'brief:fallback' });

    expect(r.delivered).toBe(false);
    const lines = alertLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('undelivered');
  });
});

describe('scrubForLog is bounded', () => {
  it('a large body with no delimiter finishes fast (the address pattern was quadratic)', async () => {
    const { scrubForLog } = await import('./alert.js');
    const started = Date.now();
    const out = scrubForLog('a'.repeat(200_000));
    expect(Date.now() - started).toBeLessThan(500);
    expect(out.length).toBeLessThanOrEqual(160);
  });

  it('the same body through raiseAlert stays fast and still logs one line', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('b'.repeat(200_000), { status: 502 })),
    );
    const { raiseAlert } = await import('./alert.js');
    const started = Date.now();
    const r = await raiseAlert({ title: 'T-big', body: BODY });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(r.detail.length).toBeLessThanOrEqual('resend_502: '.length + 120);
    expect(alertLines()).toHaveLength(1);
  });

  it('an address cut by the input cap leaks no fragment: the trailing partial token is dropped', async () => {
    // Whitespace collapses, so the output is short enough to show any fragment
    // the cap left at the end of the input.
    const { scrubForLog } = await import('./alert.js');
    for (let start = 4070; start <= 4100; start++) {
      const out = scrubForLog(`${' '.repeat(start)}ownerlocalpart@host.example.test`);
      expect(out, `start=${start}`).not.toContain('owner');
      expect(out, `start=${start}`).not.toContain('@');
    }
  });

  it('a short body is untouched by the cap', async () => {
    const { scrubForLog } = await import('./alert.js');
    expect(scrubForLog('invalid recipient')).toBe('invalid recipient');
  });
});
