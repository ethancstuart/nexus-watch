import { describe, it, expect, beforeEach } from 'vitest';
import vercelJson from '../../vercel.json?raw';
import { renderMethodology } from './methodology.ts';

/**
 * /methodology said "Nothing else is read" while the daily brief fetched WHO
 * outbreak news, GDELT, market quotes and about sixteen news feeds, and it kept
 * an older second sources table (ACLED, IODA, "every 5 min") beside the new one.
 *
 * Two kinds of assertion here:
 *  1. Retired text stays gone.
 *  2. A guard that reads the cron code: every outside host the register's
 *     collectors, the resolver or the brief fetch must be either named on the
 *     page or on an explicit list of hosts that are not data sources. A new
 *     fetch to an unlisted host fails this test until someone decides which.
 *     It reads quoted URL literals only, so a URL assembled at run time would
 *     escape it. It also reads only the files globbed below: a host reached
 *     through some other helper is not seen.
 *  3. The reverse, for the brief: every brief-only source the page names must
 *     still be fetched by daily-brief.ts, so the page cannot keep describing a
 *     source that was dropped. The register side has no reverse check.
 */

// Raw source text via Vite, so this file needs no Node types. The glob picks up
// every source-*.ts collector, so a new collector is covered without editing this.
const registerSources = import.meta.glob<string>(
  [
    '../../api/cron/source-*.ts',
    '!../../api/cron/*.test.ts',
    '../../api/cron/resolve-calls.ts',
    '../../api/cron/record-calls.ts',
    // The resolver's USGS host comes in through this helper, not its own source.
    '../../api/_lib/seismicity.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);
const dailyBriefSrc = Object.values(
  import.meta.glob<string>('../../api/cron/daily-brief.ts', { query: '?raw', import: 'default', eager: true }),
)[0]!;

/** Hosts inside quoted URL literals, e.g. 'https://api.ooni.io/...'. */
function hostsIn(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(/['"`]https?:\/\/([a-z0-9.-]+)/gi)) out.add(m[1]!.toLowerCase());
  return [...out].sort();
}

// Host -> the word the page must contain for it.
const REGISTER_HOSTS: Record<string, string> = {
  'api.ooni.io': 'OONI',
  'open.er-api.com': 'Exchange-rate',
  'earthquake.usgs.gov': 'USGS',
  'ucdp.uu.se': 'UCDP',
  'sanctionslistservice.ofac.treas.gov': 'OFAC',
  'scsanctions.un.org': 'UN consolidated',
  'api.worldbank.org': 'World Bank',
  'www.wikimedia.org': 'Wikipedia',
  'wikimedia.org': 'Wikipedia',
};
const BRIEF_ONLY_HOSTS: Record<string, string> = {
  'www.who.int': 'WHO',
  'api.gdeltproject.org': 'GDELT',
  'api.twelvedata.com': 'market quotes',
};
// Outbound services the brief sends to, not data it reads (and our own host, skipped below).
const NOT_DATA_SOURCES = new Set(['api.anthropic.com', 'api.beehiiv.com', 'api.notion.com', 'api.resend.com']);

describe('methodology: retired text is gone', () => {
  let text: string;
  beforeEach(() => {
    const root = document.createElement('div');
    renderMethodology(root);
    text = (root.textContent ?? '').replace(/\s+/g, ' ');
  });

  it('has no second, older sources table', () => {
    expect(text).not.toMatch(/Every 5 min/);
    expect(text).not.toMatch(/feed offline/i);
    expect(text).not.toMatch(/Internet outage monitoring by country/i);
    expect(text).not.toMatch(/IODA/);
  });

  it('does not say the index is recomputed every five minutes (the cron is hourly)', () => {
    expect(text).not.toMatch(/every 5 minutes/i);
    const crons = JSON.parse(vercelJson).crons as Array<{ path: string; schedule: string }>;
    const cii = crons.find((c) => c.path === '/api/cron/compute-cii');
    // If the schedule changes, this fails and the page's "every hour" must be revisited.
    expect(cii?.schedule).toBe('0 * * * *');
    expect(text).toMatch(/recomputed every hour/i);
  });

  it('does not carry the retired six-term formula or the old country count', () => {
    expect(text).not.toMatch(/CII = Conflict \+ Disasters \+ Sentiment/);
    expect(text).not.toMatch(/no country currently scores above 60/i);
    expect(text).not.toMatch(/\b50 countries\b/);
    expect(text).not.toMatch(/Score = conflict × 0\.5 \+ disasters × 0\.3/);
  });

  it('makes no promise about what the brief shows, and no stale infrastructure limitation', () => {
    // The model chooses what appears in the brief; the page may say what is read, not what is shown.
    expect(text).not.toMatch(/It shows what it read/i);
    // The component now says OONI censorship; a limitation about outages and power grids contradicted it.
    expect(text).not.toMatch(/primarily covers internet outages/i);
    // The FIRMS collector was never deleted: compute-cii still fetches it and discards the result.
    expect(text).not.toMatch(/NASA FIRMS/i);
  });

  it('does not claim nothing else is read', () => {
    expect(text).not.toMatch(/Nothing else is read/i);
  });
});

describe('methodology names every outside source the code fetches', () => {
  let text: string;
  beforeEach(() => {
    const root = document.createElement('div');
    renderMethodology(root);
    text = (root.textContent ?? '').replace(/\s+/g, ' ');
  });

  it('register collectors and resolver: every host is on the page', () => {
    expect(Object.keys(registerSources).length).toBeGreaterThanOrEqual(8);
    for (const [f, code] of Object.entries(registerSources)) {
      for (const host of hostsIn(code)) {
        const word = REGISTER_HOSTS[host];
        expect(word, `${f} fetches ${host}, which this test and the page do not know`).toBeTruthy();
        expect(text, `${host} (${word}) from ${f} is not named on /methodology`).toContain(word!);
      }
    }
  });

  it('daily brief: every host is a known data source named on the page, or a known outbound service', () => {
    const feedBlock = dailyBriefSrc.match(/const BRIEF_RSS_FEEDS[\s\S]*?\n\];/)?.[0] ?? '';
    expect(feedBlock.length).toBeGreaterThan(0);
    const feedHosts = new Set(hostsIn(feedBlock));
    for (const host of hostsIn(dailyBriefSrc)) {
      if (NOT_DATA_SOURCES.has(host) || feedHosts.has(host) || /(^|\.)nexuswatch\.dev$/.test(host)) continue;
      const word = BRIEF_ONLY_HOSTS[host] ?? REGISTER_HOSTS[host];
      expect(word, `daily-brief.ts fetches ${host}, which this test and the page do not know`).toBeTruthy();
      expect(text, `${host} (${word}) from daily-brief.ts is not named on /methodology`).toContain(word!);
    }
    // The feeds are named by pointing at the list, so the page cannot go stale on them.
    expect(text).toContain('RSS');
    expect(text).toContain('api/cron/daily-brief.ts');
  });

  it('every brief-only source the page names is still fetched by daily-brief.ts', () => {
    const fetched = hostsIn(dailyBriefSrc);
    for (const [host, word] of Object.entries(BRIEF_ONLY_HOSTS)) {
      expect(fetched, `the page names ${word} but daily-brief.ts no longer fetches ${host}`).toContain(host);
    }
  });

  it('says the brief reads more than the register does', () => {
    expect(text).toMatch(/The daily brief reads more/i);
  });
});
