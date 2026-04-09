/**
 * Timeline Manager
 *
 * Loads historical event snapshots from the API and manages
 * map state for timeline playback mode.
 *
 * When active, replaces live layer data with historical snapshots
 * at the selected timestamp. "Return to live" exits timeline mode.
 */

import { fetchWithRetry } from '../utils/fetch.ts';

export interface TimelineEntry {
  layer: string;
  count: number;
  timestamp: string;
}

export interface TimelineSnapshot {
  layerId: string;
  data: unknown[];
  featureCount: number;
  timestamp: string;
}

let timelineActive = false;
let cachedTimeline: TimelineEntry[] = [];
let lastTimelineFetch = 0;
const TIMELINE_CACHE_TTL = 300_000; // 5 minutes

export function isTimelineActive(): boolean {
  return timelineActive;
}

export function setTimelineActive(active: boolean): void {
  timelineActive = active;
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('dashview:timeline-mode', { detail: { active } }));
  }
}

/**
 * Fetch timeline density data for the scrubber visualization.
 * Returns event counts per timestamp per layer.
 */
export async function fetchTimelineDensity(from?: string, to?: string): Promise<TimelineEntry[]> {
  if (Date.now() - lastTimelineFetch < TIMELINE_CACHE_TTL && cachedTimeline.length > 0 && !from) {
    return cachedTimeline;
  }

  try {
    let url = '/api/v1/timeline';
    const params: string[] = [];
    if (from) params.push(`from=${encodeURIComponent(from)}`);
    if (to) params.push(`to=${encodeURIComponent(to)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const res = await fetchWithRetry(url);
    if (!res.ok) return cachedTimeline;

    const data = (await res.json()) as { timeline: TimelineEntry[] };
    cachedTimeline = data.timeline || [];
    lastTimelineFetch = Date.now();
    return cachedTimeline;
  } catch {
    return cachedTimeline;
  }
}

/**
 * Fetch full snapshot data for a specific timestamp.
 * Used when the user scrubs to a point in time.
 */
export async function fetchSnapshotAt(timestamp: string, layer?: string): Promise<TimelineSnapshot[]> {
  try {
    // Find the closest snapshot to the requested timestamp
    const from = new Date(new Date(timestamp).getTime() - 900_000).toISOString(); // 15 min before
    const to = new Date(new Date(timestamp).getTime() + 900_000).toISOString(); // 15 min after

    let url = `/api/v1/timeline?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    if (layer) url += `&layer=${layer}`;

    const res = await fetchWithRetry(url);
    if (!res.ok) return [];

    const data = (await res.json()) as { timeline: TimelineEntry[] };
    // Convert timeline entries to snapshots (full data would require a dedicated snapshot endpoint)
    return (data.timeline || []).map((t) => ({
      layerId: t.layer,
      data: [],
      featureCount: t.count,
      timestamp: t.timestamp,
    }));
  } catch {
    return [];
  }
}

/**
 * Compute density histogram for the timeline scrubber.
 * Groups events into time bins and returns counts per bin.
 */
export function computeDensityHistogram(
  entries: TimelineEntry[],
  binCount = 100,
): Array<{ time: number; count: number }> {
  if (entries.length === 0) return [];

  const timestamps = entries.map((e) => new Date(e.timestamp).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const range = maxTime - minTime || 1;
  const binSize = range / binCount;

  const bins: Array<{ time: number; count: number }> = [];
  for (let i = 0; i < binCount; i++) {
    const binStart = minTime + i * binSize;
    const binEnd = binStart + binSize;
    const count = entries
      .filter((e) => {
        const t = new Date(e.timestamp).getTime();
        return t >= binStart && t < binEnd;
      })
      .reduce((sum, e) => sum + e.count, 0);
    bins.push({ time: binStart + binSize / 2, count });
  }

  return bins;
}
