import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emailAdmins } from './alert.js';

/**
 * emailAdmins: the email branch of the alarm on its own. It exists for content
 * that must reach the operator and nobody else (the dry-run draft), because
 * deliver() posts to a Discord webhook first whenever one is set. Hermetic:
 * fetch is stubbed and every address is example.test.
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
  vi.stubEnv('DISCORD_APPROVAL_WEBHOOK_URL', WEBHOOK);
  vi.stubEnv('DISCORD_APPROVAL_ENABLED', 'true');
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

describe('emailAdmins: the email branch, never Discord', () => {
  const a = { title: 'DRY RUN, not sent to readers: 2026-11-23', body: `draft ${MARKER}`, severity: 'info' as const };

  it('sends one email to exactly ADMIN_EMAILS, and posts nothing to a configured Discord webhook', async () => {
    const r = await emailAdmins(a);
    expect(r).toMatchObject({ delivered: true, channel: 'email', recipients: 2 });
    expect(fetched().map((f) => f.url)).toEqual(['https://api.resend.com/emails']);
    const sent = JSON.parse(fetched()[0].body);
    expect(sent.to).toEqual([ADMIN_A, ADMIN_B]);
    expect(sent.subject).toBe('[INFO] DRY RUN, not sent to readers: 2026-11-23');
    expect(sent.text).toContain(MARKER);
  });

  it('without a key or without addresses: nothing sent, not delivered, says why', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await emailAdmins(a)).toEqual({ delivered: false, channel: 'none', detail: 'RESEND_API_KEY unset' });
    vi.stubEnv('RESEND_API_KEY', 'synthetic-resend-key');
    vi.stubEnv('ADMIN_EMAILS', ' , ');
    expect(await emailAdmins(a)).toEqual({ delivered: false, channel: 'none', detail: 'ADMIN_EMAILS empty' });
    // Not even then does it fall back to Discord.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a refused or failed send is reported, never thrown', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    expect((await emailAdmins(a)).delivered).toBe(false);
    fetchMock.mockImplementationOnce(() => {
      throw new Error('socket hang up');
    });
    expect(await emailAdmins(a)).toMatchObject({ delivered: false, channel: 'email' });
    expect(fetched().every((f) => f.url !== WEBHOOK)).toBe(true);
  });

  it('logs one line per send, with no address and no body', async () => {
    await emailAdmins(a);
    const lines = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls].map((c) =>
      c.map(String).join(' '),
    );
    expect(lines.filter((l) => l.includes('[alert]'))).toHaveLength(1);
    for (const l of lines) {
      expect(l).not.toContain('example.test');
      expect(l).not.toContain(MARKER);
    }
  });
});
