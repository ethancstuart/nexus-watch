/**
 * CCTV / Live Camera Panel
 *
 * Shows a grid of public webcam feeds from strategic locations:
 * ports, chokepoints, capital cities, launch sites.
 * Opens as a modal overlay with clickable camera cards.
 */

import { createElement } from '../utils/dom.ts';
import type { MapView } from '../map/MapView.ts';

interface CameraFeed {
  name: string;
  type: string;
  lat: number;
  lon: number;
  url: string;
  region: string;
}

export class CctvPanel {
  private panel: HTMLElement | null = null;
  private mapView: MapView;
  private cameras: CameraFeed[] = [];

  constructor(mapView: MapView) {
    this.mapView = mapView;
  }

  toggle(container: HTMLElement): void {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
      return;
    }
    this.show(container);
  }

  private async show(container: HTMLElement): Promise<void> {
    this.panel = createElement('div', { className: 'nw-cctv-panel' });
    this.panel.innerHTML = `
      <div class="nw-cctv-header">
        <span class="nw-cctv-title">
          <span class="nw-cctv-live-dot"></span>
          LIVE CAMERAS
        </span>
        <div class="nw-cctv-filters">
          <button class="nw-cctv-filter active" data-filter="all">ALL</button>
          <button class="nw-cctv-filter" data-filter="port">PORTS</button>
          <button class="nw-cctv-filter" data-filter="city">CITIES</button>
          <button class="nw-cctv-filter" data-filter="space">SPACE</button>
        </div>
        <button class="nw-cctv-close">✕</button>
      </div>
      <div class="nw-cctv-grid" id="cctv-grid">
        <div class="nw-cctv-loading">Loading camera feeds...</div>
      </div>
    `;

    container.appendChild(this.panel);

    // Close button
    this.panel.querySelector('.nw-cctv-close')?.addEventListener('click', () => {
      this.panel?.remove();
      this.panel = null;
    });

    // Filter buttons
    this.panel.querySelectorAll('.nw-cctv-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.panel?.querySelectorAll('.nw-cctv-filter').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderGrid((btn as HTMLElement).dataset.filter || 'all');
      });
    });

    // Load camera data from data lake
    await this.loadCameras();
    this.renderGrid('all');
  }

  private async loadCameras(): Promise<void> {
    try {
      const res = await fetch('/api/v1/data-lake?layer=live-cameras');
      if (res.ok) {
        const data = (await res.json()) as { data: CameraFeed[] };
        this.cameras = Array.isArray(data.data) ? data.data : [];
      }
    } catch {
      /* use fallback */
    }

    // Fallback if data lake doesn't have cameras yet
    if (this.cameras.length === 0) {
      this.cameras = [
        {
          name: 'ISS Live Earth View',
          type: 'space',
          lat: 0,
          lon: 0,
          url: 'https://eol.jsc.nasa.gov/ESRS/HDEV/',
          region: 'Space',
        },
        {
          name: 'Panama Canal',
          type: 'port',
          lat: 9.02,
          lon: -79.59,
          url: 'https://www.pancanal.com/eng/photo/camera-702.html',
          region: 'Americas',
        },
        {
          name: 'Times Square',
          type: 'city',
          lat: 40.76,
          lon: -73.99,
          url: 'https://www.earthcam.com/usa/newyork/timessquare/',
          region: 'Americas',
        },
        {
          name: 'Tokyo Shibuya',
          type: 'city',
          lat: 35.66,
          lon: 139.7,
          url: 'https://www.earthcam.com/world/japan/tokyo/',
          region: 'Asia',
        },
        {
          name: 'Jerusalem',
          type: 'city',
          lat: 31.78,
          lon: 35.23,
          url: 'https://www.aish.com/w/ww/',
          region: 'Middle East',
        },
        {
          name: 'Istanbul Bosphorus',
          type: 'chokepoint',
          lat: 41.05,
          lon: 29.03,
          url: 'https://www.earthcam.com/world/turkey/istanbul/',
          region: 'Europe',
        },
      ];
    }
  }

  private renderGrid(filter: string): void {
    const grid = this.panel?.querySelector('#cctv-grid');
    if (!grid) return;

    const filtered = filter === 'all' ? this.cameras : this.cameras.filter((c) => c.type === filter);

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="nw-cctv-empty">No cameras in this category.</div>';
      return;
    }

    grid.innerHTML = filtered
      .map(
        (cam) => `
      <div class="nw-cctv-card" data-lat="${cam.lat}" data-lon="${cam.lon}" data-url="${cam.url}">
        <div class="nw-cctv-card-preview">
          <div class="nw-cctv-card-static">
            <span class="nw-cctv-card-rec">● REC</span>
            <span class="nw-cctv-card-type">${cam.type.toUpperCase()}</span>
          </div>
        </div>
        <div class="nw-cctv-card-info">
          <span class="nw-cctv-card-name">${cam.name}</span>
          <span class="nw-cctv-card-region">${cam.region}</span>
        </div>
        <div class="nw-cctv-card-actions">
          <button class="nw-cctv-card-view">OPEN FEED</button>
          <button class="nw-cctv-card-flyto">FLY TO</button>
        </div>
      </div>
    `,
      )
      .join('');

    // Wire card actions
    grid.querySelectorAll('.nw-cctv-card').forEach((card) => {
      const el = card as HTMLElement;
      el.querySelector('.nw-cctv-card-view')?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(el.dataset.url, '_blank');
      });
      el.querySelector('.nw-cctv-card-flyto')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const lat = parseFloat(el.dataset.lat || '0');
        const lon = parseFloat(el.dataset.lon || '0');
        if (lat || lon) this.mapView.flyTo(lon, lat, 8);
      });
    });
  }

  destroy(): void {
    this.panel?.remove();
    this.panel = null;
  }
}
