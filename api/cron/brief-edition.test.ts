import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// The delivery-time re-render test drives the real handler against a stubbed
// database. Hermetic: no network, no DATABASE_URL, no Resend (the stub returns
// no subscribers, so the handler stops before it would send anything).
const db = vi.hoisted(() => ({
  content: {} as Record<string, unknown>,
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: () => async (strings: TemplateStringsArray) => {
    const q = strings.join(' ');
    if (q.includes('information_schema')) return [{ column_name: 'email_html' }, { column_name: 'plain_text' }];
    if (q.includes('FROM daily_briefs')) {
      return [{ brief_date: 'x', summary: '', content: db.content, email_html: null, plain_text: null }];
    }
    return [];
  },
}));

vi.mock('../admin/_auth.js', () => ({ resolveAdmin: async () => ({ email: 'admin@example.test' }) }));

vi.mock('./daily-brief.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./daily-brief.js')>();
  return { ...real, renderDossierEmail: vi.fn(real.renderDossierEmail) };
});

import {
  buildFallbackText,
  editionFromStoredContent,
  formatResolvedCallLines,
  MECHANICAL_EDITION_LINE,
  renderDossierEmail,
  type BriefData,
} from './daily-brief.js';
import deliverBriefs from './deliver-briefs.js';
import previewBrief from '../admin/brief/preview.js';

const markets = [
  { symbol: 'SPY', price: '601.20', change: '+0.4%', direction: 'up' as const },
  { symbol: 'USO', price: '72.10', change: '-1.2%', direction: 'down' as const },
];

const data: BriefData = {
  date: '2026-11-15',
  utcTime: '10:00 UTC',
  topRiskCountries: [
    {
      name: 'Sudan',
      code: 'SD',
      score: 80,
      deviation: 9,
      prevScore: 80,
      prevDeviation: 2,
      components: { conflict: 1, disasters: 1, sentiment: 1, infrastructure: 1, governance: 1, marketExposure: 1 },
    } as never,
  ],
  totalCountries: 86,
  markets,
  earthquakeCount: 3,
  newsHeadlines: [{ title: 'A wire headline', source: 'Wire', link: 'https://example.test/a' } as never],
  conflictHeadlines: [],
  weeklyTrends: [],
  openCallLines: ['Uganda (UG): 38% chance of a currency depreciation by 2026-12-01.'],
  resolvedCallLines: ['67 calls settled against external ground truth: 22 hit, 45 miss.'],
} as unknown as BriefData;

const MODEL_BRIEF =
  "## 🎯 Today's Call\n\nA model-written paragraph.\n\n## 📡 Top Signal\n\n**A model headline.** Body.\n";

const render = (edition?: 'model' | 'mechanical', briefText = MODEL_BRIEF) =>
  renderDossierEmail({ briefText, date: '2026-11-15', time: '10:00 UTC', markets, edition });

describe('the edition line — mechanical days only', () => {
  it('is in all three outputs on a mechanical render', () => {
    const out = render('mechanical', buildFallbackText(data));
    expect(out.emailHtml).toContain(MECHANICAL_EDITION_LINE);
    expect(out.beehiivHtml).toContain(MECHANICAL_EDITION_LINE);
    expect(out.plainText).toContain(MECHANICAL_EDITION_LINE);
  });

  it('sits inside the masthead block of the email: after the date, before the first section', () => {
    const { emailHtml } = render('mechanical', buildFallbackText(data));
    const at = (s: string) => emailHtml.indexOf(s);
    expect(at('SITUATION BRIEF')).toBeGreaterThan(-1);
    expect(at('2026-11-15 · 10:00 UTC</div>')).toBeGreaterThan(at('SITUATION BRIEF'));
    expect(at(MECHANICAL_EDITION_LINE)).toBeGreaterThan(at('2026-11-15 · 10:00 UTC</div>'));
    // The first section's headline comes after the line, so nothing but the
    // masthead sits between the wordmark and the line.
    expect(at(MECHANICAL_EDITION_LINE)).toBeLessThan(at('<h2'));
    // And the line is a child of the masthead's own container: the masthead div
    // closes only after the line does.
    const mastheadStart = emailHtml.lastIndexOf('<div', at('>NexusWatch</div>') - 1);
    const lineEnd = at(MECHANICAL_EDITION_LINE) + MECHANICAL_EDITION_LINE.length;
    const between = emailHtml.slice(mastheadStart, lineEnd);
    const opens = (between.match(/<div/g) ?? []).length;
    const closes = (between.match(/<\/div>/g) ?? []).length;
    expect(opens - closes).toBe(1); // still inside the masthead container
  });

  it('opens the embeddable fragment, before any section', () => {
    const { beehiivHtml } = render('mechanical', buildFallbackText(data));
    expect(beehiivHtml.indexOf(MECHANICAL_EDITION_LINE)).toBeGreaterThan(-1);
    expect(beehiivHtml.indexOf(MECHANICAL_EDITION_LINE)).toBeLessThan(beehiivHtml.indexOf('<h2'));
  });

  it('sits under the date line in the plain-text part, before the first rule', () => {
    const { plainText } = render('mechanical', buildFallbackText(data));
    const lines = plainText.split('\n');
    expect(lines[0]).toBe('NEXUSWATCH SITUATION BRIEF');
    expect(lines[1]).toBe('2026-11-15 · 10:00 UTC');
    expect(lines[2]).toBe(MECHANICAL_EDITION_LINE);
  });

  it('is absent from a model render, in every output', () => {
    for (const out of [render('model'), render(undefined)]) {
      expect(out.emailHtml).not.toContain(MECHANICAL_EDITION_LINE);
      expect(out.beehiivHtml).not.toContain(MECHANICAL_EDITION_LINE);
      expect(out.plainText).not.toContain(MECHANICAL_EDITION_LINE);
    }
  });

  it('leaves every existing caller unchanged: no edition argument renders as the model edition', () => {
    expect(render(undefined)).toEqual(render('model'));
  });

  it('adds no hex colour the email did not already use', () => {
    const hex = (s: string) => new Set(s.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []);
    const model = hex(render('model', buildFallbackText(data)).emailHtml);
    const mech = hex(render('mechanical', buildFallbackText(data)).emailHtml);
    for (const c of mech) expect(model.has(c)).toBe(true);
  });

  it('keeps the unsubscribe link and footer on a mechanical render', () => {
    const { emailHtml, plainText } = render('mechanical', buildFallbackText(data));
    expect(emailHtml).toContain('Unsubscribe</a>');
    expect(plainText).toContain('Unsubscribe: ');
  });
});

describe('the market lines are not printed on a mechanical day', () => {
  // CHANGED WITH R1 (the record-only edition, DISCOVERY.md §5): "the duplicated
  // market block goes". The edition used to print every market itself, so
  // Market Pulse was dropped as a duplicate; now neither prints, because neither
  // is the record.
  it('the record-only edition carries no market, though the array is full', () => {
    const body = buildFallbackText(data);
    for (const m of markets) {
      expect(body).not.toContain(m.symbol);
      expect(body).not.toContain(m.change);
    }
    expect(body).not.toContain('Markets');
  });

  it('mechanical: Market Pulse is omitted and no market change appears anywhere', () => {
    const { emailHtml, beehiivHtml, plainText } = render('mechanical', buildFallbackText(data));
    for (const out of [emailHtml, beehiivHtml, plainText]) {
      expect(out).not.toContain('Market Pulse');
      for (const m of markets) expect(out).not.toContain(`${m.change}`);
    }
  });

  it('model: Market Pulse is unchanged', () => {
    expect(render('model').emailHtml).toContain('Market Pulse');
    expect(render('model').beehiivHtml).toContain('Market Pulse');
  });
});

describe('the settled count says what it counts', () => {
  const rows = [
    {
      kind: 'censorship_event',
      country_code: 'KZ',
      probability: 0.16,
      base_rate: 0.1,
      status: 'hit',
      resolves_on: '2026-11-15',
      evidence_count: 2,
    },
  ];
  it('names its window when the caller gives one', () => {
    const day = formatResolvedCallLines(rows, 0, undefined, { total: 5, hits: 2 }, 12, 'today');
    expect(day[0]).toBe('5 calls settled today against external ground truth: 2 hit, 3 miss.');
    const week = formatResolvedCallLines(rows, 0, undefined, { total: 469, hits: 106 }, 12, 'in the last 7 days');
    expect(week[0]).toBe('469 calls settled in the last 7 days against external ground truth: 106 hit, 363 miss.');
  });
  it('without a window the sentence is byte-identical to before', () => {
    const lines = formatResolvedCallLines(rows, 0, undefined, { total: 5, hits: 2 });
    expect(lines[0]).toBe('5 calls settled against external ground truth: 2 hit, 3 miss.');
  });
});

describe('the edition is recovered from stored data', () => {
  it('reads "mechanical" only when the archive says so; anything else is the model edition', () => {
    expect(editionFromStoredContent({ edition: 'mechanical' })).toBe('mechanical');
    expect(editionFromStoredContent({ edition: 'model' })).toBe('model');
    // Rows archived before this field existed: UNKNOWN, rendered as before.
    expect(editionFromStoredContent({})).toBe('model');
    expect(editionFromStoredContent(null)).toBe('model');
    expect(editionFromStoredContent({ edition: 'MECHANICAL ' })).toBe('model');
  });
});

describe('deliver-briefs re-renders from the archive with the stored edition', () => {
  // The handler fails closed without CRON_SECRET, so the request carries a
  // synthetic one. Environment variable by name only; the value is a stand-in.
  const call = async () => {
    const res = { status: () => ({ json: () => undefined }) } as unknown as VercelResponse;
    await deliverBriefs({ headers: { authorization: 'Bearer test-secret' } } as unknown as VercelRequest, res);
  };
  // Braces matter: returning the mock from beforeEach makes vitest call it as a
  // teardown hook, with no arguments.
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.mocked(renderDossierEmail).mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes edition: mechanical for a mechanical archive row', async () => {
    db.content = { briefText: buildFallbackText(data), markets, edition: 'mechanical' };
    await call();
    expect(renderDossierEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(renderDossierEmail).mock.calls[0][0].edition).toBe('mechanical');
    expect(vi.mocked(renderDossierEmail).mock.results[0].value.emailHtml).toContain(MECHANICAL_EDITION_LINE);
  });

  it('passes the model edition for a model archive row, and for a legacy row with no field', async () => {
    db.content = { briefText: MODEL_BRIEF, markets, edition: 'model' };
    await call();
    db.content = { briefText: MODEL_BRIEF, markets };
    await call();
    const editions = vi.mocked(renderDossierEmail).mock.calls.map((c) => c[0].edition);
    expect(editions).toEqual(['model', 'model']);
    for (const r of vi.mocked(renderDossierEmail).mock.results)
      expect(r.value.emailHtml).not.toContain(MECHANICAL_EDITION_LINE);
  });
});

describe('the admin preview shows the brief as it was sent', () => {
  const preview = async () => {
    let body = '';
    const res = {
      setHeader: () => undefined,
      status: () => ({ json: () => undefined }),
      send: (b: string) => {
        body = b;
      },
    } as unknown as VercelResponse;
    await previewBrief({ method: 'GET', headers: {}, query: { view: 'text' } } as unknown as VercelRequest, res);
    return body;
  };
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/none');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('carries the edition line for a mechanical archive row, and not for a model row', async () => {
    db.content = { briefText: buildFallbackText(data), markets, edition: 'mechanical' };
    expect(await preview()).toContain(MECHANICAL_EDITION_LINE);
    db.content = { briefText: MODEL_BRIEF, markets, edition: 'model' };
    expect(await preview()).not.toContain(MECHANICAL_EDITION_LINE);
  });
});
