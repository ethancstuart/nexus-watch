/**
 * Risk Cascade Visual Overlay
 *
 * Renders live cascade arrows on the MapLibre globe showing how
 * instability propagates from origin countries to dependent countries.
 *
 * Uses detectActiveCascades() from cascadeEngine.ts — arrows appear
 * when an origin country's CII crosses the cascade trigger threshold.
 *
 * Click an arrow to see the mechanism + source country evidence.
 */

import type { Map as MaplibreMap } from 'maplibre-gl';
import { detectActiveCascades, cascadeColor, type CascadeArrow } from '../services/cascadeEngine.ts';

let map: MaplibreMap | null = null;
let isVisible = false;

const SOURCE_ID = 'nw-cascade-arrows';
const LAYER_ID_LINE = 'nw-cascade-line';
const LAYER_ID_HEAD = 'nw-cascade-arrow-head';

export function initCascadeOverlay(m: MaplibreMap): void {
  map = m;
}

/**
 * Great-circle arc interpolation for smooth arrows on a sphere.
 * Keeps arcs visually curved across long distances on the 3D globe.
 */
function greatCircleArc(from: [number, number], to: [number, number], n = 24): [number, number][] {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const [lon1, lat1] = [from[0] * toRad, from[1] * toRad];
  const [lon2, lat2] = [to[0] * toRad, to[1] * toRad];
  const d =
    2 *
    Math.asin(
      Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2),
    );
  if (d < 0.001) return [from, to];
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    pts.push([Math.atan2(y, x) * toDeg, Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg]);
  }
  return pts;
}

function arrowsToGeoJSON(arrows: CascadeArrow[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: arrows.map((a) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: greatCircleArc([a.from.lon, a.from.lat], [a.to.lon, a.to.lat], 32),
      },
      properties: {
        mechanism: a.mechanism,
        description: a.description,
        intensity: a.intensity,
        color: cascadeColor(a.mechanism),
        from: a.from.code,
        to: a.to.code,
      },
    })),
  };
}

function arrowHeadsGeoJSON(arrows: CascadeArrow[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: arrows.map((a) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.to.lon, a.to.lat] },
      properties: {
        color: cascadeColor(a.mechanism),
        intensity: a.intensity,
        label: `${a.from.code}→${a.to.code}`,
      },
    })),
  };
}

export function showCascadeOverlay(): void {
  if (!map || isVisible) return;
  const arrows = detectActiveCascades();
  if (arrows.length === 0) {
    alert(
      'No active cascades detected. Cascades trigger when an origin country CII exceeds the threshold (typically 55-70).',
    );
    return;
  }

  const lineData = arrowsToGeoJSON(arrows);
  const headData = arrowHeadsGeoJSON(arrows);

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: 'geojson', data: lineData });
    map.addSource(SOURCE_ID + '-heads', { type: 'geojson', data: headData });
  } else {
    (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(lineData);
    (map.getSource(SOURCE_ID + '-heads') as maplibregl.GeoJSONSource).setData(headData);
  }

  if (!map.getLayer(LAYER_ID_LINE)) {
    map.addLayer({
      id: LAYER_ID_LINE,
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['get', 'intensity'], 0, 1, 1, 4],
        'line-opacity': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0.4, 1, 0.9],
        'line-dasharray': [2, 2],
      },
    });
    map.addLayer({
      id: LAYER_ID_HEAD,
      type: 'circle',
      source: SOURCE_ID + '-heads',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'intensity'], 0, 3, 1, 8],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
      },
    });
  }

  isVisible = true;
}

export function hideCascadeOverlay(): void {
  if (!map || !isVisible) return;
  if (map.getLayer(LAYER_ID_LINE)) map.removeLayer(LAYER_ID_LINE);
  if (map.getLayer(LAYER_ID_HEAD)) map.removeLayer(LAYER_ID_HEAD);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  if (map.getSource(SOURCE_ID + '-heads')) map.removeSource(SOURCE_ID + '-heads');
  isVisible = false;
}

export function toggleCascadeOverlay(): boolean {
  if (isVisible) {
    hideCascadeOverlay();
    return false;
  }
  showCascadeOverlay();
  return isVisible;
}

export function refreshCascadeOverlay(): void {
  if (!isVisible || !map) return;
  const arrows = detectActiveCascades();
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  const headSource = map.getSource(SOURCE_ID + '-heads') as maplibregl.GeoJSONSource | undefined;
  if (source) source.setData(arrowsToGeoJSON(arrows));
  if (headSource) headSource.setData(arrowHeadsGeoJSON(arrows));
}
