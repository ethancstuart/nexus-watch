import { createElement } from '../utils/dom.ts';

/**
 * Fetch raw CII score history for N country codes over `days` days from
 * /api/v1/cii-sparklines. Returns { code: number[] } for inline rendering.
 * Silent-fail on error — sparklines are cosmetic.
 */
export async function fetchSparklineData(codes: string[], days = 30): Promise<Record<string, number[]>> {
  if (codes.length === 0) return {};
  try {
    const q = new URLSearchParams({ days: String(days), codes: codes.join(',') });
    const res = await fetch(`/api/v1/cii-sparklines?${q.toString()}`);
    if (!res.ok) return {};
    const data = (await res.json()) as { series?: Record<string, Array<[string, number]>> };
    const out: Record<string, number[]> = {};
    for (const [code, pairs] of Object.entries(data.series ?? {})) {
      out[code] = pairs.map(([, score]) => score);
    }
    return out;
  } catch {
    return {};
  }
}

export function createSparkline(values: number[], width = 48, height = 16, color = '#ff6600'): HTMLElement {
  const el = createElement('span', { className: 'nw-sparkline' });

  if (values.length < 2) {
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    return el;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  el.innerHTML = svg;
  return el;
}
