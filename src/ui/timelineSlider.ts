/**
 * Timeline Slider UI
 *
 * Horizontal scrubber at the bottom of the map for historical playback.
 * Shows event density heatmap. Drag to scrub through 90 days of history.
 * "Return to live" button exits timeline mode.
 */

import { createElement } from '../utils/dom.ts';
import {
  fetchTimelineDensity,
  computeDensityHistogram,
  setTimelineActive,
  type TimelineEntry,
} from '../services/timelineManager.ts';

let container: HTMLElement | null = null;
let sliderEl: HTMLInputElement | null = null;
let labelEl: HTMLElement | null = null;
let densityCanvas: HTMLCanvasElement | null = null;
let liveBtn: HTMLElement | null = null;
let timelineData: TimelineEntry[] = [];

export function createTimelineSlider(parent: HTMLElement): {
  show: () => void;
  hide: () => void;
  destroy: () => void;
} {
  container = createElement('div', { className: 'nw-timeline-container' });
  container.style.display = 'none';

  // Density visualization
  densityCanvas = document.createElement('canvas');
  densityCanvas.className = 'nw-timeline-density';
  densityCanvas.width = 800;
  densityCanvas.height = 30;

  // Slider
  sliderEl = document.createElement('input');
  sliderEl.type = 'range';
  sliderEl.min = '0';
  sliderEl.max = '1000';
  sliderEl.value = '1000';
  sliderEl.className = 'nw-timeline-slider';

  // Time label
  labelEl = createElement('span', { className: 'nw-timeline-label', textContent: 'LIVE' });

  // Return to live button
  liveBtn = createElement('button', { className: 'nw-timeline-live-btn', textContent: '● RETURN TO LIVE' });
  liveBtn.style.display = 'none';

  const controls = createElement('div', { className: 'nw-timeline-controls' });
  const dateRange = createElement('span', { className: 'nw-timeline-range' });

  controls.appendChild(dateRange);
  controls.appendChild(labelEl);
  controls.appendChild(liveBtn);

  container.appendChild(densityCanvas);
  container.appendChild(sliderEl);
  container.appendChild(controls);
  parent.appendChild(container);

  // Event handlers
  sliderEl.addEventListener('input', () => {
    const val = parseInt(sliderEl!.value);
    if (val >= 990) {
      // Live mode
      returnToLive();
    } else {
      // Timeline mode
      enterTimeline(val);
    }
  });

  liveBtn.addEventListener('click', () => {
    if (sliderEl) sliderEl.value = '1000';
    returnToLive();
  });

  return {
    show: () => showTimeline(dateRange),
    hide: hideTimeline,
    destroy: () => {
      container?.remove();
      container = null;
    },
  };
}

async function showTimeline(dateRange: HTMLElement): Promise<void> {
  if (!container) return;
  container.style.display = 'block';

  // Fetch timeline data
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 86400_000); // Last 7 days by default
  timelineData = await fetchTimelineDensity(from.toISOString(), now.toISOString());

  dateRange.textContent = `${from.toLocaleDateString()} — ${now.toLocaleDateString()}`;

  // Render density heatmap
  renderDensity();
}

function hideTimeline(): void {
  if (!container) return;
  container.style.display = 'none';
  returnToLive();
}

function enterTimeline(sliderValue: number): void {
  if (!timelineData.length || !labelEl || !liveBtn) return;

  setTimelineActive(true);
  liveBtn.style.display = 'inline-block';

  // Map slider value (0-1000) to timestamp range
  const timestamps = timelineData.map((e) => new Date(e.timestamp).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const t = minTime + (sliderValue / 1000) * (maxTime - minTime);
  const date = new Date(t);

  labelEl.textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  labelEl.style.color = '#f97316';

  // Dispatch timeline scrub event
  document.dispatchEvent(
    new CustomEvent('dashview:timeline-scrub', {
      detail: { timestamp: date.toISOString(), sliderValue },
    }),
  );
}

function returnToLive(): void {
  setTimelineActive(false);
  if (labelEl) {
    labelEl.textContent = 'LIVE';
    labelEl.style.color = '#22c55e';
  }
  if (liveBtn) liveBtn.style.display = 'none';
}

function renderDensity(): void {
  if (!densityCanvas || !timelineData.length) return;

  const ctx = densityCanvas.getContext('2d');
  if (!ctx) return;

  const bins = computeDensityHistogram(timelineData, densityCanvas.width);
  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  ctx.clearRect(0, 0, densityCanvas.width, densityCanvas.height);

  for (let i = 0; i < bins.length; i++) {
    const height = (bins[i].count / maxCount) * densityCanvas.height;
    const intensity = bins[i].count / maxCount;

    // Color from dark (low) to orange (high)
    const r = Math.round(255 * intensity);
    const g = Math.round(102 * intensity);
    const b = 0;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + intensity * 0.7})`;
    ctx.fillRect(i, densityCanvas.height - height, 1, height);
  }
}
