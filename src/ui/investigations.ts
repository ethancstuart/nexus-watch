/**
 * Investigation Workspaces
 *
 * Save: map view + layers + timeline range + graph focus → named investigation
 * Restore: load from localStorage (future: Postgres for authenticated users)
 * Share: encode state in URL
 * Auto-generate: create from correlation alerts
 */

import { createElement } from '../utils/dom.ts';
import type { MapView } from '../map/MapView.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';

export interface Investigation {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  state: InvestigationState;
}

interface InvestigationState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  enabledLayers: string[];
  graphFocus?: string;
  timelineDays?: number;
}

const STORAGE_KEY = 'nw:investigations';

export class InvestigationManager {
  private mapView: MapView;
  private layerManager: MapLayerManager;
  private panel: HTMLElement | null = null;

  constructor(mapView: MapView, layerManager: MapLayerManager) {
    this.mapView = mapView;
    this.layerManager = layerManager;
  }

  toggle(container: HTMLElement): void {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
      return;
    }
    this.showPanel(container);
  }

  private showPanel(container: HTMLElement): void {
    this.panel = createElement('div', { className: 'nw-investigations-panel' });
    this.renderPanel();
    container.appendChild(this.panel);
  }

  private renderPanel(): void {
    if (!this.panel) return;

    const investigations = this.loadAll();

    this.panel.innerHTML = `
      <div class="nw-inv-header">
        <span class="nw-inv-title">INVESTIGATIONS</span>
        <div class="nw-inv-actions">
          <button class="nw-inv-save-btn">+ SAVE CURRENT</button>
          <button class="nw-inv-close">✕</button>
        </div>
      </div>
      <div class="nw-inv-list">
        ${
          investigations.length === 0
            ? '<div class="nw-inv-empty">No saved investigations. Click "Save Current" to create one from your current view.</div>'
            : investigations
                .map(
                  (inv) => `
              <div class="nw-inv-card" data-id="${inv.id}">
                <div class="nw-inv-card-header">
                  <span class="nw-inv-card-name">${inv.name}</span>
                  <span class="nw-inv-card-date">${new Date(inv.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="nw-inv-card-desc">${inv.description}</div>
                <div class="nw-inv-card-meta">${inv.state.enabledLayers.length} layers · ${inv.state.center[1].toFixed(0)}°N ${inv.state.center[0].toFixed(0)}°E</div>
                <div class="nw-inv-card-actions">
                  <button class="nw-inv-load" data-id="${inv.id}">LOAD</button>
                  <button class="nw-inv-share" data-id="${inv.id}">SHARE</button>
                  <button class="nw-inv-delete" data-id="${inv.id}">DELETE</button>
                </div>
              </div>
            `,
                )
                .join('')
        }
      </div>
    `;

    // Event handlers
    this.panel.querySelector('.nw-inv-close')?.addEventListener('click', () => {
      this.panel?.remove();
      this.panel = null;
    });

    this.panel.querySelector('.nw-inv-save-btn')?.addEventListener('click', () => this.saveCurrent());

    this.panel.querySelectorAll('.nw-inv-load').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.load(id);
      });
    });

    this.panel.querySelectorAll('.nw-inv-share').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.share(id);
      });
    });

    this.panel.querySelectorAll('.nw-inv-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.delete(id);
      });
    });
  }

  private saveCurrent(): void {
    const name = prompt('Investigation name:');
    if (!name) return;

    const description = prompt('Short description (optional):') || '';

    const map = this.mapView.getMap();
    const center = map?.getCenter();
    const zoom = map?.getZoom() || 3;
    const pitch = map?.getPitch() || 0;
    const bearing = map?.getBearing() || 0;

    const investigation: Investigation = {
      id: `inv-${Date.now()}`,
      name,
      description,
      createdAt: new Date().toISOString(),
      state: {
        center: [center?.lng || 0, center?.lat || 0],
        zoom,
        pitch,
        bearing,
        enabledLayers: this.layerManager.getEnabledLayers().map((l) => l.id),
      },
    };

    const all = this.loadAll();
    all.unshift(investigation);
    this.saveAll(all);
    this.renderPanel();
  }

  load(id: string): void {
    const investigations = this.loadAll();
    const inv = investigations.find((i) => i.id === id);
    if (!inv) return;

    const map = this.mapView.getMap();
    if (map) {
      map.flyTo({
        center: inv.state.center,
        zoom: inv.state.zoom,
        pitch: inv.state.pitch,
        bearing: inv.state.bearing,
        duration: 2000,
      });
    }

    // Disable all layers, then enable saved ones
    for (const layer of this.layerManager.getAllLayers()) {
      if (layer.isEnabled()) this.layerManager.disable(layer.id);
    }
    for (const layerId of inv.state.enabledLayers) {
      this.layerManager.enable(layerId);
    }

    // Focus graph if specified
    if (inv.state.graphFocus) {
      document.dispatchEvent(
        new CustomEvent('dashview:focus-entity', {
          detail: { type: 'country', id: inv.state.graphFocus, label: '' },
        }),
      );
    }

    // Close panel
    this.panel?.remove();
    this.panel = null;
  }

  private share(id: string): void {
    const investigations = this.loadAll();
    const inv = investigations.find((i) => i.id === id);
    if (!inv) return;

    // Encode state in URL
    const state = btoa(JSON.stringify(inv.state));
    const url = `${window.location.origin}/#/intel?inv=${encodeURIComponent(state)}&name=${encodeURIComponent(inv.name)}`;
    void navigator.clipboard.writeText(url).then(() => {
      const btn = this.panel?.querySelector(`[data-id="${id}"].nw-inv-share`);
      if (btn) {
        btn.textContent = 'COPIED!';
        setTimeout(() => {
          btn.textContent = 'SHARE';
        }, 2000);
      }
    });
  }

  private delete(id: string): void {
    const all = this.loadAll().filter((i) => i.id !== id);
    this.saveAll(all);
    this.renderPanel();
  }

  private loadAll(): Investigation[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Investigation[];
    } catch {
      return [];
    }
  }

  private saveAll(investigations: Investigation[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(investigations));
  }

  /** Load an investigation from URL params (for shared links) */
  static loadFromUrl(mapView: MapView, layerManager: MapLayerManager): boolean {
    const params = new URLSearchParams(window.location.search);
    const invState = params.get('inv');
    if (!invState) return false;

    try {
      const state = JSON.parse(atob(decodeURIComponent(invState))) as InvestigationState;
      const map = mapView.getMap();
      if (map) {
        map.flyTo({
          center: state.center,
          zoom: state.zoom,
          pitch: state.pitch,
          bearing: state.bearing,
          duration: 2000,
        });
      }

      for (const layer of layerManager.getAllLayers()) {
        if (layer.isEnabled()) layerManager.disable(layer.id);
      }
      for (const layerId of state.enabledLayers) {
        layerManager.enable(layerId);
      }

      // Clean URL
      history.replaceState(null, '', window.location.pathname + window.location.hash);
      return true;
    } catch {
      return false;
    }
  }
}
