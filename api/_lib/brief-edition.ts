/**
 * Which edition of the brief shipped, recorded with the brief.
 *
 * WHY. From 2026-11-07 to 11-15 the daily brief shipped as the mechanical
 * edition nine mornings running, and the archive row said "success" every day.
 * Nothing outside the owner's inbox recorded which edition went out, so a
 * monitor polling public endpoints could not see it.
 *
 * The edition is decided by the flag the handler already holds (`onFallback`,
 * true when the model's draft did not ship) and is never inferred from the
 * text: a model brief may well discuss the mechanical edition.
 */

export type BriefEdition = 'model' | 'mechanical';

export function editionFor(onFallback: boolean): BriefEdition {
  return onFallback ? 'mechanical' : 'model';
}

/**
 * The JSON stored in `daily_briefs.content`. Rows written before 2026-11-16
 * have no `edition` field; readers must treat it as optional.
 */
export function archiveContent<T extends object>(
  briefData: T,
  briefText: string,
  subject: string | null,
  onFallback: boolean,
): T & { briefText: string; subject: string | null; edition: BriefEdition } {
  // `edition` goes last so nothing in briefData can override the flag.
  return { ...briefData, briefText, subject, edition: editionFor(onFallback) };
}

// ---------------------------------------------------------------------------
// Reading it back: the public `brief` object on /api/status.
// ---------------------------------------------------------------------------

/** One archive row, reduced to what the streak needs. */
export interface BriefRow {
  /** YYYY-MM-DD. Select it `::text` so the driver does not hand back a Date. */
  brief_date: string;
  /** `content.edition`; null on rows written before the field existed. */
  edition: string | null;
  /** `content.subject`; used only to infer the edition of those older rows. */
  subject: string | null;
  /** `content.pending`: 'true' on the placeholder row of a run still generating. */
  pending: string | null;
  /**
   * `jsonb_typeof(content)`: 'object' for a readable row. Anything else (a
   * scalar from double-encoded text, an array, 'null') makes `->>` return NULL
   * WITHOUT an error, which would read as an ordinary model day. Required, not
   * optional: a query that forgets to report it must not be trusted.
   */
  kind: string | null;
}

export type BriefStatus =
  | { state: 'ok'; latestDate: string; edition: BriefEdition; mechanicalStreakDays: number }
  /** The table has no shipped brief. */
  | { state: 'none' }
  /** The lookup failed or timed out. Says nothing about the brief. */
  | { state: 'unknown' };

/** The wording fallbackSubject puts in every mechanical subject. */
export const MECHANICAL_SUBJECT_MARKER = 'mechanical edition';

/** How many recent rows the endpoint reads; the streak cannot exceed this. */
export const BRIEF_STATUS_WINDOW = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function editionOfRow(row: BriefRow): BriefEdition | 'unknown' {
  if (row.kind !== 'object') return 'unknown';
  if (row.edition === 'model' || row.edition === 'mechanical') return row.edition;
  // HISTORY ONLY. Rows archived before the `edition` field existed carry no
  // flag, so the best available evidence is the subject, which
  // fallbackSubject() always words with "mechanical edition". That is a string
  // inference and is trusted for no row that has the field.
  return (row.subject ?? '').toLowerCase().includes(MECHANICAL_SUBJECT_MARKER) ? 'mechanical' : 'model';
}

/**
 * The latest brief's date and edition, and how many consecutive calendar days
 * the mechanical edition has shipped, from recent archive rows.
 *
 * Pure. The streak runs back from the latest shipped brief and stops at the
 * first model day OR the first missing date: a day with no brief at all is a
 * different problem and is not counted as one more mechanical day. Placeholder
 * rows (a run still generating, or one that died) are not shipped briefs and
 * are skipped without breaking anything. A row whose content is not a JSON
 * object cannot be read: if the answer depends on it the result is 'unknown',
 * never a quiet 'model'.
 */
export function summariseBriefs(rows: BriefRow[]): BriefStatus {
  const shipped = rows
    .filter((r) => r.pending !== 'true' && DATE_RE.test(r.brief_date) && !Number.isNaN(dayNumber(r.brief_date)))
    .sort((a, b) => (a.brief_date < b.brief_date ? 1 : a.brief_date > b.brief_date ? -1 : 0));
  const latest = shipped[0];
  if (!latest) return { state: 'none' };

  const edition = editionOfRow(latest);
  if (edition === 'unknown') return { state: 'unknown' };
  let streak = 0;
  if (edition === 'mechanical') {
    let expected = dayNumber(latest.brief_date);
    for (const r of shipped) {
      if (dayNumber(r.brief_date) !== expected) break;
      const e = editionOfRow(r);
      // A row the streak has to count through but cannot read: say so, rather
      // than report a quietly shorter streak. Rows behind a model day or a gap
      // are never reached, so an old bad row does not poison today's answer.
      if (e === 'unknown') return { state: 'unknown' };
      if (e !== 'mechanical') break;
      streak++;
      expected--;
    }
  }
  return { state: 'ok', latestDate: latest.brief_date, edition, mechanicalStreakDays: streak };
}

/**
 * Run the lookup and summarise it. NEVER throws and never waits longer than
 * `timeoutMs`: the health response must still return when the database is
 * slow or down, with the brief marked unknown. The cause is logged here, in
 * the runtime log, and is not part of the public result.
 */
export async function lookupBriefStatus(fetchRows: () => Promise<BriefRow[]>, timeoutMs = 4000): Promise<BriefStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('brief lookup timed out')), timeoutMs);
    });
    const rows = await Promise.race([fetchRows(), timeout]);
    if (!Array.isArray(rows)) throw new Error('brief lookup returned a non-array');
    return summariseBriefs(rows);
  } catch (err) {
    console.error('[status] brief lookup failed:', err instanceof Error ? err.message : String(err));
    return { state: 'unknown' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
