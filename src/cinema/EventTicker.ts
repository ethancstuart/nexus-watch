import { createElement } from '../utils/dom.ts';
import type { CinemaProfile } from './profiles.ts';
import type { MapView } from '../map/MapView.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';

interface TickerPill {
  id: string;
  text: string;
  severity: 'critical' | 'elevated' | 'monitor' | 'info';
  lat: number;
  lng: number;
  timestamp: number;
  element: HTMLElement;
}

const MAX_PILLS = 30;
const DEDUP_WINDOW = 300_000; // 5 minutes
const QUIET_THRESHOLD = 30_000; // 30s before showing summaries
const HYSTERESIS_DELAY = 30_000; // 30s before threshold changes

export class EventTicker {
  private container: HTMLElement | null = null;
  private track: HTMLElement | null = null;
  private pills: TickerPill[] = [];
  private seenIds = new Set<string>();
  private mapView: MapView;
  private layerManager: MapLayerManager;
  private profile: CinemaProfile;
  private active = false;
  private eventHandler: ((e: Event) => void) | null = null;
  private summaryInterval: ReturnType<typeof setInterval> | null = null;
  private lastEventTime = 0;

  // Adaptive threshold
  private eventTimestamps: number[] = [];
  private currentThreshold: 'all' | 'elevated' | 'critical' = 'all';
  private thresholdChangeTime = 0;

  constructor(mapView: MapView, layerManager: MapLayerManager, profile: CinemaProfile) {
    this.mapView = mapView;
    this.layerManager = layerManager;
    this.profile = profile;
  }

  start(): void {
    this.active = true;
    this.container = createElement('div', { className: 'cinema-ticker' });
    this.track = createElement('div', { className: 'cinema-ticker-track' });
    this.container.appendChild(this.track);
    document.body.appendChild(this.container);

    // Listen for layer data and auto-alerts
    this.eventHandler = (e: Event) => {
      if (!this.active) return;
      const detail = (e as CustomEvent).detail;
      if (e.type === 'dashview:auto-alerts' && detail?.alerts) {
        for (const alert of detail.alerts as Array<{ text: string; severity: string; lat?: number; lon?: number }>) {
          const severity =
            alert.severity === 'critical' ? 'critical' : alert.severity === 'elevated' ? 'elevated' : 'monitor';
          this.addEvent({
            id: `alert-${alert.text.slice(0, 30)}-${Date.now()}`,
            text: alert.text,
            severity,
            lat: alert.lat ?? 0,
            lng: alert.lon ?? 0,
          });
        }
      }
      if (e.type === 'dashview:layer-data' && detail?.layerId && detail?.data) {
        this.processLayerData(detail.layerId as string, detail.data as unknown[]);
      }
    };

    document.addEventListener('dashview:auto-alerts', this.eventHandler);
    document.addEventListener('dashview:layer-data', this.eventHandler);

    // Start summary cycle for quiet periods
    this.summaryInterval = setInterval(() => this.checkQuietPeriod(), 5000);
  }

  stop(): void {
    this.active = false;
    if (this.eventHandler) {
      document.removeEventListener('dashview:auto-alerts', this.eventHandler);
      document.removeEventListener('dashview:layer-data', this.eventHandler);
      this.eventHandler = null;
    }
    if (this.summaryInterval) clearInterval(this.summaryInterval);
    this.container?.remove();
    this.container = null;
    this.track = null;
    this.pills = [];
    this.seenIds.clear();
    this.eventTimestamps = [];
  }

  setProfile(profile: CinemaProfile): void {
    this.profile = profile;
  }

  private addEvent(event: {
    id: string;
    text: string;
    severity: 'critical' | 'elevated' | 'monitor' | 'info';
    lat: number;
    lng: number;
  }): void {
    if (!this.active || !this.track) return;

    // Dedup
    if (this.seenIds.has(event.id)) return;
    this.seenIds.add(event.id);

    // Clean old dedup entries
    setTimeout(() => this.seenIds.delete(event.id), DEDUP_WINDOW);

    // Adaptive threshold check
    this.eventTimestamps.push(Date.now());
    this.updateThreshold();

    if (event.severity !== 'info' && !this.passesThreshold(event.severity)) return;

    this.lastEventTime = Date.now();

    // Create pill element
    const pill = createElement('span', { className: 'cinema-ticker-pill' });
    pill.dataset.severity = event.severity;

    const dot = createElement('span', { className: 'pill-dot' });
    const text = document.createTextNode(event.text);
    const time = createElement('span', { className: 'pill-time', textContent: 'now' });

    pill.appendChild(dot);
    pill.appendChild(text);
    pill.appendChild(time);

    if (event.lat && event.lng) {
      pill.style.cursor = 'pointer';
      pill.addEventListener('click', () => {
        this.mapView.flyTo(event.lng, event.lat, 6);
        document.dispatchEvent(
          new CustomEvent('cinema:focus-change', {
            detail: { lat: event.lat, lng: event.lng, label: event.text, source: 'ticker-click' },
          }),
        );
      });
    }

    // Prepend (newest on left)
    this.track.prepend(pill);

    const tickerPill: TickerPill = {
      id: event.id,
      text: event.text,
      severity: event.severity,
      lat: event.lat,
      lng: event.lng,
      timestamp: Date.now(),
      element: pill,
    };
    this.pills.unshift(tickerPill);

    // Evict old pills
    while (this.pills.length > MAX_PILLS) {
      const old = this.pills.pop();
      old?.element.remove();
    }
  }

  private processLayerData(layerId: string, data: unknown[]): void {
    if (!this.profile.layers.includes(layerId)) return;

    for (const item of data) {
      const d = item as Record<string, unknown>;
      const lat = d.lat as number | undefined;
      const lon = d.lon as number | undefined;

      if (layerId === 'earthquakes') {
        const mag = d.magnitude as number | undefined;
        if (!mag || mag < 3.0) continue;
        const severity = mag >= 6.0 ? ('critical' as const) : mag >= 4.5 ? ('elevated' as const) : ('monitor' as const);
        this.addEvent({
          id: `eq-${d.id || `${lat}-${lon}-${mag}`}`,
          text: `M${mag.toFixed(1)} — ${(d.place as string) || 'Unknown'}`,
          severity,
          lat: lat ?? 0,
          lng: lon ?? 0,
        });
      } else if (layerId === 'acled') {
        const fatalities = d.fatalities as number | undefined;
        const severity = fatalities && fatalities > 50 ? ('critical' as const) : ('elevated' as const);
        this.addEvent({
          id: `acled-${d.event_id_cnty || `${lat}-${lon}`}`,
          text: `${(d.event_type as string) || 'Conflict'} — ${(d.country as string) || ''}`,
          severity,
          lat: lat ?? 0,
          lng: lon ?? 0,
        });
        break; // Only show latest ACLED per refresh to avoid flood
      }
    }
  }

  private checkQuietPeriod(): void {
    if (!this.active || !this.track) return;
    const timeSinceEvent = Date.now() - this.lastEventTime;

    if (timeSinceEvent > QUIET_THRESHOLD && this.lastEventTime > 0) {
      this.showLayerSummary();
    }
  }

  private showLayerSummary(): void {
    const enabledLayers = this.layerManager.getEnabledLayers();
    const summaries: string[] = [];

    for (const layer of enabledLayers) {
      const count = layer.getFeatureCount();
      if (count > 0) {
        summaries.push(`${count} ${layer.name.toLowerCase()} tracked`);
      }
    }

    if (summaries.length === 0) return;

    // Pick a random summary to display
    const summary = summaries[Math.floor(Math.random() * summaries.length)];
    this.addEvent({
      id: `summary-${Date.now()}`,
      text: summary,
      severity: 'info',
      lat: 0,
      lng: 0,
    });
  }

  // ── Adaptive Threshold ──

  private updateThreshold(): void {
    const now = Date.now();
    // Clean old timestamps (keep last 2 minutes)
    this.eventTimestamps = this.eventTimestamps.filter((t) => now - t < 120_000);

    const eventsPerMinute = this.eventTimestamps.length / 2;
    let newThreshold: 'all' | 'elevated' | 'critical';

    if (eventsPerMinute > 15) {
      newThreshold = 'critical';
    } else if (eventsPerMinute > 3) {
      newThreshold = 'elevated';
    } else {
      newThreshold = 'all';
    }

    // Hysteresis: only change threshold if sustained for 30s
    if (newThreshold !== this.currentThreshold) {
      if (now - this.thresholdChangeTime > HYSTERESIS_DELAY) {
        this.currentThreshold = newThreshold;
        this.thresholdChangeTime = now;
      }
    } else {
      this.thresholdChangeTime = now;
    }
  }

  private passesThreshold(severity: string): boolean {
    if (this.currentThreshold === 'all') return true;
    if (this.currentThreshold === 'elevated') return severity === 'critical' || severity === 'elevated';
    return severity === 'critical';
  }
}
