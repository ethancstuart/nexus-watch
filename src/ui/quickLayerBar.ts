/**
 * QuickLayerBar — always-visible chip strip pinned top-left over the globe.
 *
 * 9 chips toggle the highest-traffic layers without opening the full
 * LayerDrawer. Plus "More" chip that opens the drawer for the long tail.
 *
 * Stays in sync with MapLayerManager via:
 *   - reads enabled state on init from layerManager.getEnabledLayers()
 *   - listens for `dashview:layer-toggle` events to reflect drawer-driven toggles
 *   - calls layerManager.toggle() on chip click; the manager dispatches the event
 *     which this component swallows on its own chip then re-applies (idempotent)
 */

import { createElement } from '../utils/dom.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';

export interface QuickChipDef {
  id: string; // layer ID in MapLayerManager
  label: string;
  icon: string; // single emoji or short glyph
}

export const DEFAULT_QUICK_CHIPS: QuickChipDef[] = [
  { id: 'earthquakes', label: 'Earthquakes', icon: '◉' },
  { id: 'fires', label: 'Fires', icon: '▲' },
  { id: 'acled', label: 'Conflict', icon: '✦' },
  { id: 'news', label: 'News', icon: '◆' },
  { id: 'sentiment', label: 'Sentiment', icon: '~' },
  { id: 'ships', label: 'Ships', icon: '⚓' },
  { id: 'pipelines', label: 'Pipelines', icon: '═' },
  { id: 'predictions', label: 'Markets', icon: '$' },
  { id: 'cyber', label: 'Cyber', icon: '⌬' },
];

export interface QuickLayerBar {
  element: HTMLElement;
  destroy: () => void;
}

export function createQuickLayerBar(
  layerManager: MapLayerManager,
  opts: { onMoreClick: () => void; chips?: QuickChipDef[] },
): QuickLayerBar {
  const chips = opts.chips ?? DEFAULT_QUICK_CHIPS;

  const bar = createElement('div', { className: 'nw-quick-bar' });
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Quick layer filters');

  // Map of chip id → button element for fast O(1) state updates
  const chipEls = new Map<string, HTMLButtonElement>();

  for (const chip of chips) {
    const btn = createElement('button', { className: 'nw-quick-chip' });
    btn.type = 'button';
    btn.dataset.layerId = chip.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `Toggle ${chip.label} layer`);
    btn.innerHTML = `<span class="nw-quick-chip-icon">${chip.icon}</span><span class="nw-quick-chip-label">${chip.label}</span>`;

    btn.addEventListener('click', () => {
      layerManager.toggle(chip.id);
      // visual state is updated via the layer-toggle listener below for consistency
    });

    bar.appendChild(btn);
    chipEls.set(chip.id, btn);
  }

  // "More" chip — opens the full LayerDrawer
  const moreBtn = createElement('button', { className: 'nw-quick-chip nw-quick-chip-more' });
  moreBtn.type = 'button';
  moreBtn.setAttribute('aria-label', 'Open full layer drawer');
  moreBtn.innerHTML = '<span class="nw-quick-chip-icon">+</span><span class="nw-quick-chip-label">More</span>';
  moreBtn.addEventListener('click', () => opts.onMoreClick());
  bar.appendChild(moreBtn);

  // Initial state — reflect currently-enabled layers
  function syncFromManager(): void {
    const enabledIds = new Set(layerManager.getEnabledLayers().map((l) => l.id));
    for (const [id, btn] of chipEls) {
      const isOn = enabledIds.has(id);
      btn.classList.toggle('is-active', isOn);
      btn.setAttribute('aria-pressed', String(isOn));
    }
  }
  syncFromManager();

  // Listen for any toggle event so our chips stay in sync if drawer toggles a layer
  const onLayerToggle = (e: Event) => {
    const detail = (e as CustomEvent<{ layerId: string; enabled: boolean }>).detail;
    const btn = chipEls.get(detail.layerId);
    if (!btn) return;
    btn.classList.toggle('is-active', detail.enabled);
    btn.setAttribute('aria-pressed', String(detail.enabled));
  };
  document.addEventListener('dashview:layer-toggle', onLayerToggle);

  return {
    element: bar,
    destroy: () => {
      document.removeEventListener('dashview:layer-toggle', onLayerToggle);
      bar.remove();
    },
  };
}
