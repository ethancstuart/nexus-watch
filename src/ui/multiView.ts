/**
 * Synchronized Multi-View Controller
 *
 * Manages split-screen mode: Map | Timeline | Graph | Data Table
 * All views are linked via dashview:focus-entity CustomEvent.
 * Click event in any view → all others update.
 *
 * Keyboard shortcuts: M (map), T (timeline), G (graph), D (data table)
 */

import { createElement } from '../utils/dom.ts';
import type { MapView } from '../map/MapView.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';
import type { EntityGraphPanel } from './entityGraph.ts';
import type { TimelineBar } from './timelineBar.ts';

export interface FocusEvent {
  type: 'country' | 'earthquake' | 'ship' | 'conflict' | 'infrastructure' | 'chokepoint';
  id: string;
  label: string;
  lat?: number;
  lon?: number;
  data?: Record<string, unknown>;
}

interface MultiViewConfig {
  mapContainer: HTMLElement;
  mapView: MapView;
  layerManager: MapLayerManager;
  entityGraph: EntityGraphPanel;
  timeline: TimelineBar;
}

export class MultiViewController {
  private config: MultiViewConfig;
  private active = false;
  private tablePanel: HTMLElement | null = null;
  private focusHandler: ((e: Event) => void) | null = null;

  constructor(config: MultiViewConfig) {
    this.config = config;
  }

  toggle(): void {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activate(): void {
    this.active = true;

    // Add multi-view class to map container for CSS layout
    this.config.mapContainer.classList.add('nw-multiview-active');

    // Show the entity graph if not visible
    if (!this.config.entityGraph.isVisible()) {
      this.config.entityGraph.show();
    }

    // Show the timeline
    this.config.timeline.show();

    // Create data table panel
    this.createDataTable();

    // Listen for focus events
    this.focusHandler = (e: Event) => {
      const detail = (e as CustomEvent<FocusEvent>).detail;
      if (detail) this.onFocus(detail);
    };
    document.addEventListener('dashview:focus-entity', this.focusHandler);

    // Dispatch activation event
    document.dispatchEvent(new CustomEvent('dashview:multiview', { detail: { active: true } }));
  }

  deactivate(): void {
    this.active = false;
    this.config.mapContainer.classList.remove('nw-multiview-active');

    if (this.focusHandler) {
      document.removeEventListener('dashview:focus-entity', this.focusHandler);
      this.focusHandler = null;
    }

    this.tablePanel?.remove();
    this.tablePanel = null;

    document.dispatchEvent(new CustomEvent('dashview:multiview', { detail: { active: false } }));
  }

  private onFocus(event: FocusEvent): void {
    // Update map — fly to location
    if (event.lat !== undefined && event.lon !== undefined) {
      this.config.mapView.flyTo(event.lon, event.lat, 6);
    }

    // Update entity graph — focus node if it's a country
    if (event.type === 'country' && event.id) {
      this.config.entityGraph.focusNode(event.id);
    }

    // Update data table — highlight row
    this.highlightTableRow(event.id);

    // Update info bar
    this.updateInfoBar(event);
  }

  private createDataTable(): void {
    if (this.tablePanel) this.tablePanel.remove();

    this.tablePanel = createElement('div', { className: 'nw-data-table-panel' });
    this.tablePanel.innerHTML = `
      <div class="nw-data-table-header">
        <span class="nw-data-table-title">DATA TABLE</span>
        <div class="nw-data-table-tabs">
          <button class="nw-data-table-tab active" data-tab="cii">CII</button>
          <button class="nw-data-table-tab" data-tab="events">EVENTS</button>
          <button class="nw-data-table-tab" data-tab="dark">DARK VESSELS</button>
        </div>
      </div>
      <div class="nw-data-table-body" id="data-table-body">
        <div class="nw-data-table-loading">Loading...</div>
      </div>
    `;

    this.config.mapContainer.appendChild(this.tablePanel);

    // Tab handlers
    this.tablePanel.querySelectorAll('.nw-data-table-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.tablePanel?.querySelectorAll('.nw-data-table-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = (tab as HTMLElement).dataset.tab || 'cii';
        void this.loadTableData(tabName);
      });
    });

    // Load initial data
    void this.loadTableData('cii');
  }

  private async loadTableData(tab: string): Promise<void> {
    const body = this.tablePanel?.querySelector('#data-table-body');
    if (!body) return;
    body.innerHTML = '<div class="nw-data-table-loading">Loading...</div>';

    try {
      if (tab === 'cii') {
        const res = await fetch('/api/v1/cii');
        const data = (await res.json()) as {
          scores: Array<{
            countryCode: string;
            countryName: string;
            score: number;
            components: Record<string, number>;
          }>;
        };
        const scores = (data.scores || []).sort((a, b) => b.score - a.score);

        body.innerHTML = `
          <table class="nw-data-table">
            <thead>
              <tr>
                <th>Country</th><th>CII</th><th>Conflict</th><th>Disasters</th>
                <th>Gov</th><th>Market</th>
              </tr>
            </thead>
            <tbody>
              ${scores
                .map(
                  (s) => `
                <tr class="nw-data-table-row" data-id="${s.countryCode}" data-lat="" data-lon="">
                  <td>${s.countryName}</td>
                  <td class="nw-data-table-score" style="color:${s.score >= 50 ? '#ef4444' : s.score >= 30 ? '#fbbf24' : '#4ade80'}">${s.score}</td>
                  <td>${s.components.conflict ?? 0}</td>
                  <td>${s.components.disasters ?? 0}</td>
                  <td>${s.components.governance ?? 0}</td>
                  <td>${s.components.marketExposure ?? 0}</td>
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        `;

        // Row click → focus entity
        body.querySelectorAll('.nw-data-table-row').forEach((row) => {
          row.addEventListener('click', () => {
            const id = (row as HTMLElement).dataset.id || '';
            document.dispatchEvent(
              new CustomEvent('dashview:focus-entity', {
                detail: {
                  type: 'country',
                  id,
                  label: row.querySelector('td')?.textContent || '',
                },
              }),
            );
          });
        });
      } else if (tab === 'events') {
        // Show recent earthquakes
        const res = await fetch('/api/earthquakes');
        const data = (await res.json()) as {
          features?: Array<{
            properties: { mag: number; place: string; time: number };
            geometry: { coordinates: [number, number] };
          }>;
        };
        const quakes = (data.features || []).filter((f) => f.properties.mag >= 4.0).slice(0, 30);

        body.innerHTML = `
          <table class="nw-data-table">
            <thead><tr><th>Mag</th><th>Location</th><th>Time</th></tr></thead>
            <tbody>
              ${quakes
                .map((q) => {
                  const ago = Math.round((Date.now() - q.properties.time) / 60000);
                  return `
                  <tr class="nw-data-table-row" data-lat="${q.geometry.coordinates[1]}" data-lon="${q.geometry.coordinates[0]}">
                    <td style="color:#ff6600;font-weight:700;">M${q.properties.mag.toFixed(1)}</td>
                    <td>${q.properties.place}</td>
                    <td>${ago}m ago</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        `;

        body.querySelectorAll('.nw-data-table-row').forEach((row) => {
          row.addEventListener('click', () => {
            const lat = parseFloat((row as HTMLElement).dataset.lat || '0');
            const lon = parseFloat((row as HTMLElement).dataset.lon || '0');
            document.dispatchEvent(
              new CustomEvent('dashview:focus-entity', {
                detail: {
                  type: 'earthquake',
                  id: '',
                  label: row.querySelector('td:nth-child(2)')?.textContent || '',
                  lat,
                  lon,
                },
              }),
            );
          });
        });
      } else if (tab === 'dark') {
        const res = await fetch('/api/dark-vessels');
        const data = (await res.json()) as {
          active: Array<{
            mmsi: string;
            name: string;
            type: string;
            lat: number;
            lon: number;
            durationMinutes: number;
            sensitiveArea: string;
          }>;
        };

        if ((data.active || []).length === 0) {
          body.innerHTML = '<div class="nw-data-table-empty">No dark vessels detected. Check back later.</div>';
          return;
        }

        body.innerHTML = `
          <table class="nw-data-table">
            <thead><tr><th>Vessel</th><th>Type</th><th>Area</th><th>Dark (min)</th></tr></thead>
            <tbody>
              ${(data.active || [])
                .map(
                  (v) => `
                <tr class="nw-data-table-row" data-lat="${v.lat}" data-lon="${v.lon}">
                  <td>${v.name}</td>
                  <td>${v.type}</td>
                  <td style="color:#ef4444;">${v.sensitiveArea}</td>
                  <td>${v.durationMinutes}</td>
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        `;

        body.querySelectorAll('.nw-data-table-row').forEach((row) => {
          row.addEventListener('click', () => {
            const lat = parseFloat((row as HTMLElement).dataset.lat || '0');
            const lon = parseFloat((row as HTMLElement).dataset.lon || '0');
            document.dispatchEvent(
              new CustomEvent('dashview:focus-entity', {
                detail: { type: 'ship', id: '', label: row.querySelector('td')?.textContent || '', lat, lon },
              }),
            );
          });
        });
      }
    } catch {
      body.innerHTML = '<div class="nw-data-table-empty">Failed to load data.</div>';
    }
  }

  private highlightTableRow(id: string): void {
    this.tablePanel?.querySelectorAll('.nw-data-table-row').forEach((row) => {
      row.classList.toggle('highlighted', (row as HTMLElement).dataset.id === id);
    });
  }

  private updateInfoBar(event: FocusEvent): void {
    // Dispatch for status bar consumption
    document.dispatchEvent(
      new CustomEvent('dashview:multiview-focus', {
        detail: { label: event.label, type: event.type },
      }),
    );
  }

  destroy(): void {
    this.deactivate();
  }
}

/**
 * Dispatch a focus event from anywhere in the app.
 * All multi-view panels will respond.
 */
export function focusEntity(event: FocusEvent): void {
  document.dispatchEvent(new CustomEvent('dashview:focus-entity', { detail: event }));
}
