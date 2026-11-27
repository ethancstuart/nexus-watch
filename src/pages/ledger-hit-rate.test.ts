import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderLedgerPage } from './ledger.ts';

/**
 * The SPA ledger's "calls that landed" tiles print `scoring.base_rate`, which is
 * the OBSERVED HIT RATE (api/calls/ledger.ts). They called it "stated base rate"
 * and "base rate". Now they call it the observed hit rate and print the server's
 * `mean_stated_base_rate` beside it, both read from the response, never typed
 * in. The renderer runs only where /ledger has no server rewrite (local vite,
 * or the service worker's offline fallback). Synthetic responses; fetch is
 * stubbed.
 */

function ledger(scoring: Record<string, unknown>) {
  return {
    generated_at: '2026-11-27T09:00:00.000Z',
    counts: { open: 981, resolved: 5627, hits: 1744, next_resolves_on: null, first_call_on: '2026-08-22' },
    independent_units: 104,
    resolution_batches: 2,
    min_batches_for_skill: 3,
    scoring: { murphy: null, calibration: [], ...scoring },
    by_kind: {},
    open: [],
    resolved: [],
  };
}

/** Every "calls that landed" tile's detail line, and the whole stat grid's text. */
async function render(scoring: Record<string, unknown>): Promise<{ details: (string | null)[]; grid: string }> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(ledger(scoring)), { status: 200 }))),
  );
  const root = document.createElement('div');
  document.body.appendChild(root);
  await renderLedgerPage(root);
  const tiles = [...root.querySelectorAll('.nw-stat')].filter(
    (t) => t.querySelector('.nw-stat__label')?.textContent === 'calls that landed',
  );
  expect(tiles.length).toBeGreaterThan(0);
  return {
    details: tiles.map((t) => t.querySelector('.nw-stat__detail')?.textContent ?? null),
    grid: root.querySelector('.nw-statgrid')?.textContent ?? '',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.textContent = '';
});

describe('the SPA never calls the observed hit rate a base rate', () => {
  it('every landed tile: the observed hit rate, then the mean stated base rate', async () => {
    const { details, grid } = await render({
      base_rate: 0.3099342456015639,
      mean_stated_base_rate: 0.25636271547894085,
    });
    for (const d of details) expect(d).toBe('observed hit rate 31% · mean stated base rate 26%');
    expect(grid).not.toMatch(/(?<!mean )stated base rate/);
    for (const m of grid.matchAll(/base rate (\d+)%/g)) {
      expect(grid.slice(Math.max(0, (m.index ?? 0) - 'mean stated '.length), m.index)).toBe('mean stated ');
    }
  });

  it('both figures come from the response', async () => {
    const { details } = await render({ base_rate: 0.55, mean_stated_base_rate: 0.38 });
    for (const d of details) expect(d).toBe('observed hit rate 55% · mean stated base rate 38%');
  });

  it('a server without the mean: the hit rate alone, still not called a base rate', async () => {
    const { details, grid } = await render({ base_rate: 0.3116 });
    for (const d of details) expect(d).toBe('observed hit rate 31%');
    expect(grid).not.toMatch(/base rate \d+%/);
  });

  it('no observed figure, no line', async () => {
    const { details } = await render({ base_rate: null, mean_stated_base_rate: 0.26 });
    for (const d of details) expect(d).toBeNull();
  });
});
