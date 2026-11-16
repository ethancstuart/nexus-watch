/**
 * Time-Travel Intelligence Scrubber
 *
 * A scrubber bar at the bottom of the map. Drag it and the globe shows
 * the state of the world at that point in time — CII scores, active
 * conflicts, historical trajectory.
 *
 * Use cases:
 * - "What did the Middle East look like 6 months ago?"
 * - "Show me the trajectory of Sudan's collapse week by week"
 * - "Compare Ukraine's CII in Feb vs today"
 *
 * Powered by: cii_daily_snapshots table (migration shipped 2026-04-13)
 */

import { createElement } from '../utils/dom.ts';

export interface HistoricalSnapshot {
  date: string; // YYYY-MM-DD
  countries: Array<{
    code: string;
    name: string;
    score: number;
    confidence: string;
  }>;
}

export interface TimelineScrubberConfig {
  container: HTMLElement;
  onDateChange: (snapshot: HistoricalSnapshot | null) => void;
}

export class TimelineScrubber {
  private config: TimelineScrubberConfig;
  private scrubber: HTMLInputElement;
  private dateLabel: HTMLElement;
  private snapshots: HistoricalSnapshot[] = [];
  private currentIdx = 0;
  private element: HTMLElement;

  constructor(config: TimelineScrubberConfig) {
    this.config = config;

    this.element = createElement('div', { className: 'nw-timeline-scrubber' });

    // Controls bar
    const controls = createElement('div', { className: 'nw-scrubber-controls' });

    const title = createElement('span', { className: 'nw-scrubber-title' });
    title.textContent = 'TIME-TRAVEL';

    this.dateLabel = createElement('span', { className: 'nw-scrubber-date' });
    this.dateLabel.textContent = 'Loading history...';

    const liveBtn = createElement('button', { className: 'nw-scrubber-live' });
    liveBtn.textContent = '● LIVE';
    liveBtn.addEventListener('click', () => this.goLive());

    controls.appendChild(title);
    controls.appendChild(this.dateLabel);
    controls.appendChild(liveBtn);

    // Scrubber slider
    this.scrubber = document.createElement('input');
    this.scrubber.type = 'range';
    this.scrubber.className = 'nw-scrubber-slider';
    this.scrubber.min = '0';
    this.scrubber.max = '0';
    this.scrubber.value = '0';
    this.scrubber.disabled = true;

    this.scrubber.addEventListener('input', () => {
      this.currentIdx = parseInt(this.scrubber.value, 10);
      this.updateDisplay();
    });

    this.element.appendChild(controls);
    this.element.appendChild(this.scrubber);

    config.container.appendChild(this.element);

    // Start loading historical data
    void this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    try {
      const res = await fetch('/api/v1/timeline-data?days=90');
      if (!res.ok) {
        this.dateLabel.textContent = 'No history available';
        return;
      }
      const data = (await res.json()) as {
        cii?: Array<{
          day: string;
          countries: Array<{ code: string; name: string; score: number; confidence?: string }>;
        }>;
      };
      if (!data.cii || data.cii.length === 0) {
        this.dateLabel.textContent = 'No CII history yet — recording in progress';
        return;
      }

      // Chronological order: oldest first, newest last
      this.snapshots = data.cii
        .sort((a, b) => a.day.localeCompare(b.day))
        .map((d) => ({
          date: d.day,
          countries: d.countries.map((c) => ({
            code: c.code,
            name: c.name,
            score: c.score,
            confidence: c.confidence || 'medium',
          })),
        }));

      this.scrubber.max = String(this.snapshots.length - 1);
      this.scrubber.value = String(this.snapshots.length - 1);
      this.scrubber.disabled = false;
      this.currentIdx = this.snapshots.length - 1;

      this.updateDisplay();
    } catch (err) {
      console.error('Timeline history fetch failed:', err instanceof Error ? err.message : err);
      this.dateLabel.textContent = 'History unavailable';
    }
  }

  private updateDisplay(): void {
    const snapshot = this.snapshots[this.currentIdx];
    if (!snapshot) return;

    const isLive = this.currentIdx === this.snapshots.length - 1;
    this.dateLabel.textContent = isLive
      ? `LIVE · ${snapshot.date}`
      : `${snapshot.date} (${this.daysAgo(snapshot.date)})`;
    this.dateLabel.classList.toggle('live', isLive);

    this.config.onDateChange(isLive ? null : snapshot);
  }

  private daysAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const days = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  }

  goLive(): void {
    if (this.snapshots.length === 0) return;
    this.currentIdx = this.snapshots.length - 1;
    this.scrubber.value = String(this.currentIdx);
    this.updateDisplay();
  }

  show(): void {
    this.element.classList.add('visible');
  }

  hide(): void {
    this.element.classList.remove('visible');
  }

  toggle(): void {
    this.element.classList.toggle('visible');
  }

  destroy(): void {
    this.element.remove();
  }
}
