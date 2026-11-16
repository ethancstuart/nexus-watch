import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * THE GUARD MUST FAIL ON THE PATTERN THAT WAS ONLY WARNED ABOUT.
 *
 * Until now check-cron-auth.ts sorted a handler with its own inline
 * CRON_SECRET check into a "legacy idiom" tier: a warning, exit 0. Thirteen
 * handlers sat there while `if (cronSecret && header !== …)` let every request
 * through whenever the secret was unset, and CI stayed green. It printed
 * "OK — 17 scheduled endpoint(s) authenticate (13 via the legacy idiom)".
 *
 * These run the real script against a fixture repo (it reads vercel.json and
 * handlers from process.cwd()), so the exit code and the message are what CI
 * sees. Synthetic files only.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'check-cron-auth.ts');
const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');

const GOOD = `import { requireCron } from '../_cron-utils.js';
export default async function handler(req, res) {
  if (!requireCron(req, res)) return;
  res.status(200).json({ ok: true });
}
`;

// One file per way a handler has been seen to get this wrong.
const BAD: Record<string, string> = {
  // The fail-open idiom from cost-summary, cache-warm, cron-health, deliver-briefs.
  'inline-and-secret': `export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (cronSecret && authHeader !== \`Bearer \${cronSecret}\`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.status(200).json({ ok: true });
}
`,
  // cii-snapshot's block form of the same thing.
  'inline-block': `export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization?.replace('Bearer ', '');
    if (auth !== cronSecret) return res.status(401).json({ error: 'unauthorized' });
  }
  res.status(200).json({ ok: true });
}
`,
  // The eight source-* / *-calls handlers: undefined !== undefined is false, and ?token= is accepted.
  'inline-token': `export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  res.status(200).json({ ok: true });
}
`,
  // Named in a comment only.
  'comment-only': `// TODO: call requireCron(req, res) here
export default async function handler(req, res) {
  res.status(200).json({ ok: true });
}
`,
  // Called, result ignored: decorative, like compute-cii's old discarded comparison.
  'result-ignored': `import { requireCron } from '../_cron-utils.js';
export default async function handler(req, res) {
  requireCron(req, res);
  res.status(200).json({ ok: true });
}
`,
  // Nothing at all.
  'no-auth': `export default async function handler(req, res) {
  res.status(200).json({ ok: true });
}
`,
  // The gated form exists, but a GET (or a non-POST) never reaches it.
  'nested-in-method-check': `import { requireCron } from '../_cron-utils.js';
export default async function handler(req, res) {
  if (req.method === 'POST') {
    if (!requireCron(req, res)) return;
  }
  res.status(200).json({ ok: true });
}
`,
  // Work has already been done by the time the request is refused.
  'after-await': `import { requireCron } from '../_cron-utils.js';
export default async function handler(req, res) {
  await sendEmailToEveryone();
  if (!requireCron(req, res)) return;
  res.status(200).json({ ok: true });
}
`,
  // The gate lives in a helper, and the handler calls the helper only sometimes.
  'helper-called-conditionally': `import { requireCron } from '../_cron-utils.js';
function guard(req, res) {
  if (!requireCron(req, res)) return false;
  return true;
}
export default async function handler(req, res) {
  if (req.method === 'POST' && !guard(req, res)) return;
  res.status(200).json({ ok: true });
}
`,
  // The gate is in a helper that nothing calls.
  'helper-never-called': `import { requireCron } from '../_cron-utils.js';
function unusedGuard(req, res) {
  if (!requireCron(req, res)) return;
}
export default async function handler(req, res) {
  res.status(200).json({ ok: true });
}
`,
  // A side-effecting call before the gate, even without await.
  'after-call': `import { requireCron } from '../_cron-utils.js';
export default async function handler(req, res) {
  const rows = loadEverything();
  if (!requireCron(req, res)) return;
  res.status(200).json({ rows });
}
`,
};

// Good shapes that must keep passing. cron-health reads the clock before the
// gate on purpose (see its comment); that does no I/O, so it is the one
// permitted statement ahead of the call.
const GOOD_VARIANTS: Record<string, string> = {
  'good-comments-first': `import { requireCron } from '../_cron-utils.js';
export default async function handler(req, res) {
  // Vercel cron auth
  /* the first statement, as _cron-utils asks */
  if (!requireCron(req, res)) return;
  res.status(200).json({ ok: true });
}
`,
  'good-clock-first': `import { requireCron } from '../_cron-utils.js';
export default async function handler(req, res) {
  const runStartedAt = new Date();
  if (!requireCron(req, res)) return;
  res.status(200).json({ at: runStartedAt });
}
`,
  'good-typed-params': `import { requireCron } from '../_cron-utils.js';
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireCron(req, res)) return;
  res.status(200).json({ ok: true });
}
`,
};

let root: string;

function writeRepo(handlers: Record<string, string>) {
  mkdirSync(join(root, 'api', 'cron'), { recursive: true });
  const crons = Object.keys(handlers).map((n) => ({ path: `/api/cron/${n}`, schedule: '0 * * * *' }));
  writeFileSync(join(root, 'vercel.json'), JSON.stringify({ crons }));
  for (const [n, src] of Object.entries(handlers)) writeFileSync(join(root, 'api', 'cron', `${n}.ts`), src);
}

function runGuard() {
  const r = spawnSync(TSX, [SCRIPT], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'cron-auth-fixture-'));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('check-cron-auth', () => {
  it('passes when every scheduled handler calls requireCron and returns on refusal', () => {
    rmSync(join(root, 'api'), { recursive: true, force: true });
    writeRepo({ good: GOOD, 'good-braced': GOOD.replace('return;', '{ return; }') });
    const { code, out } = runGuard();
    expect(out).toContain('OK');
    expect(code).toBe(0);
  });

  it('passes the good shapes: comments first, a clock read first, typed parameters', () => {
    rmSync(join(root, 'api'), { recursive: true, force: true });
    writeRepo(GOOD_VARIANTS);
    const { code, out } = runGuard();
    expect(out).toContain('OK');
    expect(code).toBe(0);
  });

  it('says the gate is misplaced, not missing, when it is nested or late', () => {
    rmSync(join(root, 'api'), { recursive: true, force: true });
    writeRepo({ 'after-await': BAD['after-await']! });
    const { out } = runGuard();
    expect(out).toMatch(/first statement/i);
  });

  it('honours a reasoned exemption', () => {
    rmSync(join(root, 'api'), { recursive: true, force: true });
    writeRepo({ open: `// cron-auth-exempt: public read, no side effects\n${BAD['no-auth']}` });
    const { code, out } = runGuard();
    expect(code).toBe(0);
    expect(out).toContain('exempt: /api/cron/open');
  });

  it('FAILS, naming every one of them, on each way a handler can be wrong', () => {
    rmSync(join(root, 'api'), { recursive: true, force: true });
    writeRepo({ good: GOOD, ...BAD });
    const { code, out } = runGuard();
    expect(code).toBe(1);
    for (const name of Object.keys(BAD)) expect(out).toContain(`/api/cron/${name} `);
    expect(out).not.toContain('/api/cron/good ');
  });

  it.each(Object.keys(BAD))('FAILS on %s alone', (name) => {
    rmSync(join(root, 'api'), { recursive: true, force: true });
    writeRepo({ [name]: BAD[name]! });
    const { code } = runGuard();
    expect(code).toBe(1);
  });

  it('says why an inline check fails: it does not fail closed', () => {
    rmSync(join(root, 'api'), { recursive: true, force: true });
    writeRepo({ 'inline-and-secret': BAD['inline-and-secret']! });
    const { out } = runGuard();
    expect(out).toMatch(/CRON_SECRET is unset|fail closed|fails open/i);
  });
});
