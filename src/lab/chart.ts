/**
 * Tiny d3-backed chart renderer for the Data Lab.
 *
 * Three kinds: line, bar, scatter. Takes a QueryRowsResult-style
 * {columns, rows} payload and an x/y column hint. No legends, no
 * fancy axes — the data is the headline; the chart is decoration.
 *
 * 2026-05 tier-up Phase 1.
 */

import * as d3 from 'd3';

export type ChartKind = 'line' | 'bar' | 'scatter';

export interface RenderChartOpts {
  kind: ChartKind;
  columns: string[];
  rows: unknown[][];
  x: string;
  y: string;
  width?: number;
  height?: number;
}

const COLOR = '#ff6600';
const AXIS = '#888';
const GRID = '#222';

export function renderChart(target: HTMLElement, opts: RenderChartOpts): void {
  target.innerHTML = '';
  const width = opts.width ?? target.clientWidth ?? 720;
  const height = opts.height ?? 320;
  const margin = { top: 18, right: 24, bottom: 48, left: 56 };

  const xi = opts.columns.indexOf(opts.x);
  const yi = opts.columns.indexOf(opts.y);
  if (xi < 0 || yi < 0) {
    target.textContent = `Chart error: column not found (x=${opts.x}, y=${opts.y})`;
    return;
  }

  const data = opts.rows.map((r) => ({ x: r[xi], y: Number(r[yi]) })).filter((d) => Number.isFinite(d.y));
  if (data.length === 0) {
    target.textContent = 'No numeric data for selected y column.';
    return;
  }

  const svg = d3.select(target).append('svg').attr('width', width).attr('height', height);

  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const isCategorical = opts.kind === 'bar' || typeof data[0].x === 'string';
  const yScale = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.y) as [number, number])
    .nice()
    .range([innerH, 0]);

  g.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(yScale).ticks(5))
    .selectAll('text')
    .attr('fill', AXIS)
    .style('font-family', 'JetBrains Mono, monospace')
    .style('font-size', '10px');

  if (isCategorical) {
    const xScale = d3
      .scaleBand<string>()
      .domain(data.map((d) => String(d.x)))
      .range([0, innerW])
      .padding(0.18);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', AXIS)
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px')
      .attr('transform', 'rotate(-30)')
      .attr('text-anchor', 'end');

    const zero = yScale(0);
    g.selectAll('rect.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => xScale(String(d.x))!)
      .attr('y', (d) => Math.min(zero, yScale(d.y)))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => Math.abs(zero - yScale(d.y)))
      .attr('fill', (d) => (d.y >= 0 ? COLOR : '#dc2626'));
  } else {
    const xVals = data.map((d) => toDateOrNumber(d.x));
    const isDate = xVals[0] instanceof Date;
    const xScale = isDate
      ? d3
          .scaleTime()
          .domain(d3.extent(xVals as Date[]) as [Date, Date])
          .range([0, innerW])
      : d3
          .scaleLinear()
          .domain(d3.extent(xVals as number[]) as [number, number])
          .range([0, innerW]);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        (isDate
          ? d3.axisBottom(xScale as d3.ScaleTime<number, number>)
          : d3.axisBottom(xScale as d3.ScaleLinear<number, number>)
        ).ticks(6),
      )
      .selectAll('text')
      .attr('fill', AXIS)
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px');

    g.selectAll('.grid')
      .data(yScale.ticks(5))
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', GRID)
      .attr('stroke-dasharray', '2,4');

    if (opts.kind === 'line') {
      const line = d3
        .line<{ x: unknown; y: number }>()
        .x((_, i) => (xScale as d3.ScaleLinear<number, number>)(xVals[i] as number))
        .y((d) => yScale(d.y))
        .curve(d3.curveMonotoneX);
      g.append('path').datum(data).attr('fill', 'none').attr('stroke', COLOR).attr('stroke-width', 2).attr('d', line);
    } else {
      g.selectAll('circle.dot')
        .data(data)
        .enter()
        .append('circle')
        .attr('class', 'dot')
        .attr('cx', (_, i) => (xScale as d3.ScaleLinear<number, number>)(xVals[i] as number))
        .attr('cy', (d) => yScale(d.y))
        .attr('r', 3)
        .attr('fill', COLOR);
    }
  }

  // Axes color
  svg.selectAll('.tick line').attr('stroke', AXIS);
  svg.selectAll('.domain').attr('stroke', AXIS);

  // Y-axis label
  svg
    .append('text')
    .attr('transform', `translate(${margin.left - 38}, ${margin.top + innerH / 2}) rotate(-90)`)
    .attr('fill', AXIS)
    .style('font-family', 'JetBrains Mono, monospace')
    .style('font-size', '10px')
    .style('letter-spacing', '0.08em')
    .style('text-transform', 'uppercase')
    .text(opts.y);
}

function toDateOrNumber(x: unknown): Date | number {
  if (typeof x === 'string') {
    const d = new Date(x);
    if (!Number.isNaN(d.getTime())) return d;
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof x === 'number') return x;
  if (x instanceof Date) return x;
  return 0;
}
