import { describe, it, expect, vi, beforeEach } from 'vitest';
import axe from 'axe-core';
import type { MapLayerManager } from '../map/MapLayerManager.ts';
import { createQuickLayerBar, DEFAULT_QUICK_CHIPS } from './quickLayerBar.ts';

function fakeManager(enabledIds: string[]): MapLayerManager {
  const enabled = new Set(enabledIds);
  return {
    toggle: vi.fn((id: string) => {
      if (enabled.has(id)) enabled.delete(id);
      else enabled.add(id);
      return enabled.has(id);
    }),
    getEnabledLayers: vi.fn(() => Array.from(enabled).map((id) => ({ id }))),
  } as unknown as MapLayerManager;
}

describe('QuickLayerBar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders all 9 default chips + a More button', () => {
    const bar = createQuickLayerBar(fakeManager([]), { onMoreClick: () => undefined });
    document.body.appendChild(bar.element);
    const chips = bar.element.querySelectorAll('.nw-quick-chip');
    // 9 default chips + 1 More chip
    expect(chips.length).toBe(DEFAULT_QUICK_CHIPS.length + 1);
  });

  it('toggles layer state and reflects on chip via dispatched event', () => {
    const mgr = fakeManager([]);
    const bar = createQuickLayerBar(mgr, { onMoreClick: () => undefined });
    document.body.appendChild(bar.element);
    const earthquakesChip = bar.element.querySelector('[data-layer-id="earthquakes"]') as HTMLButtonElement;
    expect(earthquakesChip.classList.contains('is-active')).toBe(false);
    earthquakesChip.click();
    document.dispatchEvent(
      new CustomEvent('dashview:layer-toggle', { detail: { layerId: 'earthquakes', enabled: true } }),
    );
    expect(earthquakesChip.classList.contains('is-active')).toBe(true);
    expect(earthquakesChip.getAttribute('aria-pressed')).toBe('true');
  });

  it('passes axe-core a11y audit (no violations)', async () => {
    const bar = createQuickLayerBar(fakeManager(['earthquakes']), { onMoreClick: () => undefined });
    document.body.appendChild(bar.element);
    const results = await axe.run(bar.element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      // happy-dom doesn't compute layout/colors → skip color-contrast which
      // requires a real renderer to evaluate. The visual contrast check is
      // covered separately by manual review against the design tokens.
      rules: { 'color-contrast': { enabled: false } },
    });
    if (results.violations.length > 0) {
      console.error('axe violations:', JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });

  it('More chip triggers onMoreClick callback', () => {
    const onMoreClick = vi.fn();
    const bar = createQuickLayerBar(fakeManager([]), { onMoreClick });
    document.body.appendChild(bar.element);
    const more = bar.element.querySelector('.nw-quick-chip-more') as HTMLButtonElement;
    more.click();
    expect(onMoreClick).toHaveBeenCalledTimes(1);
  });
});
