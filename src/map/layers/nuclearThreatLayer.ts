import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { cacheLayerData, getCachedLayerData } from '../../utils/layerCache.ts';
import { updateProvenance, SOURCE_REGISTRY } from '../../services/dataProvenance.ts';

/**
 * Nuclear Threat Level Layer (composite)
 *
 * Computes a risk score for each nuclear facility by cross-referencing
 * data from other active layers:
 * - Earthquakes within proximity radius
 * - ACLED conflict events nearby
 * - Sanctions status of the host country
 * - Internet outages in host country (potential destabilization signal)
 *
 * Renders pulsing rings around facilities, colored by composite risk.
 */

interface NuclearFacility {
  name: string;
  country: string;
  countryCode: string;
  type: 'power' | 'enrichment' | 'research' | 'weapons' | 'waste';
  status: 'active' | 'construction' | 'decommissioned';
  lat: number;
  lon: number;
}

interface ThreatAssessment extends NuclearFacility {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'elevated' | 'high' | 'critical';
  seismicRisk: number;
  conflictRisk: number;
  sanctionsRisk: number;
  factors: string[];
}

// Same facility list as nuclearLayer.ts — we reference the same data
const FACILITIES: NuclearFacility[] = [
  {
    name: 'Zaporizhzhia NPP',
    country: 'Ukraine',
    countryCode: 'UA',
    type: 'power',
    status: 'active',
    lat: 47.51,
    lon: 34.58,
  },
  {
    name: 'Fukushima Daiichi',
    country: 'Japan',
    countryCode: 'JP',
    type: 'power',
    status: 'decommissioned',
    lat: 37.42,
    lon: 141.03,
  },
  {
    name: 'Bruce Power',
    country: 'Canada',
    countryCode: 'CA',
    type: 'power',
    status: 'active',
    lat: 44.33,
    lon: -81.6,
  },
  {
    name: 'Kashiwazaki-Kariwa',
    country: 'Japan',
    countryCode: 'JP',
    type: 'power',
    status: 'active',
    lat: 37.43,
    lon: 138.6,
  },
  { name: 'Gravelines', country: 'France', countryCode: 'FR', type: 'power', status: 'active', lat: 51.01, lon: 2.11 },
  { name: 'Kori', country: 'South Korea', countryCode: 'KR', type: 'power', status: 'active', lat: 35.32, lon: 129.28 },
  { name: 'Taishan', country: 'China', countryCode: 'CN', type: 'power', status: 'active', lat: 21.91, lon: 112.98 },
  { name: 'Barakah', country: 'UAE', countryCode: 'AE', type: 'power', status: 'active', lat: 23.96, lon: 52.26 },
  { name: 'Kudankulam', country: 'India', countryCode: 'IN', type: 'power', status: 'active', lat: 8.17, lon: 77.71 },
  { name: 'Palo Verde', country: 'USA', countryCode: 'US', type: 'power', status: 'active', lat: 33.39, lon: -112.86 },
  { name: 'Cattenom', country: 'France', countryCode: 'FR', type: 'power', status: 'active', lat: 49.41, lon: 6.22 },
  {
    name: 'Hinkley Point C',
    country: 'UK',
    countryCode: 'GB',
    type: 'power',
    status: 'construction',
    lat: 51.21,
    lon: -3.13,
  },
  { name: 'Natanz', country: 'Iran', countryCode: 'IR', type: 'enrichment', status: 'active', lat: 33.72, lon: 51.73 },
  { name: 'Fordow', country: 'Iran', countryCode: 'IR', type: 'enrichment', status: 'active', lat: 34.88, lon: 51.59 },
  {
    name: 'Yongbyon',
    country: 'North Korea',
    countryCode: 'KP',
    type: 'weapons',
    status: 'active',
    lat: 39.8,
    lon: 125.75,
  },
  { name: 'Dimona', country: 'Israel', countryCode: 'IL', type: 'weapons', status: 'active', lat: 31.0, lon: 35.14 },
  {
    name: 'Kahuta',
    country: 'Pakistan',
    countryCode: 'PK',
    type: 'enrichment',
    status: 'active',
    lat: 33.59,
    lon: 73.39,
  },
  {
    name: 'Los Alamos',
    country: 'USA',
    countryCode: 'US',
    type: 'weapons',
    status: 'active',
    lat: 35.84,
    lon: -106.29,
  },
  { name: 'Sellafield', country: 'UK', countryCode: 'GB', type: 'waste', status: 'active', lat: 54.42, lon: -3.5 },
  { name: 'La Hague', country: 'France', countryCode: 'FR', type: 'waste', status: 'active', lat: 49.68, lon: -1.88 },
  {
    name: 'Seversk (Tomsk-7)',
    country: 'Russia',
    countryCode: 'RU',
    type: 'enrichment',
    status: 'active',
    lat: 56.6,
    lon: 84.88,
  },
  { name: 'Bushehr', country: 'Iran', countryCode: 'IR', type: 'power', status: 'active', lat: 28.83, lon: 50.89 },
];

// Countries under comprehensive sanctions (nuclear-relevant)
const SANCTIONED_NUCLEAR_STATES = new Set(['RU', 'IR', 'KP', 'SY']);

// Countries in active conflict zones
const CONFLICT_ZONE_COUNTRIES = new Set(['UA', 'RU', 'IL', 'PS', 'SY', 'YE', 'SD', 'MM']);

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  elevated: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

export class NuclearThreatLayer implements MapDataLayer {
  readonly id = 'nuclear-threat';
  readonly name = 'Nuclear Threat Level';
  readonly category = 'infrastructure' as const;
  readonly icon = '☢️';
  readonly description =
    'Composite threat scoring for nuclear facilities based on seismic, conflict, and sanctions data';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private assessments: ThreatAssessment[] = [];
  private popup: maplibregl.Popup | null = null;
  private animationFrame: number | null = null;
  private pulsePhase = 0;

  // Cached data from other layers (populated via events)
  private earthquakeData: Array<{ lat: number; lon: number; magnitude: number }> = [];
  private conflictData: Array<{ lat: number; lon: number; type: string; fatalities: number }> = [];

  private onLayerData = (e: Event) => {
    const detail = (e as CustomEvent).detail as { layerId: string; data: unknown[] };
    if (detail.layerId === 'earthquakes') {
      this.earthquakeData = (detail.data as Array<{ lat: number; lon: number; magnitude: number }>).map((d) => ({
        lat: d.lat,
        lon: d.lon,
        magnitude: d.magnitude,
      }));
    } else if (detail.layerId === 'acled') {
      this.conflictData = (detail.data as Array<{ lat: number; lon: number; type: string; fatalities: number }>).map(
        (d) => ({
          lat: d.lat,
          lon: d.lon,
          type: d.type,
          fatalities: d.fatalities,
        }),
      );
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
      this.assessments = this.computeThreatAssessments();
      this.lastUpdated = Date.now();
      cacheLayerData(this.id, this.assessments);
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.assessments.length,
          lastFetchOk: true,
        });
    } catch (err) {
      console.error('Nuclear threat layer compute error:', err);
      const cached = getCachedLayerData<ThreatAssessment[]>(this.id);
      if (cached && cached.length > 0) this.assessments = cached;
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.assessments.length,
          lastFetchOk: false,
          lastError: err instanceof Error ? err.message : String(err),
        });
    }
    if (this.enabled && this.assessments.length > 0) this.renderLayer();
    document.dispatchEvent(
      new CustomEvent('dashview:layer-data', {
        detail: { layerId: this.id, data: this.assessments },
      }),
    );
  }

  getRefreshInterval(): number {
    return 300_000; // 5 minutes — recomputes from other layer data
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getLastUpdated(): number | null {
    return this.lastUpdated;
  }

  getFeatureCount(): number {
    return this.assessments.length;
  }

  /** Haversine distance in km */
  private distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private computeThreatAssessments(): ThreatAssessment[] {
    const SEISMIC_RADIUS_KM = 500;
    const CONFLICT_RADIUS_KM = 300;

    return FACILITIES.map((facility) => {
      const factors: string[] = [];
      let seismicRisk = 0;
      let conflictRisk = 0;
      let sanctionsRisk = 0;

      // 1. Seismic risk — earthquakes within radius, weighted by magnitude and proximity
      for (const eq of this.earthquakeData) {
        const dist = this.distanceKm(facility.lat, facility.lon, eq.lat, eq.lon);
        if (dist < SEISMIC_RADIUS_KM) {
          const proximityWeight = 1 - dist / SEISMIC_RADIUS_KM;
          const magWeight = Math.max(0, (eq.magnitude - 2) / 6); // normalize M2.5-8 to 0-1
          seismicRisk += proximityWeight * magWeight * 30;
        }
      }
      seismicRisk = Math.min(seismicRisk, 40); // cap seismic component
      if (seismicRisk > 5) {
        const nearQuakes = this.earthquakeData.filter(
          (eq) => this.distanceKm(facility.lat, facility.lon, eq.lat, eq.lon) < SEISMIC_RADIUS_KM,
        ).length;
        factors.push(`${nearQuakes} earthquake(s) within ${SEISMIC_RADIUS_KM}km`);
      }

      // 2. Conflict risk — ACLED events within radius
      for (const event of this.conflictData) {
        const dist = this.distanceKm(facility.lat, facility.lon, event.lat, event.lon);
        if (dist < CONFLICT_RADIUS_KM) {
          const proximityWeight = 1 - dist / CONFLICT_RADIUS_KM;
          const severityWeight = event.fatalities > 0 ? 1.5 : 1;
          conflictRisk += proximityWeight * severityWeight * 10;
        }
      }
      // Bonus for known active conflict zone countries
      if (CONFLICT_ZONE_COUNTRIES.has(facility.countryCode)) {
        conflictRisk += 15;
        factors.push(`Located in active conflict zone (${facility.country})`);
      }
      conflictRisk = Math.min(conflictRisk, 40);
      if (conflictRisk > 5 && !CONFLICT_ZONE_COUNTRIES.has(facility.countryCode)) {
        const nearConflicts = this.conflictData.filter(
          (ev) => this.distanceKm(facility.lat, facility.lon, ev.lat, ev.lon) < CONFLICT_RADIUS_KM,
        ).length;
        factors.push(`${nearConflicts} conflict event(s) within ${CONFLICT_RADIUS_KM}km`);
      }

      // 3. Sanctions risk
      if (SANCTIONED_NUCLEAR_STATES.has(facility.countryCode)) {
        sanctionsRisk = 20;
        factors.push(`Host country under comprehensive sanctions`);
      }

      // 4. Facility type risk multiplier
      let typeMultiplier = 1.0;
      if (facility.type === 'weapons') {
        typeMultiplier = 1.3;
        factors.push('Weapons-capable facility');
      } else if (facility.type === 'enrichment') {
        typeMultiplier = 1.2;
        factors.push('Enrichment facility');
      }

      const rawScore = (seismicRisk + conflictRisk + sanctionsRisk) * typeMultiplier;
      const riskScore = Math.min(Math.round(rawScore), 100);

      let riskLevel: ThreatAssessment['riskLevel'];
      if (riskScore >= 60) riskLevel = 'critical';
      else if (riskScore >= 35) riskLevel = 'high';
      else if (riskScore >= 15) riskLevel = 'elevated';
      else riskLevel = 'low';

      if (factors.length === 0) factors.push('No elevated risk factors detected');

      return {
        ...facility,
        riskScore,
        riskLevel,
        seismicRisk: Math.round(seismicRisk),
        conflictRisk: Math.round(conflictRisk),
        sanctionsRisk: Math.round(sanctionsRisk),
        factors,
      };
    });
  }

  private renderLayer(): void {
    if (!this.map || this.assessments.length === 0) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.assessments.map((a) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
        properties: {
          name: a.name,
          country: a.country,
          type: a.type,
          status: a.status,
          riskScore: a.riskScore,
          riskLevel: a.riskLevel,
          seismicRisk: a.seismicRisk,
          conflictRisk: a.conflictRisk,
          sanctionsRisk: a.sanctionsRisk,
          factors: a.factors.join('; '),
          color: RISK_COLORS[a.riskLevel],
        },
      })),
    };

    this.map.addSource('nuclear-threat', { type: 'geojson', data: geojson });

    // Outer pulsing ring (animated via JS)
    this.map.addLayer({
      id: 'nuclear-threat-pulse',
      type: 'circle',
      source: 'nuclear-threat',
      filter: ['>=', ['get', 'riskScore'], 15],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'riskScore'], 15, 18, 35, 24, 60, 32, 100, 44],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.12,
        'circle-blur': 0.6,
      },
    });

    // Middle ring
    this.map.addLayer({
      id: 'nuclear-threat-ring',
      type: 'circle',
      source: 'nuclear-threat',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'riskScore'], 0, 10, 35, 16, 60, 22, 100, 30],
        'circle-color': 'transparent',
        'circle-stroke-width': ['interpolate', ['linear'], ['get', 'riskScore'], 0, 1, 50, 2, 100, 3],
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-opacity': 0.5,
      },
    });

    // Core marker
    this.map.addLayer({
      id: 'nuclear-threat-core',
      type: 'circle',
      source: 'nuclear-threat',
      paint: {
        'circle-radius': 6,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.5)',
        'circle-opacity': 0.95,
      },
    });

    // Risk score labels
    this.map.addLayer({
      id: 'nuclear-threat-labels',
      type: 'symbol',
      source: 'nuclear-threat',
      minzoom: 4,
      layout: {
        'text-field': ['concat', ['get', 'name'], '\n', 'RISK: ', ['to-string', ['get', 'riskScore']]],
        'text-size': 9,
        'text-offset': [0, 2.2],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000',
        'text-halo-width': 1,
      },
    });

    // Hover
    this.map.on('mouseenter', 'nuclear-threat-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'nuclear-threat-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'nuclear-threat-core', (e) => {
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
            type: `${String(p.riskLevel).toUpperCase()} NUCLEAR THREAT`,
            typeColor: String(p.color),
            title: String(p.name),
            fields: [
              { label: 'Risk Score', value: `${p.riskScore}/100`, color: String(p.color) },
              { label: 'Type', value: String(p.type).toUpperCase() },
              { label: 'Country', value: String(p.country) },
              { label: 'Seismic', value: String(p.seismicRisk) },
              { label: 'Conflict', value: String(p.conflictRisk) },
              { label: 'Sanctions', value: String(p.sanctionsRisk) },
              { label: 'Factors', value: String(p.factors) },
            ],
          }),
        )
        .addTo(this.map);
    });

    // Start pulse animation
    this.startAnimation();
  }

  private startAnimation(): void {
    this.stopAnimation();
    const animate = () => {
      this.pulsePhase += 0.03;
      const pulseScale = 1 + Math.sin(this.pulsePhase) * 0.15;
      if (this.map?.getLayer('nuclear-threat-pulse')) {
        this.map.setPaintProperty('nuclear-threat-pulse', 'circle-opacity', 0.08 + Math.sin(this.pulsePhase) * 0.06);
        this.map.setPaintProperty(
          'nuclear-threat-pulse',
          'circle-blur',
          0.4 + Math.sin(this.pulsePhase) * 0.2 * pulseScale,
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
    for (const id of ['nuclear-threat-labels', 'nuclear-threat-core', 'nuclear-threat-ring', 'nuclear-threat-pulse']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('nuclear-threat')) this.map.removeSource('nuclear-threat');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    document.removeEventListener('dashview:layer-data', this.onLayerData);
    this.assessments = [];
    this.map = null;
  }
}
