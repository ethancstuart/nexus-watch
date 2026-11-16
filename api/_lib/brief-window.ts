/**
 * When a subscriber is due the brief for UTC date D — the send window, as a
 * pure function: no database, no clock of its own.
 *
 * WHY (16 Nov 2026). deliver-briefs used to match subscribers whose local hour
 * was exactly 7 at the moment of the run. The brief for UTC date D only exists
 * from ~10:00Z (daily-brief, `0 10 * * *`), so anyone whose 07:00 falls
 * 00:00Z–09:59Z — the UK, Europe, Africa, the Middle East, South Asia, and
 * every row stored as `UTC` — was matched only in hours with nothing to send,
 * and was never sent anything. An exact-hour match also meant a failed run was
 * never retried.
 *
 * THE RULE. A subscriber's window for D's brief opens at their own 07:00 local
 * that falls within UTC day D and closes at the end of that local day (their
 * next local midnight). The caller adds the rest: the brief exists and is
 * renderable, they have not been sent it, and D's window also closes once the
 * D+1 brief is renderable — deliver-briefs serves the latest brief whose
 * window is open. So a reader whose 07:00 came before the brief existed gets
 * it at the first run after it does; nobody is sent before their 07:00; a
 * missed run is caught up by a later one; nobody gets two briefs on one local
 * date, and no brief is sent after the local day it was meant for.
 *
 * WHY THE LOCAL DAY, NOT THE UTC DAY (review, 15 Nov 2026). Closing at
 * midnight UTC left UTC+8 (Perth, Singapore, Shanghai …, 07:00 = 23:00Z)
 * exactly one run a day: a missed 23:00Z run lost them the day. It also let a
 * catch-up for UTC+1…+7 land after their local midnight, on the same local
 * date as the next day's brief.
 *
 * Offsets come from the runtime's tzdata via Intl, never from a table here, so
 * half-hour and 45-minute zones, UTC+14 to UTC−12 and DST all come for free.
 */

export const DELIVERY_LOCAL_HOUR = 7;

/**
 * What an unusable stored zone is treated as. `UTC` because it is what
 * subscribe.ts already stores for a missing or invalid zone, so a bad row and a
 * zone-less row behave the same: due from 07:00Z, i.e. as soon as the brief
 * exists.
 */
export const FALLBACK_TIME_ZONE = 'UTC';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const formatters = new Map<string, Intl.DateTimeFormat | null>();

/** A formatter for a zone this runtime knows, or null. Never throws. */
function formatterFor(tz: unknown): Intl.DateTimeFormat | null {
  // Same bounds as subscribe.ts's check; the length cap keeps a junk value out
  // of the cache key.
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return null;
  if (formatters.has(tz)) return formatters.get(tz)!;
  let fmt: Intl.DateTimeFormat | null;
  try {
    // Throws RangeError on an unknown zone. That throw IS the check.
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    fmt = null;
  }
  formatters.set(tz, fmt);
  return fmt;
}

/** The stored zone if this runtime knows it, else FALLBACK_TIME_ZONE. */
export function deliveryTimeZone(tz: unknown): string {
  return formatterFor(tz) ? (tz as string) : FALLBACK_TIME_ZONE;
}

/** Local wall-clock time at instant `t`, expressed as if it were UTC ms. */
function wallClock(fmt: Intl.DateTimeFormat, t: number): number {
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(new Date(t))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function offsetAt(fmt: Intl.DateTimeFormat, t: number): number {
  return wallClock(fmt, t) - Math.floor(t / 1000) * 1000;
}

/**
 * The instant the local clock first reads `wall` (wall-clock ms as if UTC).
 * Repeated by a backward change → the first occurrence. Skipped by a forward
 * change → resolved with the offset from before the change, which lands after
 * the jump (later by the size of the gap), never before it. No zone changes
 * at 07:00 in 2026–2027 (the tests check tzdata); since 1970 the only real
 * skips of 07:00 are date-line moves such as Samoa's lost 30 Dec 2011, which
 * the tests cover. This is so a future change does not throw or send early.
 */
function instantOf(fmt: Intl.DateTimeFormat, wall: number): number {
  const before = offsetAt(fmt, wall - DAY_MS);
  const after = offsetAt(fmt, wall + DAY_MS);
  const exact = [...new Set([before, after])]
    .map((o) => wall - o)
    .filter((t) => wallClock(fmt, t) === wall)
    .sort((a, b) => a - b);
  return exact.length > 0 ? exact[0] : wall - before;
}

function utcDayStart(briefDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(briefDate);
  const t = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  // A date that does not round-trip (2026-13-01) is the caller's bug, not
  // subscriber data, so it throws rather than quietly picking a day.
  if (!m || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== briefDate) {
    throw new RangeError(`briefDate must be YYYY-MM-DD, got ${JSON.stringify(briefDate)}`);
  }
  return t;
}

/**
 * The instant of the subscriber's 07:00 local that falls within UTC day
 * `briefDate`. For a fixed offset there is exactly one (UTC+7's is 00:00Z on
 * D itself; east of that it is 07:00 on the next local date). If a DST change
 * ever left none inside D, the latest one before D is used — already passed,
 * so the reader is due as soon as the brief exists; if it left two, the first.
 * An unknown or malformed zone is treated as FALLBACK_TIME_ZONE; never throws
 * on the zone.
 */
export function briefDueAt(timeZone: unknown, briefDate: string): Date {
  const dayStart = utcDayStart(briefDate);
  const fmt = formatterFor(timeZone) ?? formatterFor(FALLBACK_TIME_ZONE)!;
  // Local 07:00 on the local dates D−1, D and D+1 covers every offset from
  // UTC−12 to UTC+14 with room to spare.
  const candidates = [-1, 0, 1].map((k) => instantOf(fmt, dayStart + k * DAY_MS + DELIVERY_LOCAL_HOUR * HOUR_MS));
  const inside = candidates.filter((t) => t >= dayStart && t < dayStart + DAY_MS);
  if (inside.length > 0) return new Date(Math.min(...inside));
  return new Date(Math.max(...candidates.filter((t) => t < dayStart)));
}

/**
 * The end of the subscriber's local day on which `briefDate`'s brief was due:
 * their first local midnight after briefDueAt. Past this the brief is never
 * sent, so at most it is a day late, and never on the next local date.
 */
export function briefWindowCloses(timeZone: unknown, briefDate: string): Date {
  const due = briefDueAt(timeZone, briefDate).getTime();
  const fmt = formatterFor(timeZone) ?? formatterFor(FALLBACK_TIME_ZONE)!;
  const localMidnight = Math.floor(wallClock(fmt, due) / DAY_MS) * DAY_MS + DAY_MS;
  return new Date(instantOf(fmt, localMidnight));
}

/**
 * Rule (c): at `now`, has the subscriber's window for `briefDate` opened and
 * not yet closed? Open from briefDueAt, closed from briefWindowCloses. The
 * caller also closes it once the next day's brief is renderable.
 */
export function isDueForBrief(timeZone: unknown, briefDate: string, now: Date): boolean {
  const t = now.getTime();
  return t >= briefDueAt(timeZone, briefDate).getTime() && t < briefWindowCloses(timeZone, briefDate).getTime();
}
