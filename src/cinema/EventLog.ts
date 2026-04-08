/**
 * Cinema Event Log — Persistent scrollable event list on the left side.
 *
 * Shows a running list of events with timestamps, severity badges,
 * and click-to-dive-deeper. Replaces the ephemeral ticker as the
 * primary event feed in Cinema Mode.
 */

import { createElement } from '../utils/dom.ts';
import type { CinemaProfile } from './profiles.ts';
import type { MapView } from '../map/MapView.ts';

interface LogEntry {
  id: string;
  text: string;
  severity: 'critical' | 'elevated' | 'monitor' | 'info';
  timestamp: number;
  lat: number;
  lon: number;
  layer: string;
  detail?: string;
}

const MAX_ENTRIES = 100;
const DEDUP_WINDOW = 300_000; // 5 min

export class EventLog {
  private container: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private entries: LogEntry[] = [];
  private seenIds = new Set<string>();
  private mapView: MapView;
  private profile: CinemaProfile;
  private active = false;
  private eventHandler: ((e: Event) => void) | null = null;

  constructor(mapView: MapView, profile: CinemaProfile) {
    this.mapView = mapView;
    this.profile = profile;
  }

  start(): void {
    this.active = true;
    this.container = createElement('div', { className: 'cinema-event-log' });
    this.container.innerHTML = `
      <div class="cinema-log-header">
        <span class="cinema-log-title">EVENT LOG</span>
        <span class="cinema-log-count">0 events</span>
      </div>
      <div class="cinema-log-list"></div>
    `;
    document.body.appendChild(this.container);
    this.listEl = this.container.querySelector('.cinema-log-list');

    // Listen for layer data and alerts
    this.eventHandler = (e: Event) => {
      if (!this.active) return;
      const detail = (e as CustomEvent).detail;
      if (e.type === 'dashview:auto-alerts' && detail?.alerts) {
        for (const alert of detail.alerts as Array<{ text: string; severity: string; lat?: number; lon?: number }>) {
          this.addEntry({
            id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text: alert.text,
            severity: (alert.severity === 'critical' ? 'critical' : alert.severity === 'elevated' ? 'elevated' : 'monitor') as LogEntry['severity'],
            timestamp: Date.now(),
            lat: alert.lat ?? 0,
            lon: alert.lon ?? 0,
            layer: 'alert',
          });
        }
      }
      if (e.type === 'dashview:layer-data' && detail?.layerId && detail?.data) {
        this.processLayerData(detail.layerId as string, detail.data as unknown[]);
      }
      if (e.type === 'cinema:focus-change' && detail) {
        this.addEntry({
          id: `focus-${Date.now()}`,
          text: `Camera: ${detail.label || 'Unknown'}`,
          severity: 'info',
          timestamp: Date.now(),
          lat: detail.lat ?? 0,
          lon: detail.lng ?? 0,
          layer: 'camera',
        });
      }
    };

    document.addEventListener('dashview:auto-alerts', this.eventHandler);
    document.addEventListener('dashview:layer-data', this.eventHandler);
    document.addEventListener('cinema:focus-change', this.eventHandler);
  }

  stop(): void {
    this.active = false;
    if (this.eventHandler) {
      document.removeEventListener('dashview:auto-alerts', this.eventHandler);
      document.removeEventListener('dashview:layer-data', this.eventHandler);
      document.removeEventListener('cinema:focus-change', this.eventHandler);
      this.eventHandler = null;
    }
    this.container?.remove();
    this.container = null;
    this.listEl = null;
    this.entries = [];
    this.seenIds.clear();
  }

  setProfile(profile: CinemaProfile): void {
    this.profile = profile;
  }

  private addEntry(entry: LogEntry): void {
    if (!this.active || !this.listEl) return;
    if (this.seenIds.has(entry.id)) return;
    this.seenIds.add(entry.id);
    setTimeout(() => this.seenIds.delete(entry.id), DEDUP_WINDOW);

    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.pop();

    // Render entry
    const row = createElement('div', { className: `cinema-log-entry ${entry.severity}` });
    const time = new Date(entry.timestamp);
    const timeStr = `${time.getUTCHours().toString().padStart(2, '0')}:${time.getUTCMinutes().toString().padStart(2, '0')}:${time.getUTCSeconds().toString().padStart(2, '0')}`;

    row.innerHTML = `
      <span class="cinema-log-time">${timeStr}</span>
      <span class="cinema-log-severity ${entry.severity}"></span>
      <span class="cinema-log-text">${this.escapeHtml(entry.text)}</span>
    `;

    if (entry.lat && entry.lon) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        this.mapView.flyTo(entry.lon, entry.lat, 6);
        document.dispatchEvent(new CustomEvent('cinema:focus-change', {
          detail: { lat: entry.lat, lng: entry.lon, label: entry.text, source: 'event-log' },
        }));
      });
    }

    this.listEl.prepend(row);

    // Trim DOM
    while (this.listEl.children.length > MAX_ENTRIES) {
      this.listEl.lastChild?.remove();
    }

    // Update count
    const countEl = this.container?.querySelector('.cinema-log-count');
    if (countEl) countEl.textContent = `${this.entries.length} events`;
  }

  private processLayerData(layerId: string, data: unknown[]): void {
    if (!this.profile.layers.includes(layerId)) return;

    for (const item of data.slice(0, 3)) {
      const d = item as Record<string, unknown>;
      const lat = Number(d.lat) || 0;
      const lon = Number(d.lon) || 0;
      if (!lat && !lon) continue;

      const classified = this.classifyEvent(layerId, d, data.length);
      if (!classified) continue;

      this.addEntry({
        id: `${layerId}-${d.id || `${lat}-${lon}`}-${Date.now()}`,
        text: classified.text,
        severity: classified.severity,
        timestamp: Date.now(),
        lat,
        lon,
        layer: layerId,
      });
      break; // One entry per layer per refresh
    }
  }

  private classifyEvent(layerId: string, d: Record<string, unknown>, totalCount: number): { text: string; severity: LogEntry['severity'] } | null {
    if (layerId === 'earthquakes') {
      const mag = Number(d.magnitude);
      if (mag < 4.0) return null;
      return {
        text: `M${mag.toFixed(1)} — ${d.place || 'Unknown'}`,
        severity: mag >= 6.0 ? 'critical' : mag >= 4.5 ? 'elevated' : 'monitor',
      };
    }
    if (layerId === 'acled') {
      return {
        text: `${d.event_type || 'Conflict'} — ${d.country || ''}`,
        severity: (Number(d.fatalities) || 0) > 10 ? 'critical' : 'elevated',
      };
    }
    if (layerId === 'fires' && totalCount >= 50) {
      return {
        text: `${totalCount} fire hotspots detected`,
        severity: totalCount > 500 ? 'elevated' : 'monitor',
      };
    }
    return null;
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
