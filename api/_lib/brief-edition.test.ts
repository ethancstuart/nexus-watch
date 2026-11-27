import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  archiveContent,
  editionFor,
  summariseBriefs,
  lookupBriefStatus,
  MECHANICAL_SUBJECT_MARKER,
  type BriefRow,
} from './brief-edition.js';

/**
 * 2026-11-07 to 11-15: the mechanical edition shipped nine mornings and the
 * archive row said only "success". The edition now travels with the stored
 * content, decided by the flag the handler already has — never by reading the
 * text back.
 */
describe('the edition is written from the flag', () => {
  it('maps the fallback flag to the edition, both ways', () => {
    expect(editionFor(true)).toBe('mechanical');
    expect(editionFor(false)).toBe('model');
  });

  it('stores the edition beside the brief, and keeps the existing fields', () => {
    const briefData = { date: '2026-11-15', utcTime: '10:00 UTC', extra: 1 };
    const mech = archiveContent(briefData, 'text', 'subj', true);
    expect(mech).toMatchObject({
      date: '2026-11-15',
      extra: 1,
      briefText: 'text',
      subject: 'subj',
      edition: 'mechanical',
    });
    const model = archiveContent(briefData, 'text', 'subj', false);
    expect(model.edition).toBe('model');
  });

  it('does not decide by the words: a model brief that mentions "mechanical edition" is still model', () => {
    const c = archiveContent(
      { date: 'd' },
      'We discuss the mechanical edition at length.',
      'About the mechanical edition',
      false,
    );
    expect(c.edition).toBe('model');
  });

  it('cannot be overridden by a stray `edition` key on the brief data', () => {
    const c = archiveContent({ date: 'd', edition: 'model' } as Record<string, unknown>, 't', 's', true);
    expect(c.edition).toBe('mechanical');
  });

  it('is what the handler actually writes: the archive UPDATE goes through archiveContent with onFallback', () => {
    // The handler is too large to run hermetically; pin the wiring in source.
    const src = readFileSync(resolve(process.cwd(), 'api/cron/daily-brief.ts'), 'utf8');
    // CHANGED WITH R1 (the record-only edition): the data beside the edition is
    // chosen by archivedData from the same flag (a mechanical day archives only
    // its record), and the edition is still written by archiveContent from it.
    expect(src).toMatch(
      /SET content = \$\{JSON\.stringify\(\s*archiveContent\(archivedData\(briefData, onFallback\), briefText, subject, onFallback\),?\s*\)\}/,
    );
    expect(src).not.toMatch(/JSON\.stringify\(\{ \.\.\.briefData, briefText, subject \}\)/);
  });
});

// ---------------------------------------------------------------------------
// The streak: how many consecutive days the mechanical edition has shipped.
// Synthetic rows only.
// ---------------------------------------------------------------------------

function day(n: number): string {
  // 2026-11-15 is n=15; no month rollover needed in these fixtures.
  return `2026-11-${String(n).padStart(2, '0')}`;
}
function row(
  n: number,
  edition: string | null,
  subject: string | null = null,
  pending: string | null = null,
  kind = 'object',
): BriefRow {
  return { brief_date: day(n), edition, subject, pending, kind };
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('mechanical streak', () => {
  it('model days only: latest is model, streak 0', () => {
    const rows = range(10, 15).map((n) => row(n, 'model'));
    expect(summariseBriefs(rows)).toEqual({
      state: 'ok',
      latestDate: '2026-11-15',
      edition: 'model',
      mechanicalStreakDays: 0,
    });
  });

  it('one mechanical day after model days: streak 1 (a gate refusing a draft)', () => {
    const rows = [...range(10, 14).map((n) => row(n, 'model')), row(15, 'mechanical')];
    expect(summariseBriefs(rows)).toEqual({
      state: 'ok',
      latestDate: '2026-11-15',
      edition: 'mechanical',
      mechanicalStreakDays: 1,
    });
  });

  it('nine in a row, 7 to 15 November: streak 9', () => {
    const rows = [row(6, 'model'), ...range(7, 15).map((n) => row(n, 'mechanical'))];
    const s = summariseBriefs(rows);
    expect(s).toMatchObject({ state: 'ok', edition: 'mechanical', mechanicalStreakDays: 9 });
  });

  it('a gap in the dates ends the streak: consecutive means consecutive days', () => {
    // 15, 14, 13 mechanical; 12 has no brief at all; 11, 10 mechanical.
    const rows = [10, 11, 13, 14, 15].map((n) => row(n, 'mechanical'));
    expect(summariseBriefs(rows)).toMatchObject({ mechanicalStreakDays: 3 });
  });

  it('a model day ends the streak, whatever came before it', () => {
    const rows = [
      row(11, 'mechanical'),
      row(12, 'mechanical'),
      row(13, 'model'),
      row(14, 'mechanical'),
      row(15, 'mechanical'),
    ];
    expect(summariseBriefs(rows)).toMatchObject({ edition: 'mechanical', mechanicalStreakDays: 2 });
  });

  it('latest is a model day after a long mechanical run: streak back to 0', () => {
    const rows = [...range(7, 14).map((n) => row(n, 'mechanical')), row(15, 'model')];
    expect(summariseBriefs(rows)).toMatchObject({ edition: 'model', mechanicalStreakDays: 0 });
  });

  it('does not depend on the order the rows arrive in', () => {
    const rows = range(7, 15).map((n) => row(n, 'mechanical'));
    expect(summariseBriefs([...rows].reverse())).toEqual(summariseBriefs(rows));
  });

  it('saturates at the size of the window rather than overflowing', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      brief_date: new Date(Date.UTC(2026, 10, 15) - i * 86_400_000).toISOString().slice(0, 10),
      edition: 'mechanical',
      subject: null,
      pending: null,
      kind: 'object',
    }));
    expect(summariseBriefs(rows)).toMatchObject({ mechanicalStreakDays: 30 });
  });

  it('empty table: no briefs, not an error and not "model"', () => {
    expect(summariseBriefs([])).toEqual({ state: 'none' });
  });

  it('a placeholder row still generating is not a shipped brief, and does not break the streak', () => {
    const rows = [row(13, 'mechanical'), row(14, 'mechanical'), row(15, null, null, 'true')];
    expect(summariseBriefs(rows)).toMatchObject({ latestDate: '2026-11-14', mechanicalStreakDays: 2 });
    expect(summariseBriefs([row(15, null, null, 'true')])).toEqual({ state: 'none' });
  });

  it('ignores a row with an unusable date instead of throwing', () => {
    const rows = [
      { brief_date: 'not-a-date', edition: 'mechanical', subject: null, pending: null, kind: 'object' },
      row(15, 'model'),
    ];
    expect(summariseBriefs(rows)).toMatchObject({ latestDate: '2026-11-15', edition: 'model' });
  });
});

describe('content that is not a JSON object cannot be read, so it is unknown, never model', () => {
  // `c ->> 'edition'` is NULL, with no error, for a jsonb scalar (for example
  // double-encoded JSON text). Reading that as "model" would be a falsely
  // reassuring health check.
  it('a scalar as the latest row: unknown', () => {
    expect(summariseBriefs([row(14, 'model'), row(15, null, null, null, 'string')])).toEqual({ state: 'unknown' });
  });

  it('SQL NULL content as the latest row: unknown', () => {
    expect(summariseBriefs([row(15, null, null, null, 'null')])).toEqual({ state: 'unknown' });
  });

  it('a missing kind (the query did not report it) is unknown, not trusted', () => {
    const bad = { brief_date: day(15), edition: 'model', subject: null, pending: null } as unknown as BriefRow;
    expect(summariseBriefs([bad])).toEqual({ state: 'unknown' });
  });

  it('a scalar the streak walk would have to count through: unknown, not a quietly short streak', () => {
    const rows = [row(13, null, null, null, 'array'), row(14, 'mechanical'), row(15, 'mechanical')];
    expect(summariseBriefs(rows)).toEqual({ state: 'unknown' });
  });

  it('a scalar older than a model day or a gap is never consulted', () => {
    const behindModelDay = [
      row(12, null, null, null, 'string'),
      row(13, 'model'),
      row(14, 'mechanical'),
      row(15, 'mechanical'),
    ];
    expect(summariseBriefs(behindModelDay)).toMatchObject({ state: 'ok', mechanicalStreakDays: 2 });
    const behindGap = [row(11, null, null, null, 'string'), row(14, 'mechanical'), row(15, 'mechanical')];
    expect(summariseBriefs(behindGap)).toMatchObject({ state: 'ok', mechanicalStreakDays: 2 });
  });

  it('a placeholder object is still skipped, not unknown', () => {
    expect(summariseBriefs([row(14, 'model'), row(15, null, null, 'true')])).toMatchObject({
      latestDate: '2026-11-14',
    });
  });
});

describe('rows written before the field existed (history only)', () => {
  it('infers mechanical from the stored subject', () => {
    const rows = [
      row(13, null, `The Ledger, unchanged ${MECHANICAL_SUBJECT_MARKER}, 2026-11-13`),
      row(14, null, `97 calls settled, 13 hit — Mechanical Edition, 2026-11-14`),
      row(15, null, `3 calls settled, 1 hit ${MECHANICAL_SUBJECT_MARKER}, 2026-11-15`),
    ];
    expect(summariseBriefs(rows)).toMatchObject({ edition: 'mechanical', mechanicalStreakDays: 3 });
  });

  it('a row with neither field nor a marker reads as model', () => {
    expect(summariseBriefs([row(14, null, 'Sudan tops the register'), row(15, null, null)])).toMatchObject({
      edition: 'model',
      mechanicalStreakDays: 0,
    });
  });

  it('the new field wins over the subject, in both directions', () => {
    // A model brief whose subject happens to mention the phrase is still model.
    expect(summariseBriefs([row(15, 'model', 'Why the mechanical edition shipped nine days')])).toMatchObject({
      edition: 'model',
    });
    // A mechanical row needs no phrase in its subject.
    expect(summariseBriefs([row(15, 'mechanical', 'anything')])).toMatchObject({ edition: 'mechanical' });
  });

  it('an unrecognised field value falls back to the subject rather than being trusted', () => {
    expect(summariseBriefs([row(15, 'bogus', `x ${MECHANICAL_SUBJECT_MARKER}, 2026-11-15`)])).toMatchObject({
      edition: 'mechanical',
    });
  });

  it('mixes old and new rows in one streak', () => {
    const rows = [
      row(13, null, `x ${MECHANICAL_SUBJECT_MARKER}, 2026-11-13`),
      row(14, 'mechanical', null),
      row(15, 'mechanical', null),
    ];
    expect(summariseBriefs(rows)).toMatchObject({ mechanicalStreakDays: 3 });
  });
});

describe('lookupBriefStatus never throws', () => {
  it('returns the summary when the lookup works', async () => {
    const s = await lookupBriefStatus(async () => [row(15, 'model')]);
    expect(s).toMatchObject({ state: 'ok', edition: 'model' });
  });

  it('a rejected lookup is "unknown", not an exception', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await lookupBriefStatus(async () => {
      throw new Error('connection refused');
    });
    expect(s).toEqual({ state: 'unknown' });
    quiet.mockRestore();
  });

  it('a lookup that never answers is "unknown" after the timeout', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await lookupBriefStatus(() => new Promise(() => {}), 20);
    expect(s).toEqual({ state: 'unknown' });
    quiet.mockRestore();
  });

  it('a malformed answer is "unknown"', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await lookupBriefStatus((async () => 'not rows') as unknown as () => Promise<BriefRow[]>);
    expect(s).toEqual({ state: 'unknown' });
    quiet.mockRestore();
  });
});
