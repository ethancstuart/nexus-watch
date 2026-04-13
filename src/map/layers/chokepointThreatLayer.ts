import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { cacheLayerData, getCachedLayerData } from '../../utils/layerCache.ts';
import { updateProvenance, SOURCE_REGISTRY } from '../../services/dataProvenance.ts';

/**
 * Maritime Chokepoint Threat Layer (composite)
 *
 * Real-time threat assessment for strategic maritime chokepoints.
 * Computes threat levels by cross-referencing:
 * - Ship tracking density near chokepoints
 * - ACLED conflict events in proximity (especially Houthi/piracy)
 * - Sanctions status of bordering nations
 * - Known threat corridors
 *
 * Extends the basic ChokepointStatusLayer with data-driven threat scoring.
 */

interface Chokepoint {
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  description: string;
  borderingCountries: string[];
  dailyTraffic: string; // human-readable
  oilTransitPct: number;
  tradeTransitPct: number;
}

interface ChokepointThreat extends Chokepoint {
  threatScore: number; // 0-100
  threatLevel: 'critical' | 'high' | 'elevated' | 'normal';
  conflictEvents: number;
  shipDensity: number;
  factors: string[];
}

const CHOKEPOINTS: Chokepoint[] = [
  {
    name: 'Strait of Hormuz',
    lat: 26.57,
    lon: 56.25,
    radiusKm: 150,
    description: 'Connects Persian Gulf to Gulf of Oman',
    borderingCountries: ['IR', 'OM'],
    dailyTraffic: '~21M bbl/day oil',
    oilTransitPct: 21,
    tradeTransitPct: 8,
  },
  {
    name: 'Suez Canal',
    lat: 30.46,
    lon: 32.35,
    radiusKm: 100,
    description: 'Connects Mediterranean to Red Sea',
    borderingCountries: ['EG'],
    dailyTraffic: '~50 ships/day',
    oilTransitPct: 9,
    tradeTransitPct: 12,
  },
  {
    name: 'Bab el-Mandeb',
    lat: 12.58,
    lon: 43.33,
    radiusKm: 120,
    description: 'Red Sea gateway, Houthi threat zone',
    borderingCountries: ['YE', 'DJ', 'ER'],
    dailyTraffic: '~6.2M bbl/day oil',
    oilTransitPct: 9,
    tradeTransitPct: 7,
  },
  {
    name: 'Strait of Malacca',
    lat: 2.5,
    lon: 101.8,
    radiusKm: 200,
    description: 'Connects Indian Ocean to Pacific',
    borderingCountries: ['MY', 'SG', 'ID'],
    dailyTraffic: '~16M bbl/day oil',
    oilTransitPct: 16,
    tradeTransitPct: 25,
  },
  {
    name: 'Panama Canal',
    lat: 9.08,
    lon: -79.68,
    radiusKm: 80,
    description: 'Atlantic-Pacific shortcut',
    borderingCountries: ['PA'],
    dailyTraffic: '~40 ships/day',
    oilTransitPct: 1,
    tradeTransitPct: 5,
  },
  {
    name: 'Taiwan Strait',
    lat: 24.2,
    lon: 119.5,
    radiusKm: 150,
    description: 'Major shipping lane, geopolitical flashpoint',
    borderingCountries: ['CN', 'TW'],
    dailyTraffic: '~$2.45T goods/year',
    oilTransitPct: 0,
    tradeTransitPct: 10,
  },
];

// Countries with active conflict or sanctions
const CONFLICT_COUNTRIES = new Set(['YE', 'IR', 'RU', 'SY', 'SD', 'MM']);
const SANCTIONED_COUNTRIES = new Set(['RU', 'IR', 'KP', 'SY', 'CU', 'VE']);

const THREAT_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  elevated: '#eab308',
  normal: '#22c55e',
};

export class ChokepointThreatLayer implements MapDataLayer {
  readonly id = 'chokepoint-threat';
  readonly name = 'Chokepoint Threat';
  readonly category = 'infrastructure' as const;
  readonly icon = '⚓';
  readonly description = 'Real-time threat assessment for 6 strategic maritime chokepoints';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private threats: ChokepointThreat[] = [];
  private popup: maplibregl.Popup | null = null;
  private animationFrame: number | null = null;
  private pulsePhase = 0;

  // Cross-layer data
  private conflictData: Array<{
    lat: number;
    lon: number;
    type: string;
    country: string;
    fatalities: number;
  }> = [];
  private shipData: Array<{ lat: number; lon: number }> = [];

  private onLayerData = (e: Event) => {
    const detail = (e as CustomEvent).detail as { layerId: string; data: unknown[] };
    if (detail.layerId === 'acled') {
      this.conflictData = (
        detail.data as Array<{
          lat: number;
          lon: number;
          type: string;
          country: string;
          fatalities: number;
        }>
      ).map((d) => ({
        lat: d.lat,
        lon: d.lon,
        type: d.type,
        country: d.country,
        fatalities: d.fatalities,
      }));
    } else if (detail.layerId === 'ships') {
      this.shipData = (detail.data as Array<{ lat: number; lon: number }>).map((d) => ({
        lat: d.lat,
        lon: d.lon,
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
      this.threats = this.computeThreats();
      this.lastUpdated = Date.now();
      cacheLayerData(this.id, this.threats);
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.threats.length,
          lastFetchOk: true,
        });
    } catch (err) {
      console.error('Chokepoint threat layer compute error:', err);
      const cached = getCachedLayerData<ChokepointThreat[]>(this.id);
      if (cached && cached.length > 0) this.threats = cached;
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.threats.length,
          lastFetchOk: false,
          lastError: err instanceof Error ? err.message : String(err),
        });
    }
    if (this.enabled && this.threats.length > 0) this.renderLayer();
    document.dispatchEvent(
      new CustomEvent('dashview:layer-data', {
        detail: { layerId: this.id, data: this.threats },
      }),
    );
  }

  getRefreshInterval(): number {
    return 600_000; // 10 minutes
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getLastUpdated(): number | null {
    return this.lastUpdated;
  }

  getFeatureCount(): number {
    return this.threats.length;
  }

  private distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private computeThreats(): ChokepointThreat[] {
    return CHOKEPOINTS.map((cp) => {
      const factors: string[] = [];
      let threatScore = 0;

      // 1. Conflict proximity — events within 500km of chokepoint
      const nearbyConflicts = this.conflictData.filter((c) => this.distanceKm(cp.lat, cp.lon, c.lat, c.lon) < 500);
      const conflictEvents = nearbyConflicts.length;
      if (conflictEvents > 0) {
        const fatalitySum = nearbyConflicts.reduce((s, c) => s + c.fatalities, 0);
        threatScore += Math.min(conflictEvents * 3 + fatalitySum * 0.5, 35);
        factors.push(`${conflictEvents} conflict events within 500km`);
      }

      // 2. Bordering country risk
      const hasConflictBorder = cp.borderingCountries.some((c) => CONFLICT_COUNTRIES.has(c));
      const hasSanctionedBorder = cp.borderingCountries.some((c) => SANCTIONED_COUNTRIES.has(c));
      if (hasConflictBorder) {
        threatScore += 20;
        factors.push('Borders active conflict zone');
      }
      if (hasSanctionedBorder) {
        threatScore += 10;
        factors.push('Borders sanctioned nation');
      }

      // 3. Ship density — more ships = more attractive target but also more monitoring
      const nearbyShips = this.shipData.filter((s) => this.distanceKm(cp.lat, cp.lon, s.lat, s.lon) < cp.radiusKm);
      const shipDensity = nearbyShips.length;
      if (shipDensity > 0) {
        factors.push(`${shipDensity} vessel(s) in transit zone`);
      }

      // 4. Strategic importance multiplier
      const importanceMultiplier = 1 + (cp.oilTransitPct + cp.tradeTransitPct) / 100;
      threatScore = Math.round(threatScore * importanceMultiplier);

      // 5. Known active threat escalation (hard-coded geopolitical context)
      if (cp.name === 'Bab el-Mandeb') {
        threatScore += 30; // Active Houthi attacks on shipping
        factors.push('Active Houthi anti-shipping campaign');
      } else if (cp.name === 'Strait of Hormuz') {
        threatScore += 15; // Iran tensions
        factors.push('Iran nuclear/sanctions escalation');
      } else if (cp.name === 'Taiwan Strait') {
        threatScore += 10; // PLA military pressure
        factors.push('PLA military posturing');
      }

      threatScore = Math.min(threatScore, 100);

      let threatLevel: ChokepointThreat['threatLevel'];
      if (threatScore >= 60) threatLevel = 'critical';
      else if (threatScore >= 35) threatLevel = 'high';
      else if (threatScore >= 15) threatLevel = 'elevated';
      else threatLevel = 'normal';

      if (factors.length === 0) factors.push('No elevated threat factors');

      return {
        ...cp,
        threatScore,
        threatLevel,
        conflictEvents,
        shipDensity,
        factors,
      };
    });
  }

  private renderLayer(): void {
    if (!this.map || this.threats.length === 0) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.threats.map((t) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [t.lon, t.lat] },
        properties: {
          name: t.name,
          description: t.description,
          threatLevel: t.threatLevel,
          threatScore: t.threatScore,
          conflictEvents: t.conflictEvents,
          shipDensity: t.shipDensity,
          dailyTraffic: t.dailyTraffic,
          oilPct: t.oilTransitPct,
          tradePct: t.tradeTransitPct,
          factors: t.factors.join('; '),
          color: THREAT_COLORS[t.threatLevel],
          outerRadius: 20 + (t.threatScore / 100) * 30,
        },
      })),
    };

    this.map.addSource('chokepoint-threat', { type: 'geojson', data: geojson });

    // Threat zone — large outer ring proportional to threat
    this.map.addLayer({
      id: 'chokepoint-threat-zone',
      type: 'circle',
      source: 'chokepoint-threat',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2,
          ['get', 'outerRadius'],
          5,
          ['*', ['get', 'outerRadius'], 1.5],
          8,
          ['*', ['get', 'outerRadius'], 2],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.06,
        'circle-blur': 0.4,
      },
    });

    // Threat ring border
    this.map.addLayer({
      id: 'chokepoint-threat-ring',
      type: 'circle',
      source: 'chokepoint-threat',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2,
          ['get', 'outerRadius'],
          5,
          ['*', ['get', 'outerRadius'], 1.5],
          8,
          ['*', ['get', 'outerRadius'], 2],
        ],
        'circle-color': 'transparent',
        'circle-stroke-width': 2,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-opacity': 0.35,
      },
    });

    // Inner threat ring (pulse target)
    this.map.addLayer({
      id: 'chokepoint-threat-inner-ring',
      type: 'circle',
      source: 'chokepoint-threat',
      filter: ['>=', ['get', 'threatScore'], 30],
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2,
          ['*', ['get', 'outerRadius'], 0.6],
          5,
          ['*', ['get', 'outerRadius'], 0.8],
        ],
        'circle-color': 'transparent',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-opacity': 0.25,
      },
    });

    // Core marker
    this.map.addLayer({
      id: 'chokepoint-threat-core',
      type: 'circle',
      source: 'chokepoint-threat',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'threatScore'], 0, 6, 50, 9, 100, 14],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2.5,
        'circle-stroke-color': 'rgba(255,255,255,0.5)',
        'circle-opacity': 0.95,
      },
    });

    // Labels
    this.map.addLayer({
      id: 'chokepoint-threat-labels',
      type: 'symbol',
      source: 'chokepoint-threat',
      layout: {
        'text-field': ['concat', ['get', 'name'], '\nTHREAT: ', ['to-string', ['get', 'threatScore']], '/100'],
        'text-size': 10,
        'text-offset': [0, 2.5],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000',
        'text-halo-width': 1,
      },
    });

    // Hover
    this.map.on('mouseenter', 'chokepoint-threat-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'chokepoint-threat-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'chokepoint-threat-core', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 14,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.threatLevel).toUpperCase()} CHOKEPOINT THREAT`,
            typeColor: String(p.color),
            title: String(p.name),
            fields: [
              { label: 'Threat Score', value: `${p.threatScore}/100`, color: String(p.color) },
              { label: 'Description', value: String(p.description) },
              { label: 'Daily Traffic', value: String(p.dailyTraffic) },
              { label: 'Oil Transit', value: `${p.oilPct}% of global` },
              { label: 'Trade Transit', value: `${p.tradePct}% of global` },
              { label: 'Nearby Conflicts', value: String(p.conflictEvents) },
              { label: 'Ships in Zone', value: String(p.shipDensity) },
              { label: 'Factors', value: String(p.factors) },
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
      this.pulsePhase += 0.025;
      if (this.map?.getLayer('chokepoint-threat-zone')) {
        this.map.setPaintProperty('chokepoint-threat-zone', 'circle-opacity', 0.04 + Math.sin(this.pulsePhase) * 0.04);
      }
      if (this.map?.getLayer('chokepoint-threat-inner-ring')) {
        this.map.setPaintProperty(
          'chokepoint-threat-inner-ring',
          'circle-stroke-opacity',
          0.15 + Math.sin(this.pulsePhase * 1.5) * 0.15,
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
      'chokepoint-threat-labels',
      'chokepoint-threat-core',
      'chokepoint-threat-inner-ring',
      'chokepoint-threat-ring',
      'chokepoint-threat-zone',
    ]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('chokepoint-threat')) this.map.removeSource('chokepoint-threat');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    document.removeEventListener('dashview:layer-data', this.onLayerData);
    this.threats = [];
    this.map = null;
  }
}
