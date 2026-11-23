import { describe, it, expect } from 'vitest';
import {
  BEEHIIV_CANONICAL_VAR,
  BEEHIIV_LEGACY_VAR,
  beehiivConfigAlert,
  resolveBeehiivPublicationId,
} from './beehiiv-config.js';
import { BAD, BAD_WITH_PREFIX, GOOD, GOOD_OTHER, leaks } from './beehiiv-test-fixtures.js';

const env = (canonical?: string, legacy?: string) => ({
  ...(canonical === undefined ? {} : { [BEEHIIV_CANONICAL_VAR]: canonical }),
  ...(legacy === undefined ? {} : { [BEEHIIV_LEGACY_VAR]: legacy }),
});

describe('resolveBeehiivPublicationId — which variable supplied the value', () => {
  it('neither set: not configured, nothing to report (a legitimate state)', () => {
    const r = resolveBeehiivPublicationId(env());
    expect(r).toEqual({ configured: false, id: undefined, source: undefined, issues: [] });
  });

  it('set but blank: still not configured', () => {
    const r = resolveBeehiivPublicationId(env('', '   \n'));
    expect(r.configured).toBe(false);
    expect(r.issues).toEqual([]);
  });

  it('only the canonical name set and well formed', () => {
    const r = resolveBeehiivPublicationId(env(GOOD));
    expect(r).toMatchObject({ configured: true, id: GOOD, source: BEEHIIV_CANONICAL_VAR, issues: [] });
  });

  it('only the legacy name set and well formed: works, and says it came from the legacy name', () => {
    const r = resolveBeehiivPublicationId(env(undefined, GOOD));
    expect(r).toMatchObject({ configured: true, id: GOOD, source: BEEHIIV_LEGACY_VAR, issues: [] });
  });

  it('both set and equal: no issue', () => {
    const r = resolveBeehiivPublicationId(env(GOOD, GOOD));
    expect(r).toMatchObject({ id: GOOD, source: BEEHIIV_CANONICAL_VAR, issues: [] });
  });

  it('both well formed but different: canonical wins, and the conflict is an issue naming the loser', () => {
    const r = resolveBeehiivPublicationId(env(GOOD, GOOD_OTHER));
    expect(r.id).toBe(GOOD);
    expect(r.source).toBe(BEEHIIV_CANONICAL_VAR);
    expect(r.issues).toEqual([{ code: 'conflict', blocking: false, variable: BEEHIIV_LEGACY_VAR }]);
  });

  it('canonical malformed, legacy well formed: uses legacy, flags the ignored canonical value', () => {
    const r = resolveBeehiivPublicationId(env(BAD, GOOD));
    expect(r.id).toBe(GOOD);
    expect(r.source).toBe(BEEHIIV_LEGACY_VAR);
    expect(r.issues).toEqual([
      {
        code: 'malformed_ignored',
        blocking: false,
        variable: BEEHIIV_CANONICAL_VAR,
        length: BAD.length,
        hasPubPrefix: false,
      },
    ]);
  });

  it('legacy malformed, canonical well formed: uses canonical, flags the ignored legacy value', () => {
    const r = resolveBeehiivPublicationId(env(GOOD, BAD_WITH_PREFIX));
    expect(r.id).toBe(GOOD);
    expect(r.source).toBe(BEEHIIV_CANONICAL_VAR);
    expect(r.issues).toEqual([
      {
        code: 'malformed_ignored',
        blocking: false,
        variable: BEEHIIV_LEGACY_VAR,
        length: BAD_WITH_PREFIX.length,
        hasPubPrefix: true,
      },
    ]);
  });

  it('only the legacy name set and malformed (the production state): no id, blocking, names the legacy variable', () => {
    const r = resolveBeehiivPublicationId(env(undefined, BAD));
    expect(r.configured).toBe(true);
    expect(r.id).toBeUndefined();
    expect(r.issues).toEqual([
      { code: 'malformed', blocking: true, variable: BEEHIIV_LEGACY_VAR, length: BAD.length, hasPubPrefix: false },
    ]);
  });

  it('only the canonical name set and malformed: blocking, names the canonical variable', () => {
    const r = resolveBeehiivPublicationId(env(BAD_WITH_PREFIX));
    expect(r.id).toBeUndefined();
    expect(r.issues).toEqual([
      {
        code: 'malformed',
        blocking: true,
        variable: BEEHIIV_CANONICAL_VAR,
        length: BAD_WITH_PREFIX.length,
        hasPubPrefix: true,
      },
    ]);
  });

  it('both malformed: both are named', () => {
    const r = resolveBeehiivPublicationId(env(BAD, BAD_WITH_PREFIX));
    expect(r.id).toBeUndefined();
    expect(r.issues.map((i) => [i.code, i.variable])).toEqual([
      ['malformed', BEEHIIV_CANONICAL_VAR],
      ['malformed', BEEHIIV_LEGACY_VAR],
    ]);
  });

  it('a trailing newline or surrounding spaces are trimmed and accepted, with a non-blocking note', () => {
    // The usual cause is `echo "pub_…" | vercel env add`. The intended value is
    // unambiguous, and refusing it would recreate the very outage this fixes.
    for (const padded of [`${GOOD}\n`, `  ${GOOD}  `, `\t${GOOD}\r\n`]) {
      const r = resolveBeehiivPublicationId(env(padded));
      expect(r.id).toBe(GOOD);
      expect(r.source).toBe(BEEHIIV_CANONICAL_VAR);
      expect(r.issues).toEqual([{ code: 'whitespace_trimmed', blocking: false, variable: BEEHIIV_CANONICAL_VAR }]);
    }
  });

  it('whitespace around a malformed value does not rescue it', () => {
    const r = resolveBeehiivPublicationId(env(undefined, `${BAD}\n`));
    expect(r.id).toBeUndefined();
    expect(r.issues[0]).toMatchObject({ code: 'malformed', blocking: true, length: BAD.length });
  });

  it('never carries any part of a malformed value in what it returns', () => {
    for (const e of [env(undefined, BAD), env(BAD, GOOD), env(BAD, BAD_WITH_PREFIX), env(GOOD, BAD_WITH_PREFIX)]) {
      const r = resolveBeehiivPublicationId(e);
      expect(JSON.stringify(r)).not.toContain(BAD);
      expect(leaks(BAD, JSON.stringify(r))).toBe(false);
      expect(leaks(BAD_WITH_PREFIX, JSON.stringify(r))).toBe(false);
    }
  });
});

describe('beehiivConfigAlert — what a person is told', () => {
  it('says nothing when there is nothing to say', () => {
    expect(beehiivConfigAlert(resolveBeehiivPublicationId(env()))).toBeNull();
    expect(beehiivConfigAlert(resolveBeehiivPublicationId(env(GOOD)))).toBeNull();
    expect(beehiivConfigAlert(resolveBeehiivPublicationId(env(undefined, GOOD)))).toBeNull();
  });

  it('a blocking fault is critical, keyed, and names the variable at fault, the one to set, the form and the place', () => {
    const a = beehiivConfigAlert(resolveBeehiivPublicationId(env(undefined, BAD)));
    expect(a).not.toBeNull();
    expect(a!.severity).toBe('critical');
    expect(a!.key).toBe('beehiiv-config:blocked');
    expect(a!.title).toContain('BEEHIIV_PUB_ID');
    expect(a!.body).toContain('BEEHIIV_PUB_ID'); // the variable actually at fault
    expect(a!.body).toContain('BEEHIIV_PUBLICATION_ID'); // the one that should be set
    expect(a!.body).toContain('pub_'); // the expected form
    expect(a!.body).toContain('https://app.beehiiv.com/settings/integrations/api'); // where to find it
    expect(a!.body).toContain(`${BAD.length} characters`);
    expect(a!.body).toMatch(/no pub_ prefix|does not start with pub_/);
    expect(a!.body).toMatch(/no request was sent/i);
  });

  it('when the canonical variable is the one at fault, it does not claim the legacy one is', () => {
    const a = beehiivConfigAlert(resolveBeehiivPublicationId(env(BAD_WITH_PREFIX)));
    expect(a!.title).toContain('BEEHIIV_PUBLICATION_ID');
    expect(a!.title).not.toContain('BEEHIIV_PUB_ID');
    expect(a!.body).toMatch(/starts with pub_/);
  });

  it('contains no fragment of the value', () => {
    for (const e of [env(undefined, BAD), env(BAD_WITH_PREFIX), env(BAD, BAD_WITH_PREFIX), env(GOOD, BAD)]) {
      const a = beehiivConfigAlert(resolveBeehiivPublicationId(e))!;
      const text = `${a.title}\n${a.body}`;
      expect(leaks(BAD, text)).toBe(false);
      expect(leaks(BAD_WITH_PREFIX, text)).toBe(false);
      expect(text).not.toContain(GOOD);
    }
  });

  it('a conflict is a warning that says which value is in use, and which to delete', () => {
    const a = beehiivConfigAlert(resolveBeehiivPublicationId(env(GOOD, GOOD_OTHER)))!;
    expect(a.severity).toBe('warning');
    expect(a.key).toBe('beehiiv-config:advisory');
    expect(a.body).toContain('BEEHIIV_PUBLICATION_ID is being used');
    expect(a.body).toContain('delete BEEHIIV_PUB_ID');
    expect(a.body).not.toContain(GOOD);
    expect(a.body).not.toContain(GOOD_OTHER);
  });

  it('an ignored malformed value is a warning naming the ignored variable', () => {
    const a = beehiivConfigAlert(resolveBeehiivPublicationId(env(BAD, GOOD)))!;
    expect(a.severity).toBe('warning');
    expect(a.key).toBe('beehiiv-config:advisory');
    expect(a.body).toContain('BEEHIIV_PUBLICATION_ID is not a valid');
    expect(a.body).toContain('BEEHIIV_PUB_ID is being used');
    expect(leaks(BAD, a.body)).toBe(false);
  });

  it('whitespace alone does not alert (it is only logged)', () => {
    expect(beehiivConfigAlert(resolveBeehiivPublicationId(env(`${GOOD}\n`)))).toBeNull();
  });

  it('a blocking fault outranks an advisory one in the same run', () => {
    const a = beehiivConfigAlert(resolveBeehiivPublicationId(env(BAD, BAD_WITH_PREFIX)))!;
    expect(a.key).toBe('beehiiv-config:blocked');
    expect(a.body).toContain('BEEHIIV_PUBLICATION_ID');
    expect(a.body).toContain('BEEHIIV_PUB_ID');
  });
});
