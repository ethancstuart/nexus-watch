/**
 * Record what the evidence now says about calls already published — without
 * touching one of them. Dry run by default.
 *
 * THE RULE THIS OBEYS. A resolved call is never rewritten. The owner's
 * decision on 2026-09-12 was to ANNOTATE: each affected call keeps the verdict
 * it was published with, and carries the corrected reading beside it in
 * `call_corrections`. This script only ever INSERTs there. It contains no
 * UPDATE against `calls`, and a guard below proves the table is untouched.
 *
 * WHAT IT COMPUTES. For every resolved censorship call, it re-runs the
 * published resolution rule against the evidence table AS IT STANDS NOW and
 * compares the answer with what was published. A disagreement is a correction.
 *
 * CAUSE ATTRIBUTION, derived per call rather than assumed:
 *   final-day-unseen    a blocked day exists on the window's LAST day whose
 *                       evidence row was stored AFTER the verdict was written.
 *                       The resolver could not have seen it.
 *   ooni-hourly-bucket  anything else — the evidence existed at verdict time
 *                       but held one hour of the day instead of the whole of
 *                       it, because the collector never stated time_grain=day.
 *
 * ORDER MATTERS. Run scripts/backfill-ooni-daily.ts --write FIRST. Before the
 * evidence is corrected this script sees the same hourly samples the resolver
 * saw and will under-report.
 *
 * Usage:
 *   npx tsx scripts/record-call-corrections.ts            # dry run
 *   npx tsx scripts/record-call-corrections.ts --write    # after the owner's go
 */
import { neon } from '@neondatabase/serverless';
import { resolveOutcome } from '../api/_lib/calls.js';

interface Row {
  id: number;
  country_code: string;
  made_on: string;
  resolves_on: string;
  threshold: number;
  status: string;
  resolved_at: string;
  blocked_days_now: number;
  late_final_day_block: number;
  evidence_days_now: number;
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  for (const a of process.argv.slice(2)) {
    if (a !== '--write') throw new Error(`unknown argument ${JSON.stringify(a)} — usage: [--write]`);
  }
  const dbUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
  const sql = neon(dbUrl);

  const callsBefore = (await sql`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'hit')::int AS hits
    FROM calls WHERE kind = 'censorship_event' AND status IN ('hit','miss')
  `) as unknown as Array<{ n: number; hits: number }>;

  // One pass. Everything the attribution needs is computed in the database so
  // the numbers in the note are the numbers a reader can reproduce.
  const rows = (await sql`
    SELECT c.id, c.country_code, c.made_on::text AS made_on, c.resolves_on::text AS resolves_on,
           c.threshold, c.status, c.resolved_at::text AS resolved_at,
           (SELECT COUNT(DISTINCT m.measurement_date)::int
              FROM ooni_measurements m
             WHERE m.country_code = c.country_code
               AND m.test_name = 'web_connectivity'
               AND m.confirmed_blocked > 0
               AND m.measurement_date >= c.made_on
               AND m.measurement_date <= c.resolves_on) AS blocked_days_now,
           (SELECT COUNT(*)::int
              FROM ooni_measurements m
             WHERE m.country_code = c.country_code
               AND m.test_name = 'web_connectivity'
               AND m.confirmed_blocked > 0
               AND m.measurement_date = c.resolves_on
               AND m.created_at > c.resolved_at) AS late_final_day_block,
           (SELECT COUNT(DISTINCT m.measurement_date)::int
              FROM ooni_measurements m
             WHERE m.country_code = c.country_code
               AND m.test_name = 'web_connectivity'
               AND m.measurement_date >= c.made_on
               AND m.measurement_date <= c.resolves_on) AS evidence_days_now
      FROM calls c
     WHERE c.kind = 'censorship_event'
       AND c.status IN ('hit','miss')
     ORDER BY c.id
  `) as unknown as Row[];

  const corrections: Array<{ row: Row; cause: string; corrected: string; note: string }> = [];
  for (const r of rows) {
    const outcomeNow = resolveOutcome(r.blocked_days_now, r.threshold);
    const correctedStatus = outcomeNow === 1 ? 'hit' : 'miss';
    if (correctedStatus === r.status) continue;
    const cause = r.late_final_day_block > 0 ? 'final-day-unseen' : 'ooni-hourly-bucket';
    const note =
      cause === 'final-day-unseen'
        ? `Resolved ${r.resolved_at.slice(0, 16)}Z, before OONI had stored any evidence for ${r.resolves_on}, ` +
          `the last day of this call's own window. That day carries a confirmed block. ` +
          `On the full window the evidence now shows ${r.blocked_days_now} blocked day(s) across ` +
          `${r.evidence_days_now} observed day(s), against a threshold of ${r.threshold}.`
        : `The evidence rows for this window held one hour of each day rather than the whole day, ` +
          `because the collector did not state a time grain to OONI. Re-fetched at day grain, the ` +
          `window shows ${r.blocked_days_now} blocked day(s) across ${r.evidence_days_now} observed ` +
          `day(s), against a threshold of ${r.threshold}.`;
    corrections.push({ row: r, cause, corrected: correctedStatus, note });
  }

  const byCause = new Map<string, number>();
  for (const c of corrections) byCause.set(c.cause, (byCause.get(c.cause) ?? 0) + 1);

  console.log(
    `${write ? 'WRITE' : 'DRY RUN'} — ${rows.length} resolved censorship calls re-read against current evidence`,
  );
  console.log(`  published: ${callsBefore[0]?.hits ?? 0} hit of ${callsBefore[0]?.n ?? 0}`);
  console.log(`  corrections found: ${corrections.length}`);
  for (const [cause, n] of [...byCause].sort()) console.log(`    ${cause}: ${n}`);
  const flipToHit = corrections.filter((c) => c.corrected === 'hit').length;
  console.log(`  of those, published MISS but the evidence says HIT: ${flipToHit}`);
  console.log(
    `  corrected reading would be: ${(callsBefore[0]?.hits ?? 0) + flipToHit} hit of ${callsBefore[0]?.n ?? 0}`,
  );
  console.log('');
  for (const c of corrections.slice(0, 80)) {
    console.log(
      `  ${c.row.id} ${c.row.country_code} ${c.row.resolves_on}  ${c.row.status} -> ${c.corrected}  (${c.cause})`,
    );
  }

  if (!write) {
    console.log('\nNothing was written. Re-run with --write to record these corrections.');
    return;
  }

  let inserted = 0;
  for (const c of corrections) {
    await sql`
      INSERT INTO call_corrections (call_id, cause, published_status, corrected_status, evidence_note)
      VALUES (${c.row.id}, ${c.cause}, ${c.row.status}, ${c.corrected}, ${c.note})
      ON CONFLICT (call_id, cause) DO UPDATE SET
        corrected_status = EXCLUDED.corrected_status,
        evidence_note = EXCLUDED.evidence_note
    `;
    inserted++;
  }

  // THE GUARD. This script must never have changed a verdict. Prove it rather
  // than assert it: the same counts, read again after the writes.
  const callsAfter = (await sql`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'hit')::int AS hits
    FROM calls WHERE kind = 'censorship_event' AND status IN ('hit','miss')
  `) as unknown as Array<{ n: number; hits: number }>;
  const same = callsAfter[0]?.n === callsBefore[0]?.n && callsAfter[0]?.hits === callsBefore[0]?.hits;
  console.log(`\nRecorded ${inserted} correction(s).`);
  console.log(
    `Published verdicts unchanged: ${same ? 'CONFIRMED' : 'NO — STOP'} ` +
      `(${callsBefore[0]?.hits}/${callsBefore[0]?.n} before, ${callsAfter[0]?.hits}/${callsAfter[0]?.n} after)`,
  );
  if (!same) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
