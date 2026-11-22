import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { shell, esc, pct } from './_lib/ssr-shell.js';
import { outcomeMarks } from '../src/styles/register-tokens.js';
import { correctedOutcomeOf, isScored } from './_lib/calls.js';
import { standingCorrection } from './_lib/call-correction.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

/**
 * Server-rendered /call/:id — one page per call, the citeable unit.
 *
 * WHY THIS EXISTS. A journalist, a researcher, or anyone checking our work
 * cannot cite "row 47 of a 130-row table". The unit of accountability is one
 * call: what we claimed, at what probability, against which external resolver,
 * with the criterion frozen on the day it was made — and then what happened.
 * This page is that unit, at a stable URL, in real HTML a crawler can read.
 *
 * Everything shown is what the calls row already froze at creation. Nothing is
 * recomputed at render time, because a criterion recomputed at read time is a
 * criterion that can drift — the same reason the resolver reads stored
 * threshold_pct/reference_value instead of re-deriving them.
 */

interface CallRow {
  id: number;
  made_on: string;
  kind: string;
  country_code: string;
  claim: string;
  probability: number;
  horizon_days: number;
  resolves_on: string;
  resolver: string;
  threshold: number;
  threshold_pct: number | null;
  reference_value: number | null;
  base_rate: number | null;
  status: string;
  evidence_count: number | null;
  resolved_at: string | null;
  void_reason: string | null;
}

interface HistoryRow {
  id: number;
  made_on: string;
  probability: number;
  status: string;
  resolves_on: string;
  /** The latest call_corrections reading for this call, or null/absent. */
  corrected_status?: string | null;
}

/**
 * One row of call_corrections (docs/migrations/2026-09-12-call-corrections.sql):
 * what the evidence says now, recorded BESIDE the published verdict.
 */
interface CorrectionRow {
  issued_on: string;
  corrected_status: string;
  evidence_note: string;
}

/** The outcome word a status prints (HIT, MISS, VOID, UNRESOLVABLE), escaped. */
function verdictWord(status: string): string {
  return esc(status.toUpperCase());
}

/**
 * A CORRECTED CALL SAYS SO ON ITS OWN PAGE (independent review, 22 Nov 2026,
 * M3). 54 censorship calls were published as misses that the evidence records
 * as hits (call_corrections, issued 2026-09-13). The ledger showed the
 * correction; this page did not, so a reader arriving from a search result
 * read "MISS" and nothing else. The published verdict stays exactly as it
 * was, and the corrected reading sits beside it, dated, with the evidence.
 *
 * WHETHER a correction is shown is the ledger's rule, reused from
 * standingCorrection (api/_lib/call-correction.ts): the latest row only, and
 * only when correctedOutcomeOf says it changes a scored verdict. The block
 * prints that row's verdict, and the evidence note of every row that reached
 * the same verdict (oldest first), so a call corrected for two causes keeps
 * both notes.
 */
function correctionBlock(published: string, standing: CorrectionRow | null, rowsNewestFirst: CorrectionRow[]): string {
  if (!standing) return '';
  const notes = rowsNewestFirst
    .filter((k) => k.corrected_status === standing.corrected_status)
    .reverse()
    .map((k) => `<p class="lede">${esc(k.evidence_note)}</p>`);
  return [
    `<div class="rule"></div><div class="kicker">Correction · issued ${esc(standing.issued_on)}</div>` +
      `<h2>Published ${verdictWord(published)}; the evidence says ${verdictWord(standing.corrected_status)}</h2>`,
    ...notes,
    '<p class="lede">The verdict below is what we published and we have not rewritten it — ' +
      'the corrected reading sits beside it.</p>',
  ].join('\n');
}

const KIND_LABEL: Record<string, string> = {
  censorship_event: 'Network interference (OONI)',
  fx_devaluation: 'Currency depreciation (FX reference rates)',
};

/** What the resolver will do / did — stated from the frozen fields only. */
function criterion(c: CallRow): string {
  if (c.kind === 'fx_devaluation' && c.threshold_pct !== null && c.reference_value !== null) {
    return (
      `Hit if the currency's peak rate against USD inside the window exceeds the issue-day reference ` +
      `(${c.reference_value}) by at least ${c.threshold_pct}%. Peak, not endpoint: a devaluation that ` +
      `retraces still happened.`
    );
  }
  return (
    `Hit if ${esc(c.resolver)} records at least ${c.threshold} qualifying ` +
    `event${c.threshold === 1 ? '' : 's'} inside the window.`
  );
}

function statusBlock(c: CallRow): string {
  if (c.status === 'pending') {
    return (
      `<div class="stat"><div class="v">OPEN</div><div class="l">not yet resolved</div>` +
      `<div class="d">resolves ${esc(c.resolves_on)}</div>` +
      `<div class="p">resolver: ${esc(c.resolver)}</div></div>`
    );
  }
  if (c.status === 'void') {
    return (
      `<div class="stat"><div class="v">VOID</div><div class="l">withdrawn before resolution</div>` +
      `<div class="d">${esc(c.void_reason ?? 'no reason recorded')}</div>` +
      `<div class="p">voids stay on the page — a deleted call is a moved goalpost</div></div>`
    );
  }
  // Not void: the world, not our criterion, failed to supply the evidence. The
  // reason is recorded in void_reason by the resolver. No mark, no outcome
  // word — a call we could not score is not a forecast we got wrong.
  if (c.status === 'unresolvable') {
    return (
      `<div class="stat"><div class="v wide">UNRESOLVABLE</div>` +
      `<div class="l">not enough evidence to judge either way</div>` +
      `<div class="d">${esc(c.void_reason ?? 'no reason recorded')}</div>` +
      `<div class="p">not scored — excluded from every number we publish</div></div>`
    );
  }
  if (isScored(c.status)) {
    // Word plus shape, never hue (register-tokens.ts outcomeMarks). This used
    // to carry style="color:var(--up|down)"; neither token exists in the shell,
    // so it rendered in ink by accident and would have brought the colour back
    // the day someone defined them.
    return (
      `<div class="stat"><div class="v">${outcomeMark(c.status)}${c.status === 'hit' ? 'HIT' : 'MISS'}</div>` +
      `<div class="l">resolved ${c.resolved_at ? esc(c.resolved_at.slice(0, 10)) : esc(c.resolves_on)}</div>` +
      `<div class="d">${evidenceLine(c.kind, c.evidence_count)}</div>` +
      `<div class="p">resolver: ${esc(c.resolver)}</div></div>`
    );
  }
  // A status this page does not know. It used to fall through to "MISS", so any
  // future status would have published a wrong forecast by default. Assert
  // nothing; SCORED_STATUSES is an allow-list, so it is not scored either.
  return (
    `<div class="stat"><div class="v wide">NO OUTCOME RECORDED</div>` +
    `<div class="l">this call has no hit or miss on record</div>` +
    `<div class="p">not scored</div></div>`
  );
}

/** The shape for a scored outcome; nothing for any other status. */
function outcomeMark(status: string): string {
  const mark = status === 'hit' ? outcomeMarks.hit : status === 'miss' ? outcomeMarks.miss : '';
  return mark ? `<span class="mark" aria-hidden="true">${mark}</span>` : '';
}

/**
 * Evidence, in the units its kind actually measures. "N qualifying events"
 * was written for the censorship resolver and would have described an FX
 * call's 112 BASIS POINTS as "112 qualifying events" — the no-kind-speaks-
 * for-another rule, third appearance this week.
 */
function evidenceLine(kind: string, evidence: number | null): string {
  if (evidence === null) return 'resolved on the stored criterion';
  if (kind === 'fx_devaluation') return `peak depreciation ${(evidence / 100).toFixed(2)}% (stored as basis points)`;
  if (kind === 'censorship_event') return `${evidence} day${evidence === 1 ? '' : 's'} with a confirmed block`;
  return `${evidence} qualifying event${evidence === 1 ? '' : 's'} recorded`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('method_not_allowed');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const idRaw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = Number.parseInt(idRaw ?? '', 10);
  if (!Number.isInteger(id) || id <= 0 || String(id) !== idRaw) {
    return res.status(404).send(
      shell('<h1>No such call</h1><p class="lede">Call ids are integers from <a href="/ledger">the ledger</a>.</p>', {
        title: 'No such call — NexusWatch',
        description: 'This call id does not exist.',
        canonicalPath: '/ledger',
      }),
    );
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send('database_not_configured');
  }

  try {
    const sql = neon(dbUrl);
    const rows = (await sql`
      SELECT id, made_on::text AS made_on, kind, country_code, claim,
             probability::float AS probability, horizon_days, resolves_on::text AS resolves_on,
             resolver, threshold, threshold_pct::float AS threshold_pct,
             reference_value::float AS reference_value, base_rate::float AS base_rate,
             status, evidence_count, resolved_at::text AS resolved_at, void_reason
      FROM calls WHERE id = ${id}
    `) as unknown as CallRow[];

    if (rows.length === 0) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(404).send(
        shell(
          '<h1>No such call</h1><p class="lede">Nothing was ever recorded under this id. The full book is on <a href="/ledger">the ledger</a>.</p>',
          {
            title: 'No such call — NexusWatch',
            description: 'This call id does not exist.',
            canonicalPath: '/ledger',
          },
        ),
      );
    }
    const c = rows[0];

    // An open call can resolve any day; a resolved one is immutable.
    res.setHeader(
      'Cache-Control',
      c.status === 'pending' ? 'public, max-age=300, s-maxage=900' : 'public, max-age=3600, s-maxage=86400',
    );

    // Read directly, as /ledger reads it: if this fails the page fails, rather
    // than showing a verdict without the correction recorded beside it.
    // Newest first, for standingCorrection.
    const corrections = (await sql`
      SELECT issued_on::text AS issued_on, corrected_status, evidence_note
      FROM call_corrections WHERE call_id = ${id}
      ORDER BY issued_on DESC, id DESC
    `) as unknown as CorrectionRow[];
    const standing = standingCorrection(c.status, corrections);

    // DISTINCT ON (call_id): one reading per call, as the ledger scores it.
    const history = (await sql`
      SELECT id, made_on::text AS made_on, probability::float AS probability,
             status, resolves_on::text AS resolves_on, cc.corrected_status
      FROM calls
      LEFT JOIN (
        SELECT DISTINCT ON (call_id) call_id, corrected_status
        FROM call_corrections ORDER BY call_id, issued_on DESC
      ) cc ON cc.call_id = calls.id
      WHERE country_code = ${c.country_code} AND kind = ${c.kind} AND id <> ${id}
      ORDER BY made_on DESC LIMIT 20
    `) as unknown as HistoryRow[];

    const kindLabel = KIND_LABEL[c.kind] ?? c.kind;
    const divergence = c.base_rate === null ? null : Math.round((c.probability - c.base_rate) * 100);

    // Above the record it corrects, as on /ledger. Empty for an uncorrected call.
    const correction = correctionBlock(c.status, standing, corrections);

    const parts: string[] = [];
    parts.push(
      `<div class="rule"></div><div class="kicker">Call #${c.id} · ${esc(c.country_code)} · ${esc(kindLabel)}</div>`,
    );
    parts.push(`<h1>${esc(c.claim)}</h1>`);
    parts.push(
      `<p class="lede">Made ${esc(c.made_on)}, resolving ${esc(c.resolves_on)} — a ${c.horizon_days}-day window, ` +
        `fixed before the outcome was known. Every field on this page was frozen when the call was made` +
        // The correction was not: it is dated, and it is the one exception.
        `${correction ? ', except the dated correction below' : ''}.</p>`,
    );
    if (correction) parts.push(correction);

    parts.push('<div class="grid">');
    parts.push(
      `<div class="stat"><div class="v">${pct(c.probability)}</div><div class="l">what we said</div>` +
        `<div class="d">stated on ${esc(c.made_on)}, before the window opened</div>` +
        `<div class="p">calls table · probability</div></div>`,
    );
    if (c.base_rate !== null) {
      parts.push(
        `<div class="stat"><div class="v">${pct(c.base_rate)}</div><div class="l">how often it happens anyway</div>` +
          `<div class="d">${esc(c.country_code)}'s own base rate at issue` +
          `${divergence !== null ? ` — we sit ${divergence >= 0 ? '+' : ''}${divergence}pts from it` : ''}</div>` +
          `<div class="p">calls table · base rate</div></div>`,
      );
    }
    parts.push(statusBlock(c));
    parts.push('</div>');

    parts.push('<div class="rule"></div><div class="kicker">The criterion</div><h2>Frozen at issue</h2>');
    parts.push(`<p class="lede">${criterion(c)}</p>`);
    parts.push(
      `<p class="lede">The resolver is external — ${esc(c.resolver)} — and the daily snapshot of this call in ` +
        `<a href="https://github.com/ethancstuart/nexus-watch/tree/main/ledger-snapshots">ledger-snapshots/</a> ` +
        `carries GitHub's timestamps. Diff any two dated files to verify nothing above moved after ${esc(c.made_on)}.</p>`,
    );

    if (history.length > 0) {
      parts.push(
        `<div class="rule"></div><div class="kicker">History</div><h2>Every ${esc(c.country_code)} ${esc(kindLabel.split(' ')[0].toLowerCase())} call</h2>`,
      );
      for (const h of history) {
        const state = isScored(h.status)
          ? h.status
          : h.status === 'pending' || h.status === 'void'
            ? 'pending'
            : 'unscored';
        // Only hit and miss may print an outcome word. This used to be
        // `h.status.toUpperCase()` for everything else, which put the raw
        // status in the public record (and "UNRESOLVABLE" beside a probability
        // reads as a result).
        const trail =
          h.status === 'pending'
            ? `${pct(h.probability)} · resolves ${esc(h.resolves_on)}`
            : h.status === 'void'
              ? 'VOID'
              : h.status === 'unresolvable'
                ? 'UNRESOLVABLE'
                : isScored(h.status)
                  ? `said ${pct(h.probability)} · ${outcomeMark(h.status)}${h.status.toUpperCase()}` +
                    // The ledger's marker, for a verdict the evidence has since
                    // changed: the latest reading (the query's DISTINCT ON), by
                    // correctedOutcomeOf, as the call's own page decides it.
                    (correctedOutcomeOf(h.status, h.corrected_status ?? null) !== undefined ? ' · CORRECTED' : '')
                  : 'NO OUTCOME RECORDED';
        parts.push(
          `<a class="row ${state}" href="/call/${h.id}"><span class="lead">${esc(h.made_on)}</span>` +
            `<span class="det">call #${h.id}</span><span class="trail">${trail}</span></a>`,
        );
      }
    }

    parts.push(
      `<p class="foot"><a href="/ledger">← The full ledger</a> · ` +
        `<a href="/api/calls/ledger">the same data as JSON</a></p>`,
    );

    const title = `${c.country_code}: ${c.claim} — Call #${c.id} · NexusWatch`;
    const description =
      `NexusWatch said ${pct(c.probability)} on ${c.made_on}, resolving ${c.resolves_on} against ${c.resolver}. ` +
      (c.status === 'pending'
        ? 'Still open.'
        : c.status === 'void'
          ? 'Voided before resolution.'
          : c.status === 'unresolvable'
            ? 'Could not be resolved on the evidence available; not scored.'
            : isScored(c.status)
              ? `Result: ${c.status.toUpperCase()}.`
              : 'No outcome recorded; not scored.');
    // The search snippet carries the correction too: the published result
    // stays, and the corrected reading follows it.
    const describedWithCorrection = standing
      ? `${description} Corrected ${standing.issued_on}: the evidence says ${standing.corrected_status.toUpperCase()}.`
      : description;

    // The unfurl card. /call/:id is the citeable unit — the thing a journalist
    // pastes into a post — and it previously declared a large twitter card
    // with no image, which unfurls to nothing. The card renders the claim, the
    // stated probability and the resolution date off this same row.
    const ogImage = `https://nexuswatch.dev/api/og?type=call&id=${c.id}`;

    return res.status(200).send(
      shell(parts.join('\n'), {
        title,
        description: describedWithCorrection,
        canonicalPath: `/call/${c.id}`,
        ogImage,
      }),
    );
  } catch (err) {
    console.error('[call] failed:', err instanceof Error ? err.message : err);
    // The long cache header for a resolved call is set before the corrections
    // and history reads; a failure after it must not be cached with it.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send('call_unavailable');
  }
}
