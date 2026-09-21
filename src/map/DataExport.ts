import type { MapDataLayer } from './layers/LayerDefinition.ts';

export function exportLayerAsCSV(layer: MapDataLayer, layerData: Map<string, unknown>): void {
  const data = layerData.get(layer.id);
  if (!data || !Array.isArray(data) || data.length === 0) {
    alert('No data available for this layer');
    return;
  }

  const items = data as Record<string, unknown>[];
  const headers = Object.keys(items[0]);
  const rows = items.map((item) => headers.map((h) => String(item[h] ?? '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');

  downloadFile(`nexuswatch-${layer.id}.csv`, csv, 'text/csv');
}

export function exportLayerAsGeoJSON(layer: MapDataLayer, layerData: Map<string, unknown>): void {
  const data = layerData.get(layer.id);
  if (!data || !Array.isArray(data) || data.length === 0) {
    alert('No data available for this layer');
    return;
  }

  const items = data as Record<string, unknown>[];
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: items
      .filter((item) => item.lat !== undefined && item.lon !== undefined)
      .map((item) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [Number(item.lon), Number(item.lat)],
        },
        properties: Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'lat' && k !== 'lon')),
      })),
  };

  downloadFile(`nexuswatch-${layer.id}.geojson`, JSON.stringify(geojson, null, 2), 'application/geo+json');
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
