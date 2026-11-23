import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * /api/status with fetch and the database stubbed and synthetic rows only.
 * Nothing leaves the process.
 */

let queryImpl: () => Promise<unknown[]> = async () => [];
vi.mock('@neondatabase/serverless', () => ({
  neon: () => () => queryImpl(),
}));

import handler from './status.js';

function fakeRes() {
  const state: { status: number; headers: Record<string, string>; body: unknown } = {
    status: 200,
    headers: {},
    body: undefined,
  };
  const res = {
    setHeader(k: string, v: string) {
      state.headers[k] = v;
      return res;
    },
    status(n: number) {
      state.status = n;
      return res;
    },
    end() {
      return res;
    },
    json(b: unknown) {
      state.body = b;
      return res;
    },
  };
  return { res: res as unknown as VercelResponse, state };
}

async function callStatus() {
  const { res, state } = fakeRes();
  const req = { method: 'GET', headers: { host: 'status.example.test' } } as unknown as VercelRequest;
  await handler(req, res);
  return state;
}

const mech = (n: number) => ({
  brief_date: `2026-11-${String(n).padStart(2, '0')}`,
  edition: 'mechanical',
  subject: 'x',
  pending: null,
  kind: 'object',
});

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/none');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('/api/status brief field', () => {
  it('has the documented shape: date, edition, streak — and nothing else', async () => {
    queryImpl = async () => [7, 8, 9, 10, 11, 12, 13, 14, 15].map(mech);
    const { state, body } = await callStatus().then((s) => ({ state: s, body: s.body as Record<string, unknown> }));
    expect(state.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['brief', 'endpoints', 'generatedAt', 'overallHealth']);
    expect(body.brief).toEqual({
      state: 'ok',
      latestDate: '2026-11-15',
      edition: 'mechanical',
      mechanicalStreakDays: 9,
    });
  });

  it('a mechanical streak does NOT change overallHealth: healthy endpoints stay ok at nine days', async () => {
    // Decision: overallHealth answers "are the public endpoints up". A gate
    // refusing a draft is the system working, and anything that pages on
    // overallHealth must not change behaviour by surprise. The streak is its
    // own field and the monitor chooses its own threshold.
    queryImpl = async () => [7, 8, 9, 10, 11, 12, 13, 14, 15].map(mech);
    const body = (await callStatus()).body as { overallHealth: string };
    expect(body.overallHealth).toBe('ok');
  });

  it('and the reverse: a model day does not soften a real endpoint outage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    queryImpl = async () => [
      { brief_date: '2026-11-15', edition: 'model', subject: null, pending: null, kind: 'object' },
    ];
    const body = (await callStatus()).body as { overallHealth: string; brief: { edition: string } };
    expect(body.overallHealth).toBe('down');
    expect(body.brief.edition).toBe('model');
  });

  it('empty table: brief.state is none', async () => {
    queryImpl = async () => [];
    const body = (await callStatus()).body as { brief: unknown };
    expect(body.brief).toEqual({ state: 'none' });
  });

  it('lookup failure degrades gracefully: the health response still returns, brief unknown, no cause leaked', async () => {
    queryImpl = async () => {
      throw new Error('connection refused to db-host.internal.example with password hunter2');
    };
    const { status, body } = await callStatus().then((s) => ({ status: s.status, body: s.body }));
    expect(status).toBe(200);
    const b = body as { overallHealth: string; brief: unknown; endpoints: unknown[] };
    expect(b.brief).toEqual({ state: 'unknown' });
    expect(b.overallHealth).toBe('ok');
    expect(b.endpoints).toHaveLength(3);
    const text = JSON.stringify(body);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('db-host');
  });

  it('a stored row that is not a JSON object reads unknown, not model, and the response is otherwise normal', async () => {
    queryImpl = async () => [
      { brief_date: '2026-11-15', edition: null, subject: null, pending: null, kind: 'string' },
      mech(14),
    ];
    const { status, body } = await callStatus().then((s) => ({ status: s.status, body: s.body }));
    expect(status).toBe(200);
    expect((body as { brief: unknown }).brief).toEqual({ state: 'unknown' });
  });

  it('the query asks the database for the JSON type of each row', async () => {
    // Pins the SQL half of the guard: without jsonb_typeof the TypeScript rule has nothing to read.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'api/status.ts'), 'utf8');
    expect(src).toContain("COALESCE(jsonb_typeof(c), 'null') AS kind");
  });

  it('no database configured: brief unknown, still a normal response', async () => {
    vi.stubEnv('DATABASE_URL', '');
    queryImpl = async () => {
      throw new Error('must not be called');
    };
    const body = (await callStatus()).body as { brief: unknown; overallHealth: string };
    expect(body.brief).toEqual({ state: 'unknown' });
    expect(body.overallHealth).toBe('ok');
  });

  it('exposes no cause text, error bodies or vendor names, even when stored rows carry them', async () => {
    queryImpl = async () => [
      {
        brief_date: '2026-11-15',
        edition: 'mechanical',
        subject: 'ai-failed:400:credit balance too low (Anthropic) — mechanical edition',
        pending: null,
        kind: 'object',
      },
    ];
    const text = JSON.stringify((await callStatus()).body).toLowerCase();
    expect(text).not.toContain('anthropic');
    expect(text).not.toContain('credit');
    expect(text).not.toContain('ai-failed');
    expect(text).not.toContain('subject');
  });
});
