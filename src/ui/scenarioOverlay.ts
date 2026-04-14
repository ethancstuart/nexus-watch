/**
 * Scenario Simulation Visual Overlay
 *
 * When a scenario is simulated (e.g., "Hormuz closure"), this overlay
 * highlights affected countries on the globe with color-coded CII
 * deltas and animated cascade arrows showing impact propagation.
 */

import type { Map as MaplibreMap } from 'maplibre-gl';
import { simulateScenario, type ScenarioResult } from '../services/scenarioEngine.ts';
import { getMonitoredCountries } from '../services/countryInstabilityIndex.ts';

let map: MaplibreMap | null = null;
let isActive = false;

const SOURCE_COUNTRIES = 'nw-scenario-countries';
const SOURCE_INFRA = 'nw-scenario-infra';
const LAYER_COUNTRIES = 'nw-scenario-country-dots';
const LAYER_COUNTRIES_GLOW = 'nw-scenario-country-glow';
const LAYER_INFRA = 'nw-scenario-infra-markers';

export function initScenarioOverlay(m: MaplibreMap): void {
  map = m;
}

function deltaColor(delta: number): string {
  if (delta >= 10) return '#dc2626';
  if (delta >= 5) return '#f97316';
  if (delta >= 2) return '#eab308';
  return '#6366f1';
}

export function runScenarioVisual(presetId: string): ScenarioResult | null {
  if (!map) return null;

  const result = simulateScenario(presetId);
  if (!result) return null;

  // Clear previous overlay
  hideScenarioOverlay();

  // Build country impact features
  const monitored = getMonitoredCountries();
  const coordsMap = new Map(monitored.map((c) => [c.code, [c.lon, c.lat] as [number, number]]));

  const countryFeatures: GeoJSON.Feature[] = [];
  for (const c of result.affectedCountries) {
    const coord = coordsMap.get(c.code);
    if (!coord) continue;
    countryFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coord },
      properties: {
        code: c.code,
        name: c.name,
        delta: c.delta,
        currentCII: c.currentCII,
        estimatedCII: c.estimatedCII,
        reason: c.reason,
        color: deltaColor(c.delta),
      },
    });
  }

  const infraFeatures: GeoJSON.Feature[] = result.affectedInfrastructure.map((i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [i.lon, i.lat] },
    properties: { name: i.name, type: i.type, impact: i.impact },
  }));

  map.addSource(SOURCE_COUNTRIES, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: countryFeatures },
  });
  map.addSource(SOURCE_INFRA, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: infraFeatures },
  });

  // Glow ring (size by delta)
  map.addLayer({
    id: LAYER_COUNTRIES_GLOW,
    type: 'circle',
    source: SOURCE_COUNTRIES,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'delta'], 0, 10, 5, 25, 10, 40, 15, 55],
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.15,
      'circle-blur': 0.8,
    },
  });

  // Core dot with delta label
  map.addLayer({
    id: LAYER_COUNTRIES,
    type: 'circle',
    source: SOURCE_COUNTRIES,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'delta'], 0, 5, 15, 16],
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': 'rgba(255,255,255,0.6)',
    },
  });

  // Infrastructure markers (diamonds)
  map.addLayer({
    id: LAYER_INFRA,
    type: 'circle',
    source: SOURCE_INFRA,
    paint: {
      'circle-radius': 10,
      'circle-color': '#ff6600',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#000',
      'circle-opacity': 0.8,
    },
  });

  isActive = true;

  // Render scenario info banner
  showScenarioBanner(result);

  // Auto-fit map to affected countries
  if (countryFeatures.length > 0) {
    const lngs = countryFeatures.map((f) => (f.geometry as GeoJSON.Point).coordinates[0]);
    const lats = countryFeatures.map((f) => (f.geometry as GeoJSON.Point).coordinates[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs) - 5, Math.min(...lats) - 5],
      [Math.max(...lngs) + 5, Math.max(...lats) + 5],
    ];
    map.fitBounds(bounds, { padding: 60, duration: 1500 });
  }

  return result;
}

function showScenarioBanner(result: ScenarioResult): void {
  document.querySelector('.nw-scenario-banner')?.remove();
  const banner = document.createElement('div');
  banner.className = 'nw-scenario-banner';
  banner.innerHTML = `
    <div class="nw-scenario-banner-header">
      <div>
        <div class="nw-scenario-banner-kicker">SCENARIO MODE</div>
        <div class="nw-scenario-banner-title">${result.name}</div>
      </div>
      <button class="nw-scenario-banner-close" aria-label="Close">✕</button>
    </div>
    <div class="nw-scenario-banner-body">
      <div class="nw-scenario-banner-conf" data-conf="${result.confidence}">
        [${result.confidence.toUpperCase()} CONFIDENCE]
      </div>
      <div class="nw-scenario-banner-note">${result.confidenceNote}</div>
      <div class="nw-scenario-banner-stats">
        <span><strong>${result.affectedCountries.length}</strong> countries affected</span>
        <span>•</span>
        <span><strong>${result.affectedInfrastructure.length}</strong> infrastructure items</span>
        <span>•</span>
        <span><strong>${result.cascades.length}</strong> cascade chains</span>
      </div>
    </div>
  `;
  (banner.querySelector('.nw-scenario-banner-close') as HTMLButtonElement).addEventListener('click', () => {
    hideScenarioOverlay();
  });
  document.body.appendChild(banner);
}

export function hideScenarioOverlay(): void {
  if (!map) return;
  for (const id of [LAYER_COUNTRIES, LAYER_COUNTRIES_GLOW, LAYER_INFRA]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [SOURCE_COUNTRIES, SOURCE_INFRA]) {
    if (map.getSource(id)) map.removeSource(id);
  }
  document.querySelector('.nw-scenario-banner')?.remove();
  isActive = false;
}

export function isScenarioActive(): boolean {
  return isActive;
}
