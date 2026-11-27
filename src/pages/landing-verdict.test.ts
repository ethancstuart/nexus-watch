import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderLanding } from './landing.ts';

/**
 * THE LANDING OPENS WITH THE VERDICT, THEN THE CURRENCY TABLE.
 *
 * The hero used to be a pooled calibration table (currencies and censorship
 * together, the pooling /ledger refuses for its scores) under the headline
 * "The world, graded.", which implies a record of world events in general.
 * It is now the dated verdict, drawn from /api/calls/ledger, then the
 * said-against-happened table for currency calls only.
 *
 * Hermetic: fetch is stubbed with synthetic responses. That the JSON yields
 * the same sentence /ledger prints for the same book is proved in
 * api/ledger-verdict.test.ts.
 */

const MINUS = '−';

const fxBins = [
  { from: 0.1, to: 0.2, count: 1110, meanPredicted: 0.172, observed: 0.385 },
  { from: 0.2, to: 0.3, count: 3455, meanPredicted: 0.251, observed: 0.279 },
  { from: 0.3, to: 0.4, count: 12, meanPredicted: 0.326, observed: 0.25 },
];
const LEDGER = {
  generated_at: '2026-11-27T09:14:00.000Z',
  counts: { open: 980, resolved: 5693 },
  min_batches_for_skill: 3,
  // Pooled across kinds: must never be drawn.
  scoring: { calibration: [{ from: 0.9, to: 1, count: 777, meanPredicted: 0.93, observed: 0.91 }] },
  by_kind: {
    fx_devaluation: { resolved: 5430, skill_vs_base_rate: -0.0299, batches: 80, calibration: fxBins },
    censorship_event: {
      resolved: 263,
      skill_vs_base_rate: -0.02,
      batches: 6,
      calibration: [{ from: 0.9, to: 1, count: 131, meanPredicted: 0.95, observed: 0.97 }],
    },
  },
};

function stubLedger(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        String(url).includes('/api/calls/ledger')
          ? new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
          : new Response('{}', { status: 503 }),
      ),
    ),
  );
}

function render(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderLanding(root);
  return root;
}

/** Renders and waits until the verdict is drawn. */
async function drawn(body: unknown): Promise<HTMLElement> {
  stubLedger(body);
  const root = render();
  await vi.waitFor(() => {
    if (root.querySelector<HTMLElement>('#nw-hero-verdict')?.hidden !== false) throw new Error('not yet');
  });
  return root;
}

/** Renders and lets every fetch settle, for responses that should draw nothing. */
async function settled(body: unknown, status = 200): Promise<HTMLElement> {
  stubLedger(body, status);
  const root = render();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 50));
  return root;
}

const verdict = (root: HTMLElement) => root.querySelector<HTMLElement>('#nw-hero-verdict');
const figure = (root: HTMLElement) => root.querySelector<HTMLElement>('#nw-hero-figure');

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.textContent = '';
});

describe('the hero: the verdict first, then the currency table', () => {
  it('reads, in order: the eyebrow, the headline, the verdict, the table, then the sign-up', async () => {
    const root = await drawn(LEDGER);
    const hero = root.querySelector('.nw-hero') as HTMLElement;
    const order = [
      hero.querySelector('.nw-eyebrow'),
      hero.querySelector('h1'),
      verdict(root),
      figure(root),
      hero.querySelector('#nw-hero-capture'),
    ];
    for (const el of order) expect(el).not.toBeNull();
    for (let i = 1; i < order.length; i++) {
      // DOCUMENT_POSITION_FOLLOWING: each comes after the one before it.
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('the verdict, word for word, from the response', async () => {
    const v = verdict(await drawn(LEDGER)) as HTMLElement;
    expect(v.textContent).toBe(
      `As of 27 Nov 2026: 5,693 forecasts scored, 980 open. Currency forecasts score ${MINUS}3% against their base ` +
        'rate: no detectable skill. Corrections to our censorship reporting are published on our corrections page.',
    );
    expect(v.querySelector('strong')?.textContent).toBe('As of 27 Nov 2026:');
    const links = v.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/corrections');
    expect(links[0].textContent).toBe('our corrections page');
  });

  it('a different book, a different verdict: every figure is read, none is written down', async () => {
    const other = {
      ...LEDGER,
      generated_at: '2026-12-03T06:00:00.000Z',
      counts: { open: 1004, resolved: 6210 },
      by_kind: { ...LEDGER.by_kind, fx_devaluation: { ...LEDGER.by_kind.fx_devaluation, skill_vs_base_rate: -0.012 } },
    };
    expect(verdict(await drawn(other))?.textContent).toMatch(
      new RegExp(`^As of 3 Dec 2026: 6,210 forecasts scored, 1,004 open\\. Currency forecasts score ${MINUS}1% `),
    );
  });

  it('a positive estimate is not called skill: the JSON carries no interval', async () => {
    const up = {
      ...LEDGER,
      by_kind: { ...LEDGER.by_kind, fx_devaluation: { ...LEDGER.by_kind.fx_devaluation, skill_vs_base_rate: 0.041 } },
    };
    const t = verdict(await drawn(up))?.textContent ?? '';
    expect(t).toContain(
      'Currency forecasts score +4% against their base rate. No interval is computed for that figure, so it does not show skill.',
    );
    expect(t).not.toMatch(/detectable skill/);
  });

  it('a withheld skill is said to be withheld', async () => {
    const early = {
      ...LEDGER,
      by_kind: {
        fx_devaluation: { resolved: 60, skill_vs_base_rate: null, batches: 1, calibration: fxBins.slice(0, 1) },
      },
    };
    expect(verdict(await drawn(early))?.textContent).toContain(
      'Currency forecasts have no skill figure yet: it is withheld until they have resolved in 3 separate batches.',
    );
  });

  it('the table is the currency calls only, with a reading key', async () => {
    const fig = figure(await drawn(LEDGER)) as HTMLElement;
    expect(fig.hidden).toBe(false);
    const rows = [...fig.querySelectorAll('.nw-figure-row')].map((r) => r.textContent);
    expect(rows).toEqual([
      '10%–20%said 17%happened 39%n=1110',
      '20%–30%said 25%happened 28%n=3455',
      '30%–40%said 33%happened 25%n=12 · thin',
    ]);
    // Neither the pooled table nor the censorship one.
    expect(fig.textContent).not.toMatch(/90%|n=777|n=131/);
    expect(fig.querySelector('.nw-figure-note')?.textContent).toBe(
      'Currency forecasts only, grouped by the probability we gave them. Closer is better: a perfectly ' +
        'calibrated forecaster’s two numbers match.',
    );
  });
});

describe('the headline and eyebrow claim no more than the record', () => {
  it('the headline is about our forecasts, not the world', async () => {
    const root = await drawn(LEDGER);
    const h1 = root.querySelector('.nw-hero h1') as HTMLElement;
    expect(h1.getAttribute('aria-label')).toBe('Our forecasts, graded.');
    expect(h1.textContent?.replace(/\s+/g, ' ').trim()).toBe('Our forecasts, graded.');
    expect(root.querySelector('.nw-hero')?.textContent).not.toMatch(/the world/i);
    expect(root.querySelectorAll('h1')).toHaveLength(1);
  });

  it('the eyebrow names the ledger and carries no count: the counts are in the verdict', async () => {
    const root = await drawn(LEDGER);
    expect(root.querySelector('.nw-eyebrow')?.textContent).toBe('The public forecasting ledger');
  });
});

describe('nothing invented', () => {
  it('a failed read draws no verdict and no table', async () => {
    const root = await settled({}, 503);
    expect(verdict(root)?.hidden).toBe(true);
    expect(verdict(root)?.textContent).toBe('');
    expect(figure(root)?.hidden).toBe(true);
    expect(root.querySelector('h1')).not.toBeNull();
  });

  it('a response with no currency table draws the verdict and no table', async () => {
    const root = await drawn({
      ...LEDGER,
      by_kind: { fx_devaluation: { resolved: 0, skill_vs_base_rate: null, batches: 0, calibration: [] } },
    });
    expect(verdict(root)?.textContent).not.toMatch(/Currency/);
    expect(figure(root)?.hidden).toBe(true);
  });
});

describe('escaping holds', () => {
  it('hostile values in the response draw no verdict and inject nothing', async () => {
    for (const bad of [
      { ...LEDGER, generated_at: '<img src=x onerror="alert(1)">' },
      { ...LEDGER, counts: { open: '<b>980</b>', resolved: 5693 } },
      { ...LEDGER, counts: { open: 980, resolved: '<script>alert(1)</script>' } },
      'not json <img src=x>',
    ]) {
      const root = await settled(bad);
      expect(verdict(root)?.hidden).toBe(true);
      expect(verdict(root)?.textContent).toBe('');
      expect(root.querySelector('.nw-hero img, .nw-hero script, .nw-hero b')).toBeNull();
      document.body.textContent = '';
    }
  });

  it('a hostile skill is read as no figure; a hostile table is not drawn', async () => {
    const root = await drawn({
      ...LEDGER,
      by_kind: {
        fx_devaluation: {
          resolved: 5430,
          skill_vs_base_rate: '<script>alert(1)</script>',
          batches: 80,
          calibration: [{ from: '<img src=x>', to: 0.2, count: 3, meanPredicted: 0.1, observed: 0.2 }],
        },
      },
    });
    expect(verdict(root)?.textContent).toContain('Currency forecasts carry no published skill figure.');
    expect(figure(root)?.hidden).toBe(true);
    expect(root.querySelector('.nw-hero img, .nw-hero script')).toBeNull();
  });
});
