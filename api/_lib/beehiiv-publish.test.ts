import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./alert.js', () => ({
  raiseAlert: vi.fn(),
  clearAlert: vi.fn(),
}));

import { raiseAlert, clearAlert } from './alert.js';
import { publishToBeehiiv } from './beehiiv-publish.js';
import { CONFIG_FAULT_ERROR_PREFIX, channelsToAlert } from './delivery-health.js';
import { BAD, BAD_WITH_PREFIX, GOOD, GOOD_OTHER, leaks } from './beehiiv-test-fixtures.js';

const raise = vi.mocked(raiseAlert);
const clear = vi.mocked(clearAlert);

const BRIEF = '## ☕ Good Morning\n\nA calm start.\n\n## Next\n\nMore.';

type LogParams = Parameters<Parameters<typeof publishToBeehiiv>[0]['logDelivery']>[0];

let fetchMock: ReturnType<typeof vi.fn>;
let logged: LogParams[];
let consoleLines: string[];

async function run() {
  await publishToBeehiiv({
    today: '2026-11-16',
    briefText: BRIEF,
    contentHtml: '<p>inner modules</p>',
    logDelivery: async (p) => {
      logged.push(p);
    },
  });
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) vi.stubEnv(k, undefined as unknown as string);
    else vi.stubEnv(k, v);
  }
}

/** Everything a person or a log reader could see from one run. */
function everything(): string {
  return JSON.stringify({ alerts: raise.mock.calls, logged, consoleLines });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  setEnv({ BEEHIIV_API_KEY: 'test-key', BEEHIIV_PUBLICATION_ID: undefined, BEEHIIV_PUB_ID: undefined });
  raise.mockReset();
  clear.mockReset();
  raise.mockResolvedValue({ delivered: true, channel: 'email', detail: 'sent to 1 address(es)' });
  clear.mockResolvedValue({ delivered: false, channel: 'suppressed', detail: 'nothing_to_clear' });
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'post_1' } }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  logged = [];
  consoleLines = [];
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

describe('not configured at all stays silent (someone who does not use beehiiv)', () => {
  it('no API key: nothing sent, logged or alerted, even with a malformed id present', async () => {
    setEnv({ BEEHIIV_API_KEY: undefined, BEEHIIV_PUB_ID: BAD });
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(raise).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
    expect(consoleLines).toEqual([]);
  });

  it('key but no id: nothing sent, logged or alerted', async () => {
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(raise).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
    expect(consoleLines).toEqual([]);
  });
});

describe('a malformed id (the production state: only BEEHIIV_PUB_ID set, and wrong)', () => {
  beforeEach(() => setEnv({ BEEHIIV_PUB_ID: BAD }));

  it('sends no request to beehiiv', async () => {
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('raises one keyed critical alert naming the variable actually at fault and the one to set', async () => {
    await run();
    expect(raise).toHaveBeenCalledTimes(1);
    const alert = raise.mock.calls[0][0];
    expect(alert.key).toBe('beehiiv-config:blocked');
    expect(alert.severity).toBe('critical');
    expect(alert.title).toContain('BEEHIIV_PUB_ID');
    expect(alert.title).not.toContain('BEEHIIV_PUBLICATION_ID');
    expect(alert.body).toContain('BEEHIIV_PUBLICATION_ID');
    expect(alert.body).toContain('pub_');
    expect(alert.body).toContain('https://app.beehiiv.com/settings/integrations/api');
  });

  it('the log line and the delivery row name BEEHIIV_PUB_ID, not the variable that does not exist', async () => {
    await run();
    const lines = consoleLines.join('\n');
    expect(lines).toContain('BEEHIIV_PUB_ID is not a valid beehiiv publication id');
    expect(lines).not.toMatch(/BEEHIIV_PUBLICATION_ID is malformed/);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ channel: 'beehiiv', status: 'failed' });
    expect(logged[0].error).toContain('BEEHIIV_PUB_ID');
  });

  it('no fragment of the value appears in any log line, alert, or delivery row', async () => {
    await run();
    expect(leaks(BAD, everything())).toBe(false);
  });

  it('the same holds for a malformed value that has the pub_ prefix', async () => {
    setEnv({ BEEHIIV_PUB_ID: undefined, BEEHIIV_PUBLICATION_ID: BAD_WITH_PREFIX });
    await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(raise.mock.calls[0][0].title).toContain('BEEHIIV_PUBLICATION_ID');
    expect(leaks(BAD_WITH_PREFIX, everything())).toBe(false);
  });

  it('marks the delivery row as owned by the config alert when a person was told', async () => {
    await run();
    expect(logged[0].error!.startsWith(CONFIG_FAULT_ERROR_PREFIX)).toBe(true);
  });

  it('a standing fault dedups into "suppressed" and the row is still owned by the alert', async () => {
    raise.mockResolvedValue({ delivered: false, channel: 'suppressed', detail: 'ongoing_24h' });
    await run();
    expect(logged[0].error!.startsWith(CONFIG_FAULT_ERROR_PREFIX)).toBe(true);
  });

  it('does NOT mark the row as owned when the alert reached nobody, so the streak alert still backstops it', async () => {
    raise.mockResolvedValue({ delivered: false, channel: 'none', detail: 'RESEND_API_KEY unset' });
    await run();
    expect(logged[0].error!.startsWith(CONFIG_FAULT_ERROR_PREFIX)).toBe(false);
    expect(logged[0].error).toContain('BEEHIIV_PUB_ID');
    const rows = ['2026-11-14', '2026-11-15', '2026-11-16'].map((brief_date) => ({
      channel: 'beehiiv',
      brief_date,
      status: 'failed',
      error: logged[0].error,
    }));
    expect(channelsToAlert(rows).map((c) => c.channel)).toEqual(['beehiiv']);
  });
});

describe('a delivery that FAILED does not count as telling anyone', () => {
  beforeEach(() => setEnv({ BEEHIIV_PUB_ID: BAD }));

  // Resend rejecting the message comes back as channel 'email', delivered
  // false; a failed Discord post likewise. Counting those as told would mark
  // the row config-owned and stand the streak alert down with nobody told.
  it.each([
    ['resend rejected', { delivered: false, channel: 'email', detail: 'resend_500: boom' }],
    ['discord rejected', { delivered: false, channel: 'discord', detail: 'discord_500' }],
    ['nothing configured', { delivered: false, channel: 'none', detail: 'RESEND_API_KEY unset' }],
  ] as const)('%s: the row is unmarked and the streak alert still fires on day 3', async (_label, result) => {
    raise.mockResolvedValue({ ...result });
    await run();
    expect(logged[0].error!.startsWith(CONFIG_FAULT_ERROR_PREFIX)).toBe(false);
    const rows = ['2026-11-14', '2026-11-15', '2026-11-16'].map((brief_date) => ({
      channel: 'beehiiv',
      brief_date,
      status: 'failed',
      error: logged[0].error,
    }));
    expect(channelsToAlert(rows).map((c) => c.channel)).toEqual(['beehiiv']);
  });

  it('a delivered alert marks the row; so does one deduplicated against an earlier delivery', async () => {
    for (const result of [
      { delivered: true, channel: 'email', detail: 'sent to 1 address(es)' },
      { delivered: false, channel: 'suppressed', detail: 'ongoing_24h' },
    ] as const) {
      logged = [];
      raise.mockResolvedValue({ ...result });
      await run();
      expect(logged[0].error!.startsWith(CONFIG_FAULT_ERROR_PREFIX)).toBe(true);
    }
  });
});

describe('the streak alert and the config alert do not double up', () => {
  it('a streak of config-owned failures is left to the config alert', () => {
    const rows = ['2026-11-14', '2026-11-15', '2026-11-16'].map((brief_date) => ({
      channel: 'beehiiv',
      brief_date,
      status: 'failed',
      error: `${CONFIG_FAULT_ERROR_PREFIX} BEEHIIV_PUB_ID is not a valid beehiiv publication id`,
    }));
    expect(channelsToAlert(rows)).toEqual([]);
  });

  it('other channels, and other beehiiv failures, still alert', () => {
    const rows = ['2026-11-14', '2026-11-15', '2026-11-16'].flatMap((brief_date) => [
      { channel: 'beehiiv', brief_date, status: 'failed', error: 'beehiiv 500: upstream' },
      { channel: 'notion', brief_date, status: 'failed', error: 'notion 401: unauthorized' },
    ]);
    expect(channelsToAlert(rows).map((c) => c.channel)).toEqual(['beehiiv', 'notion']);
  });
});

describe('a well formed id', () => {
  it('publishes a draft to that id, and stands down any earlier config alert', async () => {
    setEnv({ BEEHIIV_PUBLICATION_ID: GOOD });
    await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.beehiiv.com/v2/publications/${GOOD}/posts`);
    expect(JSON.parse(init.body)).toMatchObject({ status: 'draft', subtitle: 'A calm start.' });
    expect(raise).not.toHaveBeenCalled();
    expect(clear.mock.calls.map((c) => c[0]).sort()).toEqual(['beehiiv-config:advisory', 'beehiiv-config:blocked']);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ channel: 'beehiiv', status: 'success' });
  });

  it('works from the legacy name alone', async () => {
    setEnv({ BEEHIIV_PUB_ID: GOOD });
    await run();
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.beehiiv.com/v2/publications/${GOOD}/posts`);
    expect(raise).not.toHaveBeenCalled();
  });

  it('trims a trailing newline, sends to the trimmed id, and does not alert', async () => {
    setEnv({ BEEHIIV_PUBLICATION_ID: `${GOOD}\n` });
    await run();
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.beehiiv.com/v2/publications/${GOOD}/posts`);
    expect(raise).not.toHaveBeenCalled();
    expect(consoleLines.join('\n')).toContain('BEEHIIV_PUBLICATION_ID has leading or trailing whitespace');
    expect(consoleLines.join('\n')).not.toContain(GOOD);
  });

  it('both well formed and different: publishes to the canonical id and says so loudly', async () => {
    setEnv({ BEEHIIV_PUBLICATION_ID: GOOD, BEEHIIV_PUB_ID: GOOD_OTHER });
    await run();
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.beehiiv.com/v2/publications/${GOOD}/posts`);
    expect(raise).toHaveBeenCalledTimes(1);
    const alert = raise.mock.calls[0][0];
    expect(alert).toMatchObject({ key: 'beehiiv-config:advisory', severity: 'warning' });
    expect(alert.body).toContain('BEEHIIV_PUBLICATION_ID is being used');
    expect(everything()).not.toContain(GOOD_OTHER);
    // The advisory is live, so only the blocked key is stood down.
    expect(clear.mock.calls.map((c) => c[0])).toEqual(['beehiiv-config:blocked']);
    expect(logged[0].status).toBe('success');
  });

  it('one malformed, one good: publishes with the good one and flags the other without quoting it', async () => {
    setEnv({ BEEHIIV_PUBLICATION_ID: BAD, BEEHIIV_PUB_ID: GOOD });
    await run();
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.beehiiv.com/v2/publications/${GOOD}/posts`);
    expect(raise.mock.calls[0][0].body).toContain('BEEHIIV_PUBLICATION_ID is not a valid');
    expect(leaks(BAD, everything())).toBe(false);
  });
});

describe('beehiiv responses are still handled as before', () => {
  beforeEach(() => setEnv({ BEEHIIV_PUBLICATION_ID: GOOD }));

  it('403 (plan tier) is recorded as partial, not failed', async () => {
    fetchMock.mockResolvedValue(new Response('enterprise only', { status: 403 }));
    await run();
    expect(logged[0]).toMatchObject({ status: 'partial', metadata: { reason: 'enterprise_plan_required' } });
  });

  it('any other error is a failed row, and carries no config marker', async () => {
    fetchMock.mockResolvedValue(new Response('upstream down', { status: 500 }));
    await run();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ status: 'failed' });
    expect(logged[0].error).toContain('beehiiv 500');
    expect(logged[0].error!.startsWith(CONFIG_FAULT_ERROR_PREFIX)).toBe(false);
  });

  it('a network error is a failed row, not a thrown exception', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    await run();
    expect(logged[0]).toMatchObject({ status: 'failed', error: 'socket hang up' });
  });
});
