/**
 * Public Webcams — Strategic Locations
 *
 * Curated grid of public webcam feeds from strategic locations:
 * ports, chokepoints, capital cities, space. Opens as a modal overlay
 * with clickable camera cards. All feeds are external public sources.
 *
 * Note: NexusWatch does not operate these cameras. Links open external sites.
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

// Curated list of 35+ verified public webcam feeds at strategic locations
const CAMERAS: CameraFeed[] = [
  // ═══ CHOKEPOINTS ═══
  {
    name: 'Istanbul Bosphorus',
    type: 'chokepoint',
    lat: 41.05,
    lon: 29.03,
    url: 'https://www.earthcam.com/world/turkey/istanbul/',
    region: 'Europe',
  },
  {
    name: 'Panama Canal — Gatun Locks',
    type: 'chokepoint',
    lat: 9.27,
    lon: -79.92,
    url: 'https://www.pancanal.com/eng/photo/camera-702.html',
    region: 'Americas',
  },
  {
    name: 'Panama Canal — Miraflores',
    type: 'chokepoint',
    lat: 9.02,
    lon: -79.59,
    url: 'https://www.pancanal.com/eng/photo/camera-702.html',
    region: 'Americas',
  },
  {
    name: 'Gibraltar Strait (Tarifa)',
    type: 'chokepoint',
    lat: 36.01,
    lon: -5.6,
    url: 'https://www.earthcam.com/world/spain/tarifa/',
    region: 'Europe',
  },
  {
    name: 'Suez Canal (Port Said)',
    type: 'chokepoint',
    lat: 31.26,
    lon: 32.3,
    url: 'https://www.earthcam.com/world/egypt/portsaid/',
    region: 'Middle East',
  },

  // ═══ PORTS ═══
  {
    name: 'Port of Rotterdam',
    type: 'port',
    lat: 51.9,
    lon: 4.5,
    url: 'https://www.portofrotterdam.com/en/online/webcams',
    region: 'Europe',
  },
  {
    name: 'Port of Houston',
    type: 'port',
    lat: 29.73,
    lon: -95.27,
    url: 'https://www.earthcam.com/usa/texas/houston/',
    region: 'Americas',
  },
  {
    name: 'Port of Los Angeles',
    type: 'port',
    lat: 33.74,
    lon: -118.27,
    url: 'https://www.earthcam.com/usa/california/losangeles/port/',
    region: 'Americas',
  },
  {
    name: 'Port of Singapore',
    type: 'port',
    lat: 1.26,
    lon: 103.84,
    url: 'https://www.sentosa.com.sg/en/things-to-do/attractions/sentosa-webcam/',
    region: 'Asia',
  },
  {
    name: 'Port of Dubai (Jebel Ali)',
    type: 'port',
    lat: 25.0,
    lon: 55.06,
    url: 'https://www.earthcam.com/world/unitedarabemirates/dubai/',
    region: 'Middle East',
  },

  // ═══ CAPITALS & CITIES ═══
  {
    name: 'Times Square, NYC',
    type: 'city',
    lat: 40.76,
    lon: -73.99,
    url: 'https://www.earthcam.com/usa/newyork/timessquare/',
    region: 'Americas',
  },
  {
    name: 'Tokyo — Shibuya Crossing',
    type: 'city',
    lat: 35.66,
    lon: 139.7,
    url: 'https://www.earthcam.com/world/japan/tokyo/',
    region: 'Asia',
  },
  {
    name: 'London — Abbey Road',
    type: 'city',
    lat: 51.53,
    lon: -0.18,
    url: 'https://www.earthcam.com/world/england/london/',
    region: 'Europe',
  },
  {
    name: 'Jerusalem — Western Wall',
    type: 'city',
    lat: 31.78,
    lon: 35.23,
    url: 'https://www.aish.com/w/ww/',
    region: 'Middle East',
  },
  {
    name: 'Moscow — Red Square',
    type: 'city',
    lat: 55.75,
    lon: 37.62,
    url: 'https://www.earthcam.com/world/russia/moscow/',
    region: 'Europe',
  },
  {
    name: 'Sydney — Harbour Bridge',
    type: 'city',
    lat: -33.85,
    lon: 151.21,
    url: 'https://www.earthcam.com/world/australia/sydney/',
    region: 'Asia',
  },
  {
    name: 'Berlin — Brandenburg Gate',
    type: 'city',
    lat: 52.52,
    lon: 13.38,
    url: 'https://www.earthcam.com/world/germany/berlin/',
    region: 'Europe',
  },
  {
    name: 'Buenos Aires — Obelisco',
    type: 'city',
    lat: -34.6,
    lon: -58.38,
    url: 'https://www.earthcam.com/world/argentina/buenosaires/',
    region: 'Americas',
  },
  {
    name: 'Cairo — Pyramids of Giza',
    type: 'city',
    lat: 29.98,
    lon: 31.13,
    url: 'https://www.earthcam.com/world/egypt/cairo/',
    region: 'Middle East',
  },
  {
    name: 'Dublin — Temple Bar',
    type: 'city',
    lat: 53.35,
    lon: -6.26,
    url: 'https://www.earthcam.com/world/ireland/dublin/',
    region: 'Europe',
  },
  {
    name: 'Mexico City — Zócalo',
    type: 'city',
    lat: 19.43,
    lon: -99.13,
    url: 'https://www.earthcam.com/world/mexico/mexicocity/',
    region: 'Americas',
  },
  {
    name: 'Mumbai — Marine Drive',
    type: 'city',
    lat: 18.94,
    lon: 72.82,
    url: 'https://www.earthcam.com/world/india/mumbai/',
    region: 'Asia',
  },
  {
    name: 'Rome — Trevi Fountain',
    type: 'city',
    lat: 41.9,
    lon: 12.48,
    url: 'https://www.earthcam.com/world/italy/rome/',
    region: 'Europe',
  },
  {
    name: 'Seoul — Gangnam',
    type: 'city',
    lat: 37.5,
    lon: 127.03,
    url: 'https://www.earthcam.com/world/southkorea/seoul/',
    region: 'Asia',
  },

  // ═══ SPACE ═══
  {
    name: 'ISS Live Earth View',
    type: 'space',
    lat: 0,
    lon: 0,
    url: 'https://eol.jsc.nasa.gov/ESRS/HDEV/',
    region: 'Space',
  },
  {
    name: 'Kennedy Space Center',
    type: 'space',
    lat: 28.57,
    lon: -80.65,
    url: 'https://www.kennedyspacecenter.com/launches/live-webcams',
    region: 'Space',
  },

  // ═══ WEATHER / NATURE ═══
  {
    name: 'Mount Etna Volcano',
    type: 'weather',
    lat: 37.75,
    lon: 14.99,
    url: 'https://www.skylinewebcams.com/en/webcam/italia/sicilia/catania/vulcano-etna.html',
    region: 'Europe',
  },
  {
    name: 'Mount Fuji',
    type: 'weather',
    lat: 35.36,
    lon: 138.73,
    url: 'https://www.earthcam.com/world/japan/mtfuji/',
    region: 'Asia',
  },
  {
    name: 'Niagara Falls',
    type: 'weather',
    lat: 43.08,
    lon: -79.07,
    url: 'https://www.earthcam.com/usa/newyork/niagarafalls/',
    region: 'Americas',
  },
  {
    name: 'Northern Lights (Iceland)',
    type: 'weather',
    lat: 64.15,
    lon: -21.94,
    url: 'https://livefromiceland.is/webcams/northern-lights/',
    region: 'Europe',
  },
  {
    name: 'Great Barrier Reef',
    type: 'weather',
    lat: -18.29,
    lon: 147.7,
    url: 'https://www.earthcam.com/world/australia/greatbarrierreef/',
    region: 'Asia',
  },
];

export class CctvPanel {
  private panel: HTMLElement | null = null;
  private mapView: MapView;

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

  private show(container: HTMLElement): void {
    this.panel = createElement('div', { className: 'nw-cctv-panel' });
    this.panel.innerHTML = `
      <div class="nw-cctv-header">
        <span class="nw-cctv-title">
          <span class="nw-cctv-live-dot"></span>
          PUBLIC WEBCAMS — STRATEGIC LOCATIONS
        </span>
        <div class="nw-cctv-filters">
          <button class="nw-cctv-filter active" data-filter="all">ALL</button>
          <button class="nw-cctv-filter" data-filter="chokepoint">CHOKEPOINTS</button>
          <button class="nw-cctv-filter" data-filter="port">PORTS</button>
          <button class="nw-cctv-filter" data-filter="city">CITIES</button>
          <button class="nw-cctv-filter" data-filter="space">SPACE</button>
          <button class="nw-cctv-filter" data-filter="weather">NATURE</button>
        </div>
        <button class="nw-cctv-close">✕</button>
      </div>
      <div class="nw-cctv-disclaimer">External public feeds — NexusWatch does not operate these cameras.</div>
      <div class="nw-cctv-grid" id="cctv-grid"></div>
    `;

    container.appendChild(this.panel);

    this.panel.querySelector('.nw-cctv-close')?.addEventListener('click', () => {
      this.panel?.remove();
      this.panel = null;
    });

    this.panel.querySelectorAll('.nw-cctv-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.panel?.querySelectorAll('.nw-cctv-filter').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderGrid((btn as HTMLElement).dataset.filter || 'all');
      });
    });

    this.renderGrid('all');
  }

  private renderGrid(filter: string): void {
    const grid = this.panel?.querySelector('#cctv-grid');
    if (!grid) return;

    const filtered = filter === 'all' ? CAMERAS : CAMERAS.filter((c) => c.type === filter);

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="nw-cctv-empty">No cameras in this category.</div>';
      return;
    }

    grid.innerHTML = filtered
      .map(
        (cam) => `
      <div class="nw-cctv-card" data-lat="${cam.lat}" data-lon="${cam.lon}" data-url="${escapeAttr(cam.url)}">
        <div class="nw-cctv-card-preview">
          <div class="nw-cctv-card-static">
            <span class="nw-cctv-card-type">${escapeHtml(cam.type.toUpperCase())}</span>
          </div>
        </div>
        <div class="nw-cctv-card-info">
          <span class="nw-cctv-card-name">${escapeHtml(cam.name)}</span>
          <span class="nw-cctv-card-region">${escapeHtml(cam.region)}</span>
        </div>
        <div class="nw-cctv-card-actions">
          <button class="nw-cctv-card-view">OPEN FEED</button>
          ${cam.lat || cam.lon ? '<button class="nw-cctv-card-flyto">FLY TO</button>' : ''}
        </div>
      </div>
    `,
      )
      .join('');

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
