import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderLanding } from './landing.ts';

/**
 * The landing hero used to dim itself to 55% opacity 2.4 s after load — a
 * timer written so a rotating globe behind it stayed legible. The globe was
 * removed and the timer stayed, so every visitor watched the headline and the
 * sign-up button fade (the button label fell to about 2.7:1, a WCAG AA fail).
 * Beside it sat a pulsing "LIVE" badge, on a product that updates once a day,
 * drawn under the nav brand on desktop. These tests keep both from returning.
 */

function render(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderLanding(root);
  return root;
}

describe('landing hero stays at full strength', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Hermetic: the hero's live count and figure read /api/calls/ledger.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 503 }))),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.textContent = '';
  });

  it('does not dim the hero content after load', () => {
    const root = render();
    vi.advanceTimersByTime(10_000);
    const hero = root.querySelector('#nw-hero-content');
    expect(hero).not.toBeNull();
    expect(hero?.classList.contains('is-dim')).toBe(false);
  });

  it('draws no LIVE badge', () => {
    const root = render();
    expect(root.querySelector('.nw-hero-live')).toBeNull();
    expect(root.querySelector('.nw-hero')?.textContent ?? '').not.toMatch(/\bLIVE\b/);
  });

  // The stranger's path: every ledger link on the landing opens the
  // server-rendered /ledger as a full page load, never the SPA's hash route.
  it('links every ledger mention to the server page', () => {
    const root = render();
    const ledgerLinks = [...root.querySelectorAll('a')].filter((a) => /ledger|every call/i.test(a.textContent ?? ''));
    expect(ledgerLinks.length).toBeGreaterThanOrEqual(3);
    for (const a of ledgerLinks) expect(a.getAttribute('href')).toBe('/ledger');
    expect(root.querySelector('a[href="#/ledger"]')).toBeNull();
  });
});

/**
 * The landing excerpt shows the latest brief, which can be a corrected one
 * (22 Nov is affected). It says so only when the server's JSON carries an
 * approved correction. Synthetic responses.
 */
describe('landing excerpt and correction notes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.textContent = '';
  });

  async function renderWithBrief(brief: Record<string, unknown>): Promise<HTMLElement> {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          String(url).includes('/api/v1/brief')
            ? new Response(JSON.stringify(brief), { status: 200 })
            : new Response('{}', { status: 503 }),
        ),
      ),
    );
    const root = render();
    await vi.waitFor(() => {
      if (root.querySelector('#nw-brief-excerpt')?.textContent !== 'Synthetic summary.') throw new Error('not yet');
    });
    return root;
  }

  it('marks a corrected latest brief on its own line, in the meta style', async () => {
    const root = await renderWithBrief({
      summary: 'Synthetic summary.',
      correction: { correctedOn: '2026-12-01', classification: 'false', note: 'n' },
    });
    const marks = root.querySelectorAll('.nw-brief-corrected');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('Correction added 1 Dec 2026.');
    expect(marks[0].classList.contains('nw-brief-meta')).toBe(true);
    expect(root.querySelector('#nw-brief-excerpt')?.textContent).toBe('Synthetic summary.');
  });

  it('shows no mark without an approved correction, or with a malformed one', async () => {
    for (const brief of [
      { summary: 'Synthetic summary.' },
      { summary: 'Synthetic summary.', correction: { correctedOn: '<b>soon</b>' } },
    ]) {
      const root = await renderWithBrief(brief);
      expect(root.querySelector('.nw-brief-corrected')).toBeNull();
      expect(root.textContent).not.toMatch(/Correction added/);
      document.body.textContent = '';
    }
  });
});
