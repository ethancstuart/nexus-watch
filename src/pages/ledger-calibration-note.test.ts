import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderLedgerPage } from './ledger.ts';

/**
 * The SPA ledger draws `scoring.calibration` as its CALIBRATION figure. It is
 * the renderer a reader gets only where /ledger has no server rewrite (local
 * vite, or the service worker's offline fallback), but where it draws the
 * table it carries the server's sentence beside it: the table leaves out a
 * kind whose outcomes are under correction, and the reader is told so.
 * Synthetic responses; fetch is stubbed.
 */

const NOTE = 'Censorship forecasts are left out of this table while their outcomes are under correction.';

function ledger(note: string | null) {
  return {
    generated_at: '2026-11-27T09:00:00.000Z',
    counts: { open: 980, resolved: 5693, hits: 1700, next_resolves_on: null, first_call_on: '2026-08-22' },
    independent_units: 104,
    resolution_batches: 80,
    min_batches_for_skill: 3,
    scoring: {
      base_rate: 0.3,
      murphy: { reliability: 0.01, resolution: 0.002, uncertainty: 0.2 },
      calibration: [{ from: 0.2, to: 0.3, count: 3455, meanPredicted: 0.251, observed: 0.279 }],
      calibration_note: note,
    },
    by_kind: {},
    open: [],
    resolved: [],
  };
}

async function caption(note: string | null): Promise<string> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(ledger(note)), { status: 200 }))),
  );
  const root = document.createElement('div');
  document.body.appendChild(root);
  await renderLedgerPage(root);
  const p = root.querySelector('.nw-figure__caption');
  expect(p).not.toBeNull();
  return p?.textContent ?? '';
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.textContent = '';
});

describe('the SPA calibration figure carries the server’s sentence', () => {
  it('beside the table, after the reading key, when the server sends one', async () => {
    expect(await caption(NOTE)).toBe(
      'When we say 70%, does it happen 70% of the time? Points on the diagonal are calibrated; dot size is how ' +
        `many calls sit in that band. ${NOTE} Reliability 0.010, resolution 0.002, uncertainty 0.200.`,
    );
  });

  it('and not otherwise', async () => {
    const c = await caption(null);
    expect(c).not.toContain('left out');
    expect(c).toBe(
      'When we say 70%, does it happen 70% of the time? Points on the diagonal are calibrated; dot size is how ' +
        'many calls sit in that band. Reliability 0.010, resolution 0.002, uncertainty 0.200.',
    );
  });

  it('a sentence that is not a string is not drawn', async () => {
    expect(await caption({ x: '<b>1</b>' } as unknown as string)).not.toMatch(/left out|\[object|<b>/);
  });
});
