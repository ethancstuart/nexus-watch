import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  DEFAULT_BRIEF_MODEL,
  BRIEF_MAX_TOKENS,
  BRIEF_TIMEOUT_MS,
  getBriefModel,
  buildBriefRequest,
  extractBriefText,
} from './brief-model.js';
import { anthropicFamily, estimateAnthropicCost } from './llm-budget.js';

// Same comment stripping as scripts/check-llm-spend.ts, so a source-text assertion
// cannot be satisfied by a commented-out line.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|js|mjs|tsx)$/.test(name) && !/\.test\.(ts|tsx|js)$/.test(name)) out.push(full);
  }
  return out;
}
const codeOf = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

// The id Anthropic is retiring on 30 Nov 2026. Held in one place so the
// guard below can search for it without the test file being the only thing
// that knows how it is spelt.
const RETIRING_ID = ['claude', 'sonnet', '4', '5', '20250929'].join('-');

describe('DEFAULT_BRIEF_MODEL', () => {
  it('is the replacement named on the deprecations page', () => {
    expect(DEFAULT_BRIEF_MODEL).toBe('claude-sonnet-5-5');
  });

  it('is priced as sonnet, not as the unknown-model opus fallback', () => {
    expect(anthropicFamily(DEFAULT_BRIEF_MODEL)).toBe('sonnet');
  });
});

describe('getBriefModel', () => {
  it('returns the default when nothing is set', () => {
    expect(getBriefModel({})).toBe(DEFAULT_BRIEF_MODEL);
  });

  it('honours BRIEF_MODEL, trimmed', () => {
    expect(getBriefModel({ BRIEF_MODEL: '  claude-test-model  ' })).toBe('claude-test-model');
  });

  it('ignores an empty or whitespace-only override', () => {
    expect(getBriefModel({ BRIEF_MODEL: '' })).toBe(DEFAULT_BRIEF_MODEL);
    expect(getBriefModel({ BRIEF_MODEL: '   ' })).toBe(DEFAULT_BRIEF_MODEL);
    expect(getBriefModel({ BRIEF_MODEL: undefined })).toBe(DEFAULT_BRIEF_MODEL);
  });
});

describe('buildBriefRequest', () => {
  const input = { apiKey: 'test-key-not-real', system: 'SYSTEM TEXT', dataContext: 'DATA CONTEXT' };

  it('returns the headers the call has always sent, and no URL for the caller to reuse', () => {
    const req = buildBriefRequest(input, {});
    expect(Object.keys(req).sort()).toEqual(['body', 'headers']);
    expect(req.headers).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': 'test-key-not-real',
      'anthropic-version': '2023-06-01',
    });
  });

  it('builds the request with the default model when nothing is configured', () => {
    expect(buildBriefRequest(input, {}).body.model).toBe(DEFAULT_BRIEF_MODEL);
  });

  it('builds the request with the configured model when BRIEF_MODEL is set', () => {
    expect(buildBriefRequest(input, { BRIEF_MODEL: 'claude-test-model' }).body.model).toBe('claude-test-model');
  });

  it('keeps max_tokens, system and the single user message unchanged', () => {
    const { body } = buildBriefRequest(input, {});
    expect(body.max_tokens).toBe(6000);
    expect(body.system).toBe('SYSTEM TEXT');
    expect(body.messages).toEqual([
      { role: 'user', content: "Generate today's intelligence briefing.\n\nDATA CONTEXT" },
    ]);
    expect(BRIEF_MAX_TOKENS).toBe(6000);
    expect(BRIEF_TIMEOUT_MS).toBe(240000);
  });

  it('sends no sampling parameters (removed in API version 2026-10-21)', () => {
    const body = buildBriefRequest(input, {}).body as unknown as Record<string, unknown>;
    for (const key of ['temperature', 'top_p', 'top_k']) {
      expect(key in body).toBe(false);
    }
  });

  it('turns up-front thinking off on the default model so max_tokens is not spent on it', () => {
    // Sonnet 5.5 thinks by default and max_tokens covers thinking plus text.
    expect(buildBriefRequest(input, {}).body.thinking).toEqual({ type: 'between_tools' });
  });

  it('sends no thinking field to an overridden model, which may reject it', () => {
    // between_tools is documented for Sonnet 5.5 only; an older model would 400.
    expect(buildBriefRequest(input, { BRIEF_MODEL: 'claude-test-model' }).body.thinking).toBeUndefined();
  });

  describe('purity', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('sends nothing: fetch is never called', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      buildBriefRequest(input, {});
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not mutate its input (a deep-frozen input would throw in strict mode)', () => {
      const frozen = Object.freeze({ ...input });
      expect(() => buildBriefRequest(frozen, {})).not.toThrow();
      expect(frozen).toEqual(input);
    });

    it('reads only the env it is given: an ambient BRIEF_MODEL is ignored when env is passed', () => {
      vi.stubEnv('BRIEF_MODEL', 'claude-ambient-model');
      expect(buildBriefRequest(input, {}).body.model).toBe(DEFAULT_BRIEF_MODEL);
      // ...and only the omitted-env default reads process.env, which is how the handler calls it.
      expect(buildBriefRequest(input).body.model).toBe('claude-ambient-model');
    });

    it('returns a fresh object every call, so one request cannot leak into the next', () => {
      const a = buildBriefRequest(input, {});
      const b = buildBriefRequest(input, {});
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
      expect(a.body.messages).not.toBe(b.body.messages);
    });
  });
});

describe('extractBriefText', () => {
  it('reads a plain text response', () => {
    expect(extractBriefText([{ type: 'text', text: 'BRIEF' }])).toBe('BRIEF');
  });

  it('skips a leading thinking block instead of reading content[0].text', () => {
    // Sonnet 5.5 can start a response with an empty thinking block.
    expect(
      extractBriefText([
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: 'BRIEF' },
      ]),
    ).toBe('BRIEF');
  });

  it('joins every text block in order, so a split reply is not cut short', () => {
    expect(
      extractBriefText([
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'FIRST ' },
        { type: 'text', text: 'SECOND' },
      ]),
    ).toBe('FIRST SECOND');
  });

  it('ignores a text-typed block that carries no string', () => {
    expect(extractBriefText([{ type: 'text' }, { type: 'text', text: 'BRIEF' }])).toBe('BRIEF');
  });

  it('returns an empty string when there is no usable text', () => {
    expect(extractBriefText(undefined)).toBe('');
    expect(extractBriefText([])).toBe('');
    expect(extractBriefText([{ type: 'thinking', thinking: '' }])).toBe('');
  });
});

describe('spend record', () => {
  it('prices the default model as sonnet at the published Sonnet 5.5 rates', () => {
    // 1M in + 1M out at $2 / $10 per MTok.
    const cost = estimateAnthropicCost(anthropicFamily(DEFAULT_BRIEF_MODEL), {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(12, 6);
  });

  it('daily-brief.ts records spend under the model it requested, not a second literal', () => {
    const code = codeOf('api/cron/daily-brief.ts');
    expect(code).toMatch(/recordAnthropicSpend\(\s*briefRequest\.body\.model\s*,/);
    expect(code).not.toMatch(/['"`]claude-[a-z]+-\d/);
  });
});

describe('check-llm-spend scope (the guard must stay at least as strong as on main)', () => {
  // scripts/check-llm-spend.ts scopes billed call sites by the host literal in
  // code, then requires a gate and a spend record of each. These tests keep the
  // literal where the call is made and keep every other file out of the business
  // of hiding it. They are a second check beside the guard, not a replacement.
  const HOST = 'api.anthropic.com';

  it('daily-brief.ts keeps the host literal, the gate and the record, in code', () => {
    const code = codeOf('api/cron/daily-brief.ts');
    expect(code).toContain(`fetch('https://${HOST}/v1/messages'`);
    expect(code).toMatch(/checkBudget\(\{\s*endpoint:\s*'daily-brief',\s*bypassCap:\s*true\s*\}\)/);
    expect(code).toMatch(/buildBriefRequest\(/);
  });

  it('brief-model.ts carries no host, no exported URL and no guard exemption', () => {
    const raw = readFileSync(join(process.cwd(), 'api/_lib/brief-model.ts'), 'utf8');
    const code = stripComments(raw);
    expect(code).not.toContain(HOST);
    expect(code).not.toMatch(/export\s+const\s+\w*URL\w*/i);
    expect(raw).not.toMatch(/llm-spend-exempt|llm-budget-gate-exempt/);
  });

  it('the only exemptions in api/ are the ones main already had', () => {
    const offenders = walk(join(process.cwd(), 'api'))
      .filter((f) => /llm-(spend|budget-gate)-exempt:/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f));
    expect(offenders).toEqual(['api/_lib/anthropic-fanout.ts']);
  });
});

describe('retiring model id', () => {
  it('appears nowhere in non-test source', () => {
    const root = process.cwd();
    const hits = ['api', 'src', 'scripts', 'mcp']
      .flatMap((d) => {
        try {
          return walk(join(root, d));
        } catch {
          return [];
        }
      })
      .filter((f) => readFileSync(f, 'utf8').includes(RETIRING_ID))
      .map((f) => relative(root, f));
    expect(hits).toEqual([]);
  });
});
