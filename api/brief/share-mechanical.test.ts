import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * THE SHARE IMAGES OF A RECORD-ONLY EDITION SHOW THE RECORD (plan R1).
 *
 * A mechanical edition names no top-risk country and prints no index score or
 * tension figure. Its two share images used to: /api/brief/screenshot (the
 * og:image of /brief/:date) drew "Map of the Day", the top-scored country and
 * "CII n/100", and fetched a map of it; /api/og?type=brief cut a headline from
 * the edition's HTML (the edition line, a kicker and the Ledger line run
 * together) above "TENSION INDEX". Now both say "The Ledger" and, when the
 * archive holds one, the day's counted subject, which code wrote from the
 * resolved-call counts. A model edition's images are unchanged. Synthetic rows;
 * no database, no network.
 */

vi.mock('@vercel/og', () => ({
  ImageResponse: class {
    headers = new Headers();
    element: unknown;
    constructor(element: unknown) {
      this.element = element;
    }
  },
}));
vi.mock('../_lib/satori-html.js', () => ({ htmlToSatori: (html: string) => html }));

let row: Record<string, unknown> | null = null;
vi.mock('@neondatabase/serverless', () => ({ neon: () => async () => (row ? [row] : []) }));

const { default: screenshot } = await import('./screenshot.js');
const { briefCardWords, renderBriefCard } = await import('../og.js');
const { MECHANICAL_EDITION_LINE } = await import('../_lib/brief-edition.js');

const DATE = '2026-11-22';
const COUNTED = `66 calls settled, 31 hit — mechanical edition, ${DATE}`;
const BOARD = { topRiskCountries: [{ code: 'YE', name: 'Yemen', score: 82 }] };

async function shot(): Promise<{ status: number; type: string; body: string }> {
  const out = { status: 200, type: '', body: '' };
  const res = {
    setHeader(k: string, v: string) {
      if (k.toLowerCase() === 'content-type') out.type = v;
      return res;
    },
    status(code: number) {
      out.status = code;
      return res;
    },
    send(b: unknown) {
      out.body = String(b);
      return res;
    },
    json(b: unknown) {
      out.body = JSON.stringify(b);
      return res;
    },
  };
  await screenshot({ method: 'GET', query: { date: DATE, size: 'og' } } as never, res as never);
  return out;
}

const fetchStub = vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }));

beforeEach(() => {
  row = null;
  fetchStub.mockClear();
  vi.stubGlobal('fetch', fetchStub);
  vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/none');
  vi.stubEnv('MAPBOX_TOKEN', 'synthetic-map-token');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('/api/brief/screenshot (the og:image of /brief/:date)', () => {
  it('a mechanical edition: The Ledger and the counted subject, no country, no score, no map fetched', async () => {
    row = { brief_date: DATE, content: { ...BOARD, edition: 'mechanical', subject: COUNTED } };
    const out = await shot();
    expect(out.type).toContain('image/svg+xml');
    expect(out.body).toContain('>The Ledger<');
    expect(out.body).toContain('>66 calls settled, 31 hit<');
    expect(out.body).toContain('>MECHANICAL EDITION<');
    expect(out.body).toContain(`>${DATE}<`);
    for (const w of ['Map of the Day', 'Yemen', 'CII', '/100']) expect(out.body).not.toContain(w);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('a mechanical edition without a counted subject draws no count at all', async () => {
    for (const subject of [
      `The Ledger, unchanged — mechanical edition, ${DATE}`,
      `The Ledger, no calls settled — mechanical edition, ${DATE}`,
      `The Ledger — mechanical edition, ${DATE}`,
      undefined,
      '<b>66</b> calls',
    ]) {
      row = { brief_date: DATE, content: { edition: 'mechanical', subject } };
      const out = await shot();
      expect(out.body).toContain('>The Ledger<');
      expect(out.body).not.toMatch(/calls settled|unchanged|<b>/);
      expect(fetchStub).not.toHaveBeenCalled();
    }
  });

  it('a model edition is unchanged: the map of its top country', async () => {
    row = { brief_date: DATE, content: { ...BOARD, edition: 'model' } };
    const out = await shot();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(out.type).toBe('image/png');
    // And without a map it falls back to the same card as before.
    vi.stubEnv('MAPBOX_TOKEN', '');
    const card = await shot();
    expect(card.body).toContain('Map of the Day');
    expect(card.body).toContain('Yemen');
    expect(card.body).toContain('CII 82/100');
  });
});

describe('/api/og?type=brief', () => {
  it('a mechanical edition: the counted subject, else the edition line; never text cut from its HTML', () => {
    const summary = `<div>${MECHANICAL_EDITION_LINE}</div><div>🏁 WHAT RESOLVED TODAY</div><p>The Ledger — 66 resolved</p>`;
    expect(briefCardWords(DATE, summary, { edition: 'mechanical', subject: COUNTED, tensionIndex: 70 })).toEqual({
      headline: COUNTED,
      tension: null,
      mechanical: true,
    });
    for (const subject of [
      `The Ledger, unchanged — mechanical edition, ${DATE}`,
      `The Ledger, no calls settled — mechanical edition, ${DATE}`,
      `The Ledger — mechanical edition, ${DATE}`,
      undefined,
    ]) {
      expect(briefCardWords(DATE, summary, { edition: 'mechanical', subject }).headline).toBe(MECHANICAL_EDITION_LINE);
    }
  });

  it('a mechanical card names the ledger where the tension index was', () => {
    const card = renderBriefCard(DATE, COUNTED, null, true);
    expect(card).toContain('THE LEDGER');
    expect(card).not.toContain('TENSION');
    expect(card).toContain(COUNTED);
  });

  it('a model edition is unchanged: its headline from the summary, the tension label as before', () => {
    const summary = '<p>A model headline about the record.</p>';
    expect(briefCardWords(DATE, summary, { edition: 'model' })).toEqual({
      headline: 'A model headline about the record.',
      tension: null,
      mechanical: false,
    });
    expect(briefCardWords(DATE, '', { topRiskCountries: [{ name: 'Yemen' }] }).headline).toBe('Top risk: Yemen.');
    expect(briefCardWords(DATE, null, null).headline).toBe('Daily geopolitical intelligence brief.');
    expect(briefCardWords(DATE, '', { tensionIndex: 61.6 }).tension).toBe(62);
    expect(renderBriefCard(DATE, 'x', null)).toContain('TENSION INDEX');
    expect(renderBriefCard(DATE, 'x', 62)).toContain('TENSION 62');
  });
});

describe('one call settled (R1 review finding 10)', () => {
  it('the share image and card take the singular counted subject', async () => {
    const one = `1 call settled, 1 hit — mechanical edition, ${DATE}`;
    row = { brief_date: DATE, content: { edition: 'mechanical', subject: one } };
    expect((await shot()).body).toContain('>1 call settled, 1 hit<');
    expect(briefCardWords(DATE, '', { edition: 'mechanical', subject: one }).headline).toBe(one);
  });
});
