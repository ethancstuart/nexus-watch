/**
 * CCTV Panel — 50+ live and refreshing webcam feeds at strategic locations.
 *
 * Loads catalog from /api/webcam-catalog (Windy-backed, 1h KV cache).
 * Three honesty tiers per card:
 *   - LIVE       → real iframe video stream (NASA ISS, Iceland aurora, Etna, etc.)
 *   - 30s        → real-frame thumbnail that auto-refreshes every 30s (Windy)
 *   - EXTERNAL   → link-out only (rare; we prefer thumbnail tier when available)
 *
 * Filter chips: All / Chokepoints / Ports / Cities / Weather / Space.
 * Click "Fly to" → globe pans/zooms to the camera location.
 * Click "Open feed" → opens the vendor's live page in a new tab.
 *
 * 2026-05-02 W2 rewrite: was 35 EarthCam-heavy cards with empty preview boxes
 * and a single "OPEN FEED" link. Now real previews on every card.
 */

import { createElement } from '../utils/dom.ts';
import type { MapView } from '../map/MapView.ts';

interface CatalogCam {
  id: string;
  name: string;
  type: 'chokepoint' | 'port' | 'city' | 'space' | 'weather' | 'landscape';
  lat: number;
  lon: number;
  region: string;
  status: 'live' | 'thumbnail' | 'external';
  thumbnail: string | null;
  embedUrl: string | null;
  viewerUrl: string;
  source: string;
}

interface CatalogResponse {
  cams: CatalogCam[];
  generatedAt: string;
  note?: string;
  error?: string;
}

const REFRESH_MS = 30_000;
const FILTER_OPTIONS: Array<{ id: string; label: string; types: CatalogCam['type'][] | null }> = [
  { id: 'all', label: 'ALL', types: null },
  { id: 'chokepoint', label: 'CHOKEPOINTS', types: ['chokepoint'] },
  { id: 'port', label: 'PORTS', types: ['port'] },
  { id: 'city', label: 'CITIES', types: ['city'] },
  { id: 'weather', label: 'WEATHER', types: ['weather', 'landscape'] },
  { id: 'space', label: 'SPACE', types: ['space'] },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class CctvPanel {
  private panel: HTMLElement | null = null;
  private mapView: MapView;
  private catalog: CatalogCam[] = [];
  private loadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  private filter = 'all';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(mapView: MapView) {
    this.mapView = mapView;
  }

  toggle(container: HTMLElement): void {
    if (this.panel) {
      this.close();
      return;
    }
    this.show(container);
  }

  private close(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.panel?.remove();
    this.panel = null;
  }

  private show(container: HTMLElement): void {
    this.panel = createElement('div', { className: 'nw-cctv-panel' });
    this.panel.innerHTML = `
      <div class="nw-cctv-header">
        <span class="nw-cctv-title">
          <span class="nw-cctv-live-dot"></span>
          PUBLIC WEBCAMS — STRATEGIC LOCATIONS
        </span>
        <div class="nw-cctv-filters">
          ${FILTER_OPTIONS.map(
            (f) =>
              `<button class="nw-cctv-filter${f.id === 'all' ? ' active' : ''}" data-filter="${f.id}">${f.label}</button>`,
          ).join('')}
        </div>
        <button class="nw-cctv-close" aria-label="Close webcam panel">✕</button>
      </div>
      <div class="nw-cctv-disclaimer">External public feeds — NexusWatch does not operate these cameras.</div>
      <div class="nw-cctv-grid" id="cctv-grid"></div>
    `;

    container.appendChild(this.panel);

    this.panel.querySelector('.nw-cctv-close')?.addEventListener('click', () => this.close());

    this.panel.querySelectorAll('.nw-cctv-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.panel?.querySelectorAll('.nw-cctv-filter').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.filter = (btn as HTMLElement).dataset.filter || 'all';
        this.renderGrid();
      });
    });

    void this.loadCatalog();

    // Refresh thumbnails every 30s by appending a cache-buster query param
    this.refreshTimer = setInterval(() => this.refreshThumbnails(), REFRESH_MS);
  }

  private async loadCatalog(): Promise<void> {
    this.loadState = 'loading';
    this.renderGrid();
    try {
      const res = await fetch('/api/webcam-catalog');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CatalogResponse;
      this.catalog = data.cams || [];
      this.loadState = 'ready';
    } catch (err) {
      console.error('[cctv] catalog load failed', err);
      this.loadState = 'error';
    }
    this.renderGrid();
  }

  private filtered(): CatalogCam[] {
    if (this.filter === 'all') return this.catalog;
    const opt = FILTER_OPTIONS.find((f) => f.id === this.filter);
    if (!opt || !opt.types) return this.catalog;
    return this.catalog.filter((c) => opt.types!.includes(c.type));
  }

  private renderGrid(): void {
    const grid = this.panel?.querySelector('#cctv-grid') as HTMLElement | null;
    if (!grid) return;

    if (this.loadState === 'loading') {
      grid.innerHTML = Array.from({ length: 8 })
        .map(
          () => `
        <div class="nw-cctv-card nw-cctv-card-skeleton">
          <div class="nw-cctv-card-preview"><div class="nw-skel" style="width:100%;height:100%"></div></div>
          <div class="nw-cctv-card-info"><div class="nw-skel" style="width:60%;height:12px"></div></div>
        </div>
      `,
        )
        .join('');
      return;
    }

    if (this.loadState === 'error') {
      grid.innerHTML =
        '<div class="nw-cctv-empty">Catalog failed to load. <button class="nw-cctv-retry">Try again</button></div>';
      grid.querySelector('.nw-cctv-retry')?.addEventListener('click', () => void this.loadCatalog());
      return;
    }

    const cams = this.filtered();
    if (cams.length === 0) {
      grid.innerHTML = '<div class="nw-cctv-empty">No cameras in this category.</div>';
      return;
    }

    grid.innerHTML = cams
      .map((cam) => {
        const tierLabel = cam.status === 'live' ? 'LIVE' : cam.status === 'thumbnail' ? '30s' : 'EXTERNAL';
        const tierClass = `nw-cctv-tier-${cam.status}`;
        const previewHtml =
          cam.status === 'live' && cam.embedUrl
            ? `<iframe src="${escapeHtml(cam.embedUrl)}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media" title="${escapeHtml(cam.name)}"></iframe>`
            : cam.thumbnail
              ? `<img src="${escapeHtml(cam.thumbnail)}" alt="${escapeHtml(cam.name)}" loading="lazy" referrerpolicy="no-referrer" />`
              : `<div class="nw-cctv-card-fallback">${escapeHtml(cam.type.toUpperCase())}</div>`;

        return `
        <div class="nw-cctv-card" data-cam-id="${escapeHtml(cam.id)}" data-lat="${cam.lat}" data-lon="${cam.lon}" data-url="${escapeHtml(cam.viewerUrl)}">
          <div class="nw-cctv-card-preview">
            ${previewHtml}
            <span class="nw-cctv-card-tier ${tierClass}">${tierLabel}</span>
          </div>
          <div class="nw-cctv-card-info">
            <span class="nw-cctv-card-name">${escapeHtml(cam.name)}</span>
            <span class="nw-cctv-card-region">${escapeHtml(cam.region)} · ${escapeHtml(cam.source)}</span>
          </div>
          <div class="nw-cctv-card-actions">
            <button class="nw-cctv-card-view" type="button">OPEN FEED</button>
            ${cam.lat || cam.lon ? '<button class="nw-cctv-card-flyto" type="button">FLY TO</button>' : ''}
          </div>
        </div>
      `;
      })
      .join('');

    grid.querySelectorAll('.nw-cctv-card').forEach((card) => {
      const el = card as HTMLElement;
      el.querySelector('.nw-cctv-card-view')?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(el.dataset.url, '_blank', 'noopener,noreferrer');
      });
      el.querySelector('.nw-cctv-card-flyto')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const lat = parseFloat(el.dataset.lat || '0');
        const lon = parseFloat(el.dataset.lon || '0');
        if (lat || lon) this.mapView.flyTo(lon, lat, 8);
      });
    });
  }

  private refreshThumbnails(): void {
    const grid = this.panel?.querySelector('#cctv-grid') as HTMLElement | null;
    if (!grid) return;
    // Append a cache-buster query param so the browser fetches a new frame.
    grid.querySelectorAll<HTMLImageElement>('.nw-cctv-card-preview img').forEach((img) => {
      const orig = img.src.split('#')[0].split('?')[0];
      img.src = `${orig}#t=${Date.now()}`;
    });
  }

  destroy(): void {
    this.close();
  }
}
