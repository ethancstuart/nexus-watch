import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./_lib/alert.js', () => ({ raiseAlert: vi.fn(), clearAlert: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neon: vi.fn() }));

import { raiseAlert } from './_lib/alert.js';
import { syncBeehiiv } from './subscribe.js';
import { BAD, BAD_WITH_PREFIX, GOOD, GOOD_OTHER, leaks } from './_lib/beehiiv-test-fixtures.js';

let fetchMock: ReturnType<typeof vi.fn>;
let consoleLines: string[];

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v as string);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  setEnv({ BEEHIIV_API_KEY: 'test-key', BEEHIIV_PUBLICATION_ID: undefined, BEEHIIV_PUB_ID: undefined });
  vi.mocked(raiseAlert).mockReset();
  fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
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

describe('syncBeehiiv (subscribe path)', () => {
  it('a malformed id sends no request, never alerts, and logs no part of the value', async () => {
    setEnv({ BEEHIIV_PUB_ID: BAD });
    await syncBeehiiv('reader@example.test', 'landing');
    await syncBeehiiv('reader2@example.test', 'landing'); // a second sign-up
    expect(fetchMock).not.toHaveBeenCalled();
    expect(raiseAlert).not.toHaveBeenCalled();
    const lines = consoleLines.join('\n');
    expect(lines).toContain('BEEHIIV_PUB_ID is not a valid beehiiv publication id');
    expect(lines).not.toMatch(/BEEHIIV_PUBLICATION_ID is malformed/);
    expect(leaks(BAD, lines)).toBe(false);
  });

  it('a malformed id with the pub_ prefix is also refused, and the canonical variable is the one named', async () => {
    setEnv({ BEEHIIV_PUBLICATION_ID: BAD_WITH_PREFIX });
    await syncBeehiiv('reader@example.test', 'landing');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleLines.join('\n')).toContain('BEEHIIV_PUBLICATION_ID is not a valid');
    expect(leaks(BAD_WITH_PREFIX, consoleLines.join('\n'))).toBe(false);
  });

  it('not configured (no key, or no id) is silent and sends nothing', async () => {
    await syncBeehiiv('reader@example.test', 'landing'); // key, no id
    setEnv({ BEEHIIV_API_KEY: undefined, BEEHIIV_PUB_ID: BAD });
    await syncBeehiiv('reader@example.test', 'landing'); // id, no key
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleLines).toEqual([]);
    expect(raiseAlert).not.toHaveBeenCalled();
  });

  it('a well formed id sends the subscription to that id, with no alert', async () => {
    setEnv({ BEEHIIV_PUBLICATION_ID: GOOD });
    await syncBeehiiv('Reader@Example.test ', 'landing');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.beehiiv.com/v2/publications/${GOOD}/subscriptions`);
    expect(JSON.parse(init.body)).toMatchObject({ email: 'reader@example.test', reactivate_existing: true });
    expect(raiseAlert).not.toHaveBeenCalled();
  });

  it('uses the same id the publish path would (canonical wins a conflict), and a trimmed one', async () => {
    setEnv({ BEEHIIV_PUBLICATION_ID: `${GOOD}\n`, BEEHIIV_PUB_ID: GOOD_OTHER });
    await syncBeehiiv('reader@example.test', 'landing');
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.beehiiv.com/v2/publications/${GOOD}/subscriptions`);
    expect(raiseAlert).not.toHaveBeenCalled();
  });

  it('a good id from the legacy name still works while the canonical one is malformed', async () => {
    setEnv({ BEEHIIV_PUBLICATION_ID: BAD, BEEHIIV_PUB_ID: GOOD });
    await syncBeehiiv('reader@example.test', 'landing');
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.beehiiv.com/v2/publications/${GOOD}/subscriptions`);
  });
});
