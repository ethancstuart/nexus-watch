import { createElement } from '../utils/dom.ts';

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
