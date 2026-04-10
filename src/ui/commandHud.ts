/**
 * Command Center HUD Overlay
 *
 * Adds surveillance/broadcast-quality visual elements on top of the map:
 * - Corner brackets (CCTV-style framing)
 * - LIVE indicator with pulse
 * - Timestamp overlay
 * - Scan line effect (subtle)
 * - Data stream indicator
 * - Grid coordinate readout
 */

import { createElement } from '../utils/dom.ts';
import type { MapView } from '../map/MapView.ts';

export class CommandHud {
  private container: HTMLElement;
  private map: MapView;
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private coordsHandler: (() => void) | null = null;

  constructor(mapContainer: HTMLElement, mapView: MapView) {
    this.container = mapContainer;
    this.map = mapView;
    this.init();
  }

  private init(): void {
    // HUD overlay container
    const hud = createElement('div', { className: 'nw-hud' });
    hud.innerHTML = `
      <div class="nw-hud-corners">
        <div class="nw-hud-corner tl"></div>
        <div class="nw-hud-corner tr"></div>
        <div class="nw-hud-corner bl"></div>
        <div class="nw-hud-corner br"></div>
      </div>

      <div class="nw-hud-top-left">
        <div class="nw-hud-live">
          <span class="nw-hud-live-dot"></span>
          <span class="nw-hud-live-text">LIVE</span>
        </div>
        <div class="nw-hud-classification">UNCLASSIFIED // NEXUSWATCH</div>
      </div>

      <div class="nw-hud-top-right">
        <div class="nw-hud-timestamp"></div>
        <div class="nw-hud-coords">--°N --°E</div>
      </div>

      <div class="nw-hud-bottom-left">
        <div class="nw-hud-datastream">
          <span class="nw-hud-stream-label">DATA FEED</span>
          <span class="nw-hud-stream-bars">
            <span></span><span></span><span></span><span></span><span></span>
          </span>
        </div>
      </div>

      <div class="nw-hud-scanline"></div>
    `;

    this.container.appendChild(hud);

    // Update clock
    const tsEl = hud.querySelector('.nw-hud-timestamp') as HTMLElement;
    const updateClock = () => {
      const now = new Date();
      const utc = now.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
      tsEl.textContent = utc;
    };
    updateClock();
    this.clockInterval = setInterval(updateClock, 1000);

    // Update coordinates on mouse move
    const coordsEl = hud.querySelector('.nw-hud-coords') as HTMLElement;
    const mapInstance = this.map.getMap();
    if (mapInstance) {
      const handler = (e: { lngLat: { lng: number; lat: number } }) => {
        const { lat, lng } = e.lngLat;
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lng >= 0 ? 'E' : 'W';
        coordsEl.textContent = `${Math.abs(lat).toFixed(2)}°${latDir} ${Math.abs(lng).toFixed(2)}°${lonDir}`;
      };
      mapInstance.on('mousemove', handler);
      this.coordsHandler = () => mapInstance.off('mousemove', handler);
    }
  }

  destroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.coordsHandler) this.coordsHandler();
    this.container.querySelector('.nw-hud')?.remove();
  }
}
