import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';
import { cacheLayerData, getCachedLayerData } from '../../utils/layerCache.ts';
import { updateProvenance, SOURCE_REGISTRY } from '../../services/dataProvenance.ts';

/**
 * Cyber Threat Intelligence Layer
 *
 * Aggregates data from:
 * - Existing cyber corridor data (from /api/cyber)
 * - Internet outages layer data (via events)
 * - Known APT group activity regions (curated)
 *
 * Renders per-country cyber threat levels as fill polygons
 * and pulsing hotspots for active campaign regions.
 */

interface CyberThreatCountry {
  code: string;
  name: string;
  lat: number;
  lon: number;
  threatLevel: 'critical' | 'high' | 'elevated' | 'moderate' | 'low';
  threatScore: number; // 0-100
  activeAPTs: string[];
  attackTypes: string[];
  hasOutage: boolean;
  isAttackSource: boolean;
}

// Known APT groups and their primary operating regions
const APT_REGIONS: Record<string, { groups: string[]; baseScore: number }> = {
  RU: { groups: ['APT28 (Fancy Bear)', 'APT29 (Cozy Bear)', 'Sandworm', 'Turla'], baseScore: 85 },
  CN: { groups: ['APT41', 'APT10', 'Hafnium', 'Volt Typhoon'], baseScore: 80 },
  KP: { groups: ['Lazarus Group', 'Kimsuky', 'APT38'], baseScore: 75 },
  IR: { groups: ['APT33 (Elfin)', 'APT34 (OilRig)', 'Charming Kitten'], baseScore: 70 },
  // Target countries with elevated threat due to being attack targets
  US: { groups: [], baseScore: 55 },
  UA: { groups: [], baseScore: 70 },
  TW: { groups: [], baseScore: 60 },
  IL: { groups: [], baseScore: 55 },
  KR: { groups: [], baseScore: 50 },
  JP: { groups: [], baseScore: 45 },
  DE: { groups: [], baseScore: 40 },
  GB: { groups: [], baseScore: 40 },
  FR: { groups: [], baseScore: 35 },
  SA: { groups: [], baseScore: 40 },
  IN: { groups: [], baseScore: 35 },
  AU: { groups: [], baseScore: 30 },
  PL: { groups: [], baseScore: 35 },
  EE: { groups: [], baseScore: 40 },
  LT: { groups: [], baseScore: 35 },
  LV: { groups: [], baseScore: 35 },
};

// Country centroids for hotspot rendering
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  RU: [55.8, 37.6],
  CN: [35.9, 104.2],
  KP: [39.0, 125.8],
  IR: [32.4, 53.7],
  US: [38.9, -77.0],
  UA: [50.4, 30.5],
  TW: [25.0, 121.5],
  IL: [31.8, 35.2],
  KR: [37.6, 127.0],
  JP: [35.7, 139.7],
  DE: [52.5, 13.4],
  GB: [51.5, -0.1],
  FR: [48.9, 2.3],
  SA: [24.7, 46.7],
  IN: [28.6, 77.2],
  AU: [-33.9, 151.2],
  PL: [52.2, 21.0],
  EE: [59.4, 24.7],
  LT: [54.7, 25.3],
  LV: [56.9, 24.1],
};

const THREAT_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#f97316',
  elevated: '#eab308',
  moderate: '#6366f1',
  low: '#22c55e',
};

export class CyberThreatLayer implements MapDataLayer {
  readonly id = 'cyber-threat';
  readonly name = 'Cyber Threat Intel';
  readonly category = 'intelligence' as const;
  readonly icon = '🖥️';
  readonly description = 'Per-country cyber threat levels from APT activity, attack corridors, and internet outages';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: CyberThreatCountry[] = [];
  private popup: maplibregl.Popup | null = null;
  private animationFrame: number | null = null;
  private pulsePhase = 0;

  // Data from other layers
  private outageCountries: Set<string> = new Set();
  private corridorData: Array<{
    source: string;
    target: string;
    level: string;
  }> = [];

  private onLayerData = (e: Event) => {
    const detail = (e as CustomEvent).detail as { layerId: string; data: unknown[] };
    if (detail.layerId === 'internet-outages') {
      this.outageCountries = new Set((detail.data as Array<{ code: string }>).map((d) => d.code));
    } else if (detail.layerId === 'cyber') {
      this.corridorData = (detail.data as Array<{ source: string; target: string; level: string }>).map((d) => ({
        source: d.source,
        target: d.target,
        level: d.level,
      }));
    }
  };

  init(map: MaplibreMap): void {
    this.map = map;
    document.addEventListener('dashview:layer-data', this.onLayerData);
  }

  enable(): void {
    this.enabled = true;
    this.renderLayer();
  }

  disable(): void {
    this.enabled = false;
    this.stopAnimation();
    this.removeLayer();
  }

  async refresh(): Promise<void> {
    const reg = SOURCE_REGISTRY[this.id];
    try {
      // Fetch corridor data if we don't have it yet
      if (this.corridorData.length === 0) {
        try {
          const res = await fetchWithRetry('/api/cyber');
          if (res.ok) {
            const json = (await res.json()) as {
              corridors: Array<{ source: string; target: string; level: string }>;
            };
            this.corridorData = json.corridors;
          }
        } catch {
          // Non-fatal — we can compute without live corridor data
        }
      }

      this.data = this.computeThreatLevels();
      this.lastUpdated = Date.now();
      cacheLayerData(this.id, this.data);
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.data.length,
          lastFetchOk: true,
        });
    } catch (err) {
      console.error('Cyber threat layer compute error:', err);
      const cached = getCachedLayerData<CyberThreatCountry[]>(this.id);
      if (cached && cached.length > 0) this.data = cached;
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.data.length,
          lastFetchOk: false,
          lastError: err instanceof Error ? err.message : String(err),
        });
    }
    if (this.enabled && this.data.length > 0) this.renderLayer();
    document.dispatchEvent(
      new CustomEvent('dashview:layer-data', {
        detail: { layerId: this.id, data: this.data },
      }),
    );
  }

  getRefreshInterval(): number {
    return 900_000; // 15 minutes
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getLastUpdated(): number | null {
    return this.lastUpdated;
  }

  getFeatureCount(): number {
    return this.data.length;
  }

  private computeThreatLevels(): CyberThreatCountry[] {
    const countries: CyberThreatCountry[] = [];

    for (const [code, region] of Object.entries(APT_REGIONS)) {
      const coords = COUNTRY_CENTROIDS[code];
      if (!coords) continue;

      let score = region.baseScore;
      const attackTypes: string[] = [];
      const isSource = ['RU', 'CN', 'KP', 'IR'].includes(code);

      // Boost from active corridor data
      const incomingAttacks = this.corridorData.filter((c) => c.target === code);
      const outgoingAttacks = this.corridorData.filter((c) => c.source === code);

      if (incomingAttacks.length > 0) {
        const criticalCount = incomingAttacks.filter((c) => c.level === 'critical').length;
        const highCount = incomingAttacks.filter((c) => c.level === 'high').length;
        score += criticalCount * 8 + highCount * 4;
        attackTypes.push('DDoS', 'APT Intrusion');
      }

      if (outgoingAttacks.length > 0) {
        score += outgoingAttacks.length * 3;
        attackTypes.push('Offensive Cyber Ops');
      }

      // Outage correlation — internet disruption increases threat level
      if (this.outageCountries.has(code)) {
        score += 15;
        attackTypes.push('Internet Disruption');
      }

      if (isSource) {
        attackTypes.push('State-sponsored APT Operations');
      }

      score = Math.min(score, 100);

      let threatLevel: CyberThreatCountry['threatLevel'];
      if (score >= 70) threatLevel = 'critical';
      else if (score >= 50) threatLevel = 'high';
      else if (score >= 35) threatLevel = 'elevated';
      else if (score >= 20) threatLevel = 'moderate';
      else threatLevel = 'low';

      // Determine country name from code
      const countryNames: Record<string, string> = {
        RU: 'Russia',
        CN: 'China',
        KP: 'North Korea',
        IR: 'Iran',
        US: 'United States',
        UA: 'Ukraine',
        TW: 'Taiwan',
        IL: 'Israel',
        KR: 'South Korea',
        JP: 'Japan',
        DE: 'Germany',
        GB: 'United Kingdom',
        FR: 'France',
        SA: 'Saudi Arabia',
        IN: 'India',
        AU: 'Australia',
        PL: 'Poland',
        EE: 'Estonia',
        LT: 'Lithuania',
        LV: 'Latvia',
      };

      countries.push({
        code,
        name: countryNames[code] || code,
        lat: coords[0],
        lon: coords[1],
        threatLevel,
        threatScore: score,
        activeAPTs: region.groups,
        attackTypes: attackTypes.length > 0 ? attackTypes : ['Low activity'],
        hasOutage: this.outageCountries.has(code),
        isAttackSource: isSource,
      });
    }

    return countries.sort((a, b) => b.threatScore - a.threatScore);
  }

  private renderLayer(): void {
    if (!this.map || this.data.length === 0) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
        properties: {
          code: c.code,
          name: c.name,
          threatLevel: c.threatLevel,
          threatScore: c.threatScore,
          activeAPTs: c.activeAPTs.join(', ') || 'None tracked',
          attackTypes: c.attackTypes.join(', '),
          hasOutage: c.hasOutage,
          isAttackSource: c.isAttackSource,
          color: THREAT_COLORS[c.threatLevel],
          radius: c.isAttackSource ? 20 : 14,
        },
      })),
    };

    // Separate source for critical/high hotspots only
    const hotspotGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data
        .filter((c) => c.threatLevel === 'critical' || c.threatLevel === 'high')
        .map((c) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
          properties: {
            color: THREAT_COLORS[c.threatLevel],
            radius: c.isAttackSource ? 30 : 22,
          },
        })),
    };

    this.map.addSource('cyber-threat', { type: 'geojson', data: geojson });
    this.map.addSource('cyber-threat-hotspots', { type: 'geojson', data: hotspotGeoJson });

    // Heatmap for overall cyber threat density
    this.map.addLayer({
      id: 'cyber-threat-heat',
      type: 'heatmap',
      source: 'cyber-threat',
      maxzoom: 6,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'threatScore'], 0, 0, 30, 0.2, 50, 0.5, 70, 0.8, 100, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 1],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0,0,0,0)',
          0.2,
          'rgba(99,102,241,0.2)',
          0.4,
          'rgba(234,179,8,0.3)',
          0.6,
          'rgba(249,115,22,0.4)',
          0.8,
          'rgba(220,38,38,0.5)',
          1,
          'rgba(220,38,38,0.7)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 20, 4, 50, 6, 80],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 6, 0.3],
      },
    });

    // Pulsing hotspot outer glow (critical/high only)
    this.map.addLayer({
      id: 'cyber-threat-hotspot-pulse',
      type: 'circle',
      source: 'cyber-threat-hotspots',
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.1,
        'circle-blur': 0.7,
      },
    });

    // Country threat markers
    this.map.addLayer({
      id: 'cyber-threat-markers',
      type: 'circle',
      source: 'cyber-threat',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'threatScore'], 20, 5, 50, 8, 70, 11, 100, 14],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': ['case', ['get', 'isAttackSource'], 2.5, 1.5],
        'circle-stroke-color': ['case', ['get', 'isAttackSource'], 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.3)'],
        'circle-opacity': 0.85,
      },
    });

    // Labels
    this.map.addLayer({
      id: 'cyber-threat-labels',
      type: 'symbol',
      source: 'cyber-threat',
      minzoom: 3,
      layout: {
        'text-field': ['concat', ['get', 'code'], ' ', ['to-string', ['get', 'threatScore']]],
        'text-size': 10,
        'text-offset': [0, -1.8],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000',
        'text-halo-width': 1,
      },
    });

    // Interactivity
    this.map.on('mouseenter', 'cyber-threat-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'cyber-threat-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'cyber-threat-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.threatLevel).toUpperCase()} CYBER THREAT`,
            typeColor: String(p.color),
            title: String(p.name),
            fields: [
              { label: 'Threat Score', value: `${p.threatScore}/100`, color: String(p.color) },
              {
                label: 'Role',
                value: p.isAttackSource ? 'ATTACK SOURCE' : 'TARGET',
                color: p.isAttackSource ? '#ef4444' : '#3b82f6',
              },
              { label: 'APT Groups', value: String(p.activeAPTs) },
              { label: 'Activity', value: String(p.attackTypes) },
              {
                label: 'Internet',
                value: p.hasOutage ? 'DISRUPTED' : 'Normal',
                color: p.hasOutage ? '#ef4444' : undefined,
              },
            ],
          }),
        )
        .addTo(this.map);
    });

    this.startAnimation();
  }

  private startAnimation(): void {
    this.stopAnimation();
    const animate = () => {
      this.pulsePhase += 0.04;
      if (this.map?.getLayer('cyber-threat-hotspot-pulse')) {
        this.map.setPaintProperty(
          'cyber-threat-hotspot-pulse',
          'circle-opacity',
          0.06 + Math.sin(this.pulsePhase) * 0.06,
        );
      }
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  private stopAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private removeLayer(): void {
    if (!this.map) return;
    this.stopAnimation();
    for (const id of [
      'cyber-threat-labels',
      'cyber-threat-markers',
      'cyber-threat-hotspot-pulse',
      'cyber-threat-heat',
    ]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    for (const src of ['cyber-threat', 'cyber-threat-hotspots']) {
      if (this.map.getSource(src)) this.map.removeSource(src);
    }
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    document.removeEventListener('dashview:layer-data', this.onLayerData);
    this.data = [];
    this.map = null;
  }
}
