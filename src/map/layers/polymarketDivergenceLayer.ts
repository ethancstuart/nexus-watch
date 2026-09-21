import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';

interface Divergence {
  market: string;
  market_probability: number;
  country_code: string;
  country_name: string;
  cii_score: number;
  divergence: number;
  abs_divergence: number;
  signal: 'market_sees_more_risk' | 'cii_sees_more_risk' | 'aligned';
  lat: number;
  lon: number;
  source: string;
  url: string;
  volume: number;
}

/**
 * Polymarket × CII Divergence Layer
 *
 * Shows where prediction markets disagree with the Country Instability Index.
 * Each marker indicates a significant divergence (20+ points) between
 * market probability and CII score — an insight for analysts.
 */
export class PolymarketDivergenceLayer implements MapDataLayer {
  readonly id = 'polymarket-divergence';
  readonly name = 'Market × CII Divergence';
  readonly category = 'intelligence' as const;
  readonly icon = '⚡';
  readonly description = 'Where prediction markets disagree with CII scores';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: Divergence[] = [];
  private markers: maplibregl.Marker[] = [];
  private popup: maplibregl.Popup | null = null;

  init(map: MaplibreMap): void {
    this.map = map;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    this.enabled = true;
    void this.refresh();
  }

  disable(): void {
    this.enabled = false;
    this.clearMarkers();
  }

  destroy(): void {
    this.disable();
    this.map = null;
  }

  getRefreshInterval(): number {
    return 300000; // 5 min
  }

  getFeatureCount(): number {
    return this.data.filter((d) => d.signal !== 'aligned').length;
  }

  async refresh(): Promise<void> {
    if (!this.enabled || !this.map) return;

    try {
      const res = await fetchWithRetry('/api/v2/prediction-divergence');
      const json = (await res.json()) as { divergences: Divergence[] };
      this.data = (json.divergences || []).filter((d): d is Divergence => d !== null);
      this.lastUpdated = Date.now();
      this.render();
    } catch {
      // Silent fail — layer degrades gracefully
    }
  }

  getLastUpdated(): number | null {
    return this.lastUpdated;
  }

  private clearMarkers(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
    this.popup?.remove();
  }

  private render(): void {
    if (!this.map) return;
    this.clearMarkers();

    for (const d of this.data) {
      if (d.signal === 'aligned') continue; // Only show divergences

      const el = document.createElement('div');
      el.className = 'nw-divergence-marker';
      el.style.cssText = `
        width: ${Math.min(36, 20 + d.abs_divergence / 3)}px;
        height: ${Math.min(36, 20 + d.abs_divergence / 3)}px;
        border-radius: 50%;
        border: 2px solid ${d.signal === 'market_sees_more_risk' ? '#ff6600' : '#8b5cf6'};
        background: ${d.signal === 'market_sees_more_risk' ? 'rgba(255,102,0,0.2)' : 'rgba(139,92,246,0.2)'};
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: #fff;
        font-family: 'JetBrains Mono', monospace;
      `;
      el.textContent = `${d.divergence > 0 ? '+' : ''}${d.divergence}`;
      el.title = `${d.country_name}: Market ${d.market_probability}% vs CII ${d.cii_score}`;

      const marker = new maplibregl.Marker({ element: el }).setLngLat([d.lon, d.lat]).addTo(this.map);

      el.addEventListener('click', () => {
        this.popup?.remove();

        const signalText =
          d.signal === 'market_sees_more_risk'
            ? 'Markets price MORE risk than CII measures'
            : 'CII measures MORE risk than markets price';

        const popupHtml = `
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;max-width:280px;color:#e0e0e0;">
            <div style="color:#ff6600;font-size:10px;letter-spacing:0.15em;font-weight:600;margin-bottom:6px;">
              DIVERGENCE: ${d.abs_divergence} POINTS
            </div>
            <div style="font-weight:700;margin-bottom:8px;">${d.country_name} (${d.country_code})</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="color:#888;">Market:</span>
              <span style="font-weight:600;">${d.market_probability}%</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#888;">CII Score:</span>
              <span style="font-weight:600;">${d.cii_score}</span>
            </div>
            <div style="font-size:10px;color:${d.signal === 'market_sees_more_risk' ? '#ff6600' : '#8b5cf6'};margin-bottom:8px;">
              ${signalText}
            </div>
            <div style="font-size:10px;color:#666;margin-bottom:4px;">${d.market}</div>
            <a href="${d.url}" target="_blank" rel="noopener" style="font-size:10px;color:#ff6600;text-decoration:none;">
              View on ${d.source} →
            </a>
          </div>
        `;

        this.popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: '320px',
          className: 'nw-dark-popup',
        })
          .setLngLat([d.lon, d.lat])
          .setHTML(popupHtml)
          .addTo(this.map!);
      });

      this.markers.push(marker);
    }
  }
}
