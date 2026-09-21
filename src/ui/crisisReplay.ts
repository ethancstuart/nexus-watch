import { createElement } from '../utils/dom.ts';
import type { MapView } from '../map/MapView.ts';

export interface CrisisEvent {
  date: string;
  lat: number;
  lon: number;
  label: string;
  description: string;
  layer: string;
  severity: 'critical' | 'elevated' | 'monitor';
}

export interface CrisisReplay {
  id: string;
  name: string;
  description: string;
  events: CrisisEvent[];
  startDate: string;
  endDate: string;
}

const SEVERITY_HOLD: Record<string, number> = {
  critical: 6000,
  elevated: 4000,
  monitor: 3000,
};

/**
 * Crisis Replay player — flies the camera through a sequence of events chronologically.
 * Shows an overlay with event info at each stop.
 */
export class CrisisReplayPlayer {
  private container: HTMLElement;
  private mapView: MapView;
  private replay: CrisisReplay | null = null;
  private playing = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private overlay: HTMLElement | null = null;

  constructor(mapContainer: HTMLElement, mapView: MapView) {
    this.container = mapContainer;
    this.mapView = mapView;
  }

  start(replay: CrisisReplay): void {
    this.replay = replay;
    this.playing = true;
    this.showOverlay();
    this.flyToEvent(0);
  }

  stop(): void {
    this.playing = false;
    if (this.timeout) clearTimeout(this.timeout);
    this.removeOverlay();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private flyToEvent(index: number): void {
    if (!this.replay || !this.playing || index >= this.replay.events.length) {
      this.stop();
      return;
    }

    const event = this.replay.events[index];
    const map = this.mapView.getMap();

    if (map) {
      map.flyTo({
        center: [event.lon, event.lat],
        zoom: 6,
        pitch: 30,
        bearing: index * 15, // Slight bearing change per event for visual variety
        duration: 2500,
        essential: true,
      });
    }

    // Update overlay
    this.updateOverlay(event, index);

    // After hold, fly to next event
    const hold = SEVERITY_HOLD[event.severity] || 4000;
    this.timeout = setTimeout(() => {
      this.flyToEvent(index + 1);
    }, hold + 2500); // hold + fly duration
  }

  private showOverlay(): void {
    this.removeOverlay();
    this.overlay = createElement('div', { className: 'nw-crisis-overlay' });
    this.overlay.innerHTML = `
      <div class="nw-crisis-header">
        <span class="nw-crisis-badge">CRISIS REPLAY</span>
        <span class="nw-crisis-name">${this.replay?.name || ''}</span>
        <button class="nw-crisis-close">✕</button>
      </div>
      <div class="nw-crisis-progress"></div>
      <div class="nw-crisis-event-info"></div>
    `;
    this.overlay.querySelector('.nw-crisis-close')?.addEventListener('click', () => this.stop());
    this.container.appendChild(this.overlay);
  }

  private updateOverlay(event: CrisisEvent, index: number): void {
    if (!this.overlay || !this.replay) return;

    const info = this.overlay.querySelector('.nw-crisis-event-info');
    const progress = this.overlay.querySelector('.nw-crisis-progress');

    if (info) {
      const severityColor =
        event.severity === 'critical' ? '#f87171' : event.severity === 'elevated' ? '#fbbf24' : '#888';
      info.innerHTML = `
        <div class="nw-crisis-event-date">${event.date}</div>
        <div class="nw-crisis-event-label" style="border-left:3px solid ${severityColor};padding-left:8px;">
          <strong>${event.label}</strong>
          <p>${event.description}</p>
        </div>
      `;
    }

    if (progress) {
      const total = this.replay.events.length;
      const pct = ((index + 1) / total) * 100;
      progress.innerHTML = `
        <div class="nw-crisis-progress-bar" style="width:${pct}%"></div>
        <span class="nw-crisis-progress-text">${index + 1} / ${total}</span>
      `;
    }
  }

  private removeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }
}

/**
 * Auto-generate a crisis replay from correlation alerts and CII data.
 * Returns null if not enough data for a meaningful replay.
 */
export async function generateCrisisReplay(): Promise<CrisisReplay | null> {
  try {
    const res = await fetch('/api/v1/timeline-data?days=7');
    if (!res.ok) return null;
    const data = (await res.json()) as {
      snapshots: Array<{ timestamp: string; layer: string; data: Array<Record<string, unknown>> }>;
      cii: Array<{ day: string; countries: Array<{ code: string; name: string; score: number }> }>;
    };

    const events: CrisisEvent[] = [];

    // Extract significant earthquakes from snapshots
    for (const snap of data.snapshots) {
      if (snap.layer !== 'earthquakes') continue;
      for (const eq of snap.data) {
        const mag = Number(eq.mag || 0);
        if (mag >= 5.0) {
          events.push({
            date: new Date(snap.timestamp).toISOString().split('T')[0],
            lat: Number(eq.lat),
            lon: Number(eq.lon),
            label: `M${mag.toFixed(1)} Earthquake`,
            description: String(eq.place || 'Unknown location'),
            layer: 'earthquakes',
            severity: mag >= 6.0 ? 'critical' : 'elevated',
          });
        }
      }
    }

    // Extract CII spikes (countries that rose 5+ points in the week)
    if (data.cii.length >= 2) {
      const first = data.cii[0];
      const last = data.cii[data.cii.length - 1];
      const firstMap = new Map(first.countries.map((c) => [c.code, c.score]));

      for (const c of last.countries) {
        const prev = firstMap.get(c.code);
        if (prev !== undefined && c.score - prev >= 5) {
          // Get approximate country coords
          const coords = COUNTRY_COORDS[c.code];
          if (coords) {
            events.push({
              date: last.day,
              lat: coords[0],
              lon: coords[1],
              label: `${c.name} CII ↑${c.score - prev}`,
              description: `Instability rose from ${prev} to ${c.score}/100 over 7 days.`,
              layer: 'cii',
              severity: c.score >= 70 ? 'critical' : 'elevated',
            });
          }
        }
      }
    }

    if (events.length < 3) return null;

    // Sort chronologically, then by severity
    events.sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      const sevOrder = { critical: 0, elevated: 1, monitor: 2 };
      return sevOrder[a.severity] - sevOrder[b.severity];
    });

    // Deduplicate nearby events (within 3 degrees)
    const deduped: CrisisEvent[] = [];
    for (const e of events) {
      const tooClose = deduped.some(
        (d) => Math.abs(d.lat - e.lat) < 3 && Math.abs(d.lon - e.lon) < 3 && d.date === e.date,
      );
      if (!tooClose) deduped.push(e);
    }

    const now = new Date().toISOString().split('T')[0];
    return {
      id: `auto-${now}`,
      name: `Week in Crisis — ${now}`,
      description: `${deduped.length} significant events detected over the past 7 days.`,
      events: deduped.slice(0, 12), // Cap at 12 events for ~2 min replay
      startDate: deduped[0]?.date || now,
      endDate: now,
    };
  } catch {
    return null;
  }
}

const COUNTRY_COORDS: Record<string, [number, number]> = {
  UA: [48.4, 31.2],
  RU: [55.8, 37.6],
  CN: [35.9, 104.2],
  TW: [23.5, 121.0],
  IR: [32.4, 53.7],
  IQ: [33.2, 43.7],
  SY: [34.8, 38.9],
  IL: [31.0, 35.0],
  PS: [31.9, 35.2],
  YE: [15.6, 48.5],
  SD: [15.5, 32.5],
  ET: [9.1, 40.5],
  SO: [2.0, 45.3],
  CD: [-1.5, 29.0],
  MM: [19.8, 96.1],
  AF: [33.9, 67.7],
  PK: [30.4, 69.3],
  KP: [40.0, 127.0],
  VE: [8.0, -66.0],
  NG: [9.1, 7.5],
  LY: [26.3, 17.2],
  LB: [33.9, 35.5],
  SA: [24.7, 46.7],
  SS: [4.9, 31.6],
};
