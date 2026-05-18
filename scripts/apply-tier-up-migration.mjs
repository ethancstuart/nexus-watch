#!/usr/bin/env node
/**
 * One-off: apply the tier-up migration via @neondatabase/serverless.
 * Reads DATABASE_URL from .env.local, splits the SQL file into statements,
 * runs each in sequence. IF NOT EXISTS-safe; idempotent.
 *
 * Usage: node scripts/apply-tier-up-migration.mjs
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dep needed)
const envFile = resolve(__dirname, '..', '.env.local');
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const eq = l.indexOf('=');
      if (eq < 0) return null;
      return [l.slice(0, eq), l.slice(eq + 1).replace(/^["']|["']$/g, '')];
    })
    .filter(Boolean),
);

const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const sqlPath = resolve(__dirname, 'migrations', '2026-05-tier-up.sql');
const fullSql = readFileSync(sqlPath, 'utf8');

// Strip line comments, then split on semicolons. Keep COMMENT ON ... statements intact.
const stripped = fullSql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

const statements = stripped
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Applying ${statements.length} statements to ${url.replace(/(:\/\/[^:]+):[^@]+@/, '$1:***@')}…`);

const sql = neon(url);

let ok = 0;
let failed = 0;
for (const [i, stmt] of statements.entries()) {
  const preview = stmt.slice(0, 60).replace(/\s+/g, ' ');
  try {
    await sql.query(stmt);
    console.log(`  [${i + 1}/${statements.length}] OK  ${preview}…`);
    ok++;
  } catch (e) {
    console.error(`  [${i + 1}/${statements.length}] FAIL ${preview}…`);
    console.error(`         ${e.message}`);
    failed++;
  }
}

console.log(`\nDone. ${ok} ok, ${failed} failed.`);

// Sanity-check: confirm key tables exist
const expected = [
  'llm_spend_daily',
  'data_exports',
  'council_runs',
  'council_persona_outputs',
  'forecasts',
  'forecast_backtests',
  'forecast_weights',
  'audio_briefs',
];
const verify = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = ANY(${expected})
  ORDER BY table_name
`;
const present = new Set(verify.map((r) => r.table_name));
console.log('\nVerification:');
for (const t of expected) console.log(`  ${present.has(t) ? '✓' : '✗'} ${t}`);

process.exit(failed > 0 ? 1 : 0);
