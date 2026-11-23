/**
 * ONE name for the beehiiv publication id — and an honest account of which
 * variable actually supplied it.
 *
 * The code read TWO different environment variables for the same value:
 * daily-brief.ts used BEEHIIV_PUB_ID to publish the brief, and subscribe.ts
 * used BEEHIIV_PUBLICATION_ID to sync a new subscriber. Setting one and not
 * the other silently half-worked — the publication would accept subscribers
 * and never receive an issue, or the reverse — and nothing said so. Found by
 * the 2026-09-12 audit while writing the owner's runbook.
 *
 * BEEHIIV_PUBLICATION_ID is canonical because it is the name .env.example
 * documents. BEEHIIV_PUB_ID is still read so an existing deployment does not
 * break the moment this ships.
 *
 * WHY THE RESULT IS A RECORD, NOT A STRING. The first version returned one
 * string, and the publish path then complained about "BEEHIIV_PUBLICATION_ID"
 * and quoted the value's first four characters — while production held the
 * malformed value under BEEHIIV_PUB_ID and had no BEEHIIV_PUBLICATION_ID at
 * all. An owner who looked for the variable the log named found it did not
 * exist, and the fault stood from 2026-07-09 to this change. So this module
 * says which variable is at fault, and it never lets any part of a malformed
 * value out: only its length and whether it starts with `pub_`.
 */
import type { AlertInput } from './alert.js';

/** beehiiv's own documented id shape. A malformed value earns an opaque 400. */
export const BEEHIIV_PUB_ID_RE = /^pub_[0-9a-fA-F-]+$/;

export const BEEHIIV_CANONICAL_VAR = 'BEEHIIV_PUBLICATION_ID';
export const BEEHIIV_LEGACY_VAR = 'BEEHIIV_PUB_ID';
export type BeehiivVar = typeof BEEHIIV_CANONICAL_VAR | typeof BEEHIIV_LEGACY_VAR;

/** Where the owner copies the id from (docs/OWNER-ACTIONS-2026-09-12.md). */
export const BEEHIIV_ID_LOCATION = 'https://app.beehiiv.com/settings/integrations/api';

export const BEEHIIV_ALERT_KEY_BLOCKED = 'beehiiv-config:blocked';
export const BEEHIIV_ALERT_KEY_ADVISORY = 'beehiiv-config:advisory';

export type BeehiivIssueCode =
  /** The value in play is not a publication id. Nothing may be sent. */
  | 'malformed'
  /** A malformed value that is NOT in play because the other variable is good. */
  | 'malformed_ignored'
  /** Both well formed and different; `variable` is the one that loses. */
  | 'conflict'
  /** Leading or trailing whitespace was removed. The value is used. */
  | 'whitespace_trimmed';

export interface BeehiivIssue {
  code: BeehiivIssueCode;
  /** True when no request may be sent because of this issue. */
  blocking: boolean;
  /** The variable at fault (for `conflict`, the one that was not used). */
  variable: BeehiivVar;
  /** Malformed values only: the length and whether it starts with `pub_`. Nothing else about the value. */
  length?: number;
  hasPubPrefix?: boolean;
}

export interface BeehiivIdResolution {
  /** True once any beehiiv id variable holds something. False is a legitimate state: no beehiiv. */
  configured: boolean;
  /** The usable id. Present ONLY when it is well formed — a malformed value never leaves this module. */
  id: string | undefined;
  /** The variable that supplied `id`. */
  source: BeehiivVar | undefined;
  issues: BeehiivIssue[];
}

type Env = Record<string, string | undefined>;

interface Candidate {
  variable: BeehiivVar;
  raw: string;
  value: string;
  trimmed: boolean;
}

function read(env: Env, variable: BeehiivVar): Candidate | null {
  const raw = env[variable];
  if (raw === undefined) return null;
  // Trim, then judge. A trailing newline from `echo … | vercel env add` is by
  // far the likeliest paste fault and the intended value is unambiguous, so
  // we accept it rather than reproduce the outage over an invisible byte.
  const value = raw.trim();
  if (!value) return null;
  return { variable, raw, value, trimmed: value !== raw };
}

const wellFormed = (c: Candidate) => BEEHIIV_PUB_ID_RE.test(c.value);

const malformedIssue = (c: Candidate, code: 'malformed' | 'malformed_ignored'): BeehiivIssue => ({
  code,
  blocking: code === 'malformed',
  variable: c.variable,
  length: c.value.length,
  hasPubPrefix: c.value.startsWith('pub_'),
});

/**
 * Resolve the publication id. SHAPE DECIDES, NAME ONLY BREAKS A TIE: if one
 * variable is well formed and the other is not, the well formed one is used,
 * because the value in production was the malformed one and an owner who fixed
 * the OTHER name would otherwise find the broken one still winning. An
 * independent review caught that. Both well formed and different: canonical
 * wins, and that is reported as an issue rather than decided in silence.
 */
export function resolveBeehiivPublicationId(env: Env = process.env): BeehiivIdResolution {
  const canonical = read(env, BEEHIIV_CANONICAL_VAR);
  const legacy = read(env, BEEHIIV_LEGACY_VAR);
  const present = [canonical, legacy].filter((c): c is Candidate => c !== null);

  if (present.length === 0) return { configured: false, id: undefined, source: undefined, issues: [] };

  const good = present.filter(wellFormed);
  const bad = present.filter((c) => !wellFormed(c));
  const issues: BeehiivIssue[] = [];

  if (good.length === 0) {
    for (const c of bad) issues.push(malformedIssue(c, 'malformed'));
    return { configured: true, id: undefined, source: undefined, issues };
  }

  const chosen = good[0]; // canonical sorts first because it was read first
  for (const c of bad) issues.push(malformedIssue(c, 'malformed_ignored'));
  const other = good[1];
  if (other && other.value !== chosen.value) {
    issues.push({ code: 'conflict', blocking: false, variable: other.variable });
  }
  if (chosen.trimmed) {
    issues.push({ code: 'whitespace_trimmed', blocking: false, variable: chosen.variable });
  }
  return { configured: true, id: chosen.value, source: chosen.variable, issues };
}

/** Whether any issue forbids sending a request. */
export const isBlocked = (r: BeehiivIdResolution): boolean => r.id === undefined && r.issues.some((i) => i.blocking);

const shapeOf = (i: BeehiivIssue): string =>
  `${i.length} characters, ${i.hasPubPrefix ? 'starts with pub_ but is not pub_ followed by hex digits and hyphens' : 'does not start with pub_'}`;

/**
 * One line per issue, safe for the runtime log: variable names, lengths and
 * the prefix flag only. Used by every path that logs, so a log line cannot
 * be written that quotes a value.
 */
export function describeBeehiivIssues(r: BeehiivIdResolution): string[] {
  const using = r.source ?? BEEHIIV_CANONICAL_VAR;
  return r.issues.map((i) => {
    switch (i.code) {
      case 'malformed':
        return `${i.variable} is not a valid beehiiv publication id (${shapeOf(i)})`;
      case 'malformed_ignored':
        return `${i.variable} is not a valid beehiiv publication id (${shapeOf(i)}); ${using} is being used instead`;
      case 'conflict':
        return `${BEEHIIV_CANONICAL_VAR} and ${BEEHIIV_LEGACY_VAR} hold different valid ids; ${using} is being used`;
      case 'whitespace_trimmed':
        return `${i.variable} has leading or trailing whitespace; it was trimmed and used`;
    }
  });
}

const EXPECTED_FORM = `Expected form: pub_ followed by hex digits and hyphens (pub_<uuid>). Copy the Publication ID from ${BEEHIIV_ID_LOCATION}.`;

/**
 * The alert a person receives for a configuration fault, or null when there
 * is nothing worth a person's attention. Pure, so it can be tested without a
 * network, and built from describeBeehiivIssues so it cannot quote a value.
 *
 * Blocking faults are `critical` (the brief is not reaching beehiiv); the
 * rest are `warning`. Two stable keys, so each standing condition is ONE
 * alert plus reminders.
 */
export function beehiivConfigAlert(r: BeehiivIdResolution): AlertInput | null {
  if (isBlocked(r)) {
    const faulty = r.issues.filter((i) => i.blocking).map((i) => i.variable);
    return {
      key: BEEHIIV_ALERT_KEY_BLOCKED,
      severity: 'critical',
      title: `beehiiv publishing is blocked: ${faulty.join(' and ')} ${faulty.length > 1 ? 'are' : 'is'} not a valid publication id`,
      body: [
        'The daily brief is not being published to beehiiv, and new subscribers are not being synced to it. No request was sent.',
        '',
        ...describeBeehiivIssues(r).map((l) => `  • ${l}`),
        '',
        `Set ${BEEHIIV_CANONICAL_VAR} in Vercel (Production) to the correct id and redeploy. If ${BEEHIIV_LEGACY_VAR} also exists, delete it.`,
        EXPECTED_FORM,
      ].join('\n'),
    };
  }

  const advisory = r.issues.filter((i) => i.code === 'malformed_ignored' || i.code === 'conflict');
  if (advisory.length === 0) return null;
  const losers = advisory.map((i) => i.variable);
  return {
    key: BEEHIIV_ALERT_KEY_ADVISORY,
    severity: 'warning',
    title: `beehiiv configuration needs tidying: check ${losers.join(' and ')}`,
    body: [
      'beehiiv publishing is working, but the configuration is ambiguous.',
      '',
      ...describeBeehiivIssues(r)
        .filter((l) => !l.includes('whitespace'))
        .map((l) => `  • ${l}`),
      '',
      `${r.source} is being used. To tidy up, set ${BEEHIIV_CANONICAL_VAR} to the correct id and delete ${BEEHIIV_LEGACY_VAR}, so there is one name and one value.`,
      EXPECTED_FORM,
    ].join('\n'),
  };
}
