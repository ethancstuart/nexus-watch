#!/usr/bin/env node
// Run pending SQL migrations against the Neon database.
// Usage: node scripts/run-migrations.mjs [--dry-run]
// Reads DATABASE_URL from .env.local.
// All migrations are idempotent (IF NOT EXISTS / CREATE OR REPLACE).

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const migrationsDir = join(repoRoot, 'docs/migrations');
const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  const raw = readFileSync(join(repoRoot, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(url);

function splitStatements(source) {
  // Strip line comments, then split on ';' while respecting dollar-quoted blocks
  const out = [];
  let buf = '';
  let dollarTag = null;
  const lines = source.split('\n');
  for (const line of lines) {
    if (!dollarTag && /^\s*--/.test(line)) continue;
    buf += line + '\n';
    // Track dollar tags
    const tagRe = /\$([A-Za-z0-9_]*)\$/g;
    let m;
    while ((m = tagRe.exec(line))) {
      const tag = m[0];
      if (!dollarTag) dollarTag = tag;
      else if (tag === dollarTag) dollarTag = null;
    }
  }
  // Now split on semicolons ignoring those inside dollar-quoted blocks
  const stmts = [];
  let cur = '';
  let tag = null;
  let i = 0;
  while (i < buf.length) {
    const ch = buf[i];
    if (!tag) {
      const rest = buf.slice(i);
      const dm = rest.match(/^\$([A-Za-z0-9_]*)\$/);
      if (dm) {
        tag = dm[0];
        cur += tag;
        i += tag.length;
        continue;
      }
      if (ch === ';') {
        if (cur.trim()) stmts.push(cur.trim());
        cur = '';
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
    } else {
      const rest = buf.slice(i);
      if (rest.startsWith(tag)) {
        cur += tag;
        i += tag.length;
        tag = null;
        continue;
      }
      cur += ch;
      i += 1;
    }
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

// Sort by date prefix + a stable ordering hint. File names that share a date
// prefix are alphabetically sorted, which can put dependent migrations out of
// order (e.g. "data-health-half-open-persistence" before "data-health.sql").
// We give bare "<topic>.sql" files priority over "<topic>-*.sql" suffixes so
// base-table migrations run before ALTERs against them.
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => {
    const baseA = a.replace(/\.sql$/, '');
    const baseB = b.replace(/\.sql$/, '');
    // Shorter names (base tables) before longer ones (alters) when prefixed
    if (baseB.startsWith(baseA + '-')) return -1;
    if (baseA.startsWith(baseB + '-')) return 1;
    return a.localeCompare(b);
  });

console.log(`Found ${files.length} migration files in ${migrationsDir}`);
console.log(`DB host: ${new URL(url).host}`);
if (dryRun) console.log('DRY RUN — no statements will be executed');
console.log('---');

let total = 0;
let ok = 0;
let failed = 0;

for (const file of files) {
  const path = join(migrationsDir, file);
  const source = readFileSync(path, 'utf8');
  const statements = splitStatements(source);
  console.log(`\n▶ ${file}  (${statements.length} statements)`);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 90);
    total++;
    if (dryRun) {
      console.log(`  [dry] ${i + 1}. ${preview}${stmt.length > 90 ? '…' : ''}`);
      ok++;
      continue;
    }
    try {
      await sql.query(stmt);
      console.log(`  ✓ ${i + 1}. ${preview}${stmt.length > 90 ? '…' : ''}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${i + 1}. ${preview}${stmt.length > 90 ? '…' : ''}`);
      console.error(`     ERROR: ${err.message}`);
      failed++;
    }
  }
}

console.log('\n---');
console.log(`Total: ${total}  ok: ${ok}  failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
