import type { MapView } from '../map/MapView.ts';
import type { CinemaProfile } from './profiles.ts';
import { CINEMA_PROFILES } from './profiles.ts';
import { haversineKm } from '../utils/geo.ts';

export interface CameraTarget {
  lng: number;
  lat: number;
  zoom: number;
  priority: number; // 0 = critical, 1 = elevated, 2 = monitor
  holdDuration: number; // ms
  source: string;
  label: string;
  timestamp: number;
}

type CameraState = 'IDLE_ORBIT' | 'TOURING' | 'FLYING' | 'HOLDING';

const ORBIT_DURATION = 30_000; // 30 seconds of orbiting before touring
const ORBIT_SPEED = 0.008; // degrees per frame (slower than default 0.015)
const HOLD_DURATIONS: Record<number, number> = { 0: 8000, 1: 5000, 2: 3000 };
const USER_PAUSE_DURATION = 15_000; // 15 seconds after user interaction
const MAX_QUEUE_SIZE = 20;
const DEDUP_RADIUS_KM = 500;

export class CameraDirector {
  private mapView: MapView;
  private profile: CinemaProfile;
  private state: CameraState = 'IDLE_ORBIT';
  private queue: CameraTarget[] = [];
  private active = false;
  private orbitFrame: number | null = null;
  private holdTimeout: ReturnType<typeof setTimeout> | null = null;
  private stateTimeout: ReturnType<typeof setTimeout> | null = null;
  private pauseTimeout: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private tourIndex = 0;
  private orbitStartTime = 0;

  // Event listeners for user interaction pause
  private boundPause: () => void;

  constructor(mapView: MapView, profile: CinemaProfile) {
    this.mapView = mapView;
    this.profile = profile;
    this.boundPause = () => this.onUserInteraction();
  }

  start(): void {
    this.active = true;
    this.mapView.stopRotation();
    this.tourIndex = 0;
    this.enterOrbit();

    // Listen for user interactions to pause
    const map = this.mapView.getMap();
    if (map) {
      map.on('mousedown', this.boundPause);
      map.on('touchstart', this.boundPause);
      map.on('wheel', this.boundPause);
    }
  }

  stop(): void {
    this.active = false;
    this.paused = false;
    this.clearTimers();
    if (this.orbitFrame) {
      cancelAnimationFrame(this.orbitFrame);
      this.orbitFrame = null;
    }

    const map = this.mapView.getMap();
    if (map) {
      map.off('mousedown', this.boundPause);
      map.off('touchstart', this.boundPause);
      map.off('wheel', this.boundPause);
    }
  }

  setProfile(profile: CinemaProfile): void {
    this.profile = profile;
    this.tourIndex = 0;
  }

  /** Add a target to the priority queue */
  addTarget(target: CameraTarget): void {
    if (!this.active) return;

    // Filter by profile layers
    if (!this.isRelevantToProfile(target.source)) return;

    // Dedup: merge if within 500km of existing same-or-lower priority
    const existing = this.queue.find(
      (t) => t.priority <= target.priority && haversineKm(t.lat, t.lng, target.lat, target.lng) < DEDUP_RADIUS_KM,
    );
    if (existing) {
      existing.timestamp = Math.max(existing.timestamp, target.timestamp);
      if (target.priority < existing.priority) existing.priority = target.priority;
      this.sortQueue();
      return;
    }

    this.queue.push(target);
    this.sortQueue();

    // Evict if over max
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue.pop();
    }

    // Critical events interrupt immediately
    if (target.priority === 0 && this.state !== 'FLYING') {
      this.flyToNext();
    }
  }

  private isRelevantToProfile(source: string): boolean {
    // Auto-alerts and intel updates are always relevant
    if (source === 'auto-alert' || source === 'intel') return true;
    // Layer-specific events check profile
    return this.profile.layers.includes(source);
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.timestamp - a.timestamp; // More recent first within same priority
    });
  }

  private clearTimers(): void {
    if (this.holdTimeout) clearTimeout(this.holdTimeout);
    if (this.stateTimeout) clearTimeout(this.stateTimeout);
    if (this.pauseTimeout) clearTimeout(this.pauseTimeout);
    this.holdTimeout = null;
    this.stateTimeout = null;
    this.pauseTimeout = null;
  }

  private onUserInteraction(): void {
    if (!this.active) return;
    this.paused = true;

    // Stop orbit animation
    if (this.orbitFrame) {
      cancelAnimationFrame(this.orbitFrame);
      this.orbitFrame = null;
    }
    this.clearTimers();

    // Resume after pause duration
    if (this.pauseTimeout) clearTimeout(this.pauseTimeout);
    this.pauseTimeout = setTimeout(() => {
      this.paused = false;
      if (this.active) this.decideNext();
    }, USER_PAUSE_DURATION);
  }

  // ── State Machine ──

  private enterOrbit(): void {
    if (!this.active || this.paused) return;
    this.state = 'IDLE_ORBIT';
    this.orbitStartTime = Date.now();

    const map = this.mapView.getMap();
    if (!map) return;

    // Ease to orbital view
    map.easeTo({ zoom: 2.5, pitch: 20, duration: 2000 });

    const orbit = () => {
      if (!this.active || this.paused || this.state !== 'IDLE_ORBIT') return;

      const center = map.getCenter();
      map.setCenter([center.lng + ORBIT_SPEED, center.lat]);
      this.orbitFrame = requestAnimationFrame(orbit);

      // Check if orbit duration exceeded → start touring
      if (Date.now() - this.orbitStartTime > ORBIT_DURATION) {
        this.orbitFrame = null;
        this.enterTour();
        return;
      }
    };

    this.orbitFrame = requestAnimationFrame(orbit);
  }

  private enterTour(): void {
    if (!this.active || this.paused) return;

    // Check queue first — events take priority over touring
    if (this.queue.length > 0) {
      this.flyToNext();
      return;
    }

    this.state = 'TOURING';
    const regions = this.profile.priorityRegions;

    if (regions.length === 0) {
      // Fallback to Command Center regions
      const cmdCenter = CINEMA_PROFILES[0];
      this.tourToRegion(cmdCenter.priorityRegions, 0);
      return;
    }

    this.tourToRegion(regions, this.tourIndex);
  }

  private tourToRegion(regions: CinemaProfile['priorityRegions'], index: number): void {
    if (!this.active || this.paused) return;

    if (index >= regions.length) {
      // Toured all regions, back to orbit
      this.tourIndex = 0;
      this.enterOrbit();
      return;
    }

    const region = regions[index];
    this.tourIndex = index + 1;

    this.mapView.flyToAsync(region.lng, region.lat, region.zoom, { duration: 3500, curve: 1.8, pitch: 30 }).then(() => {
      if (!this.active || this.paused) return;

      // Emit focus change for narration
      document.dispatchEvent(
        new CustomEvent('cinema:focus-change', {
          detail: { lat: region.lat, lng: region.lng, label: region.name, source: 'tour' },
        }),
      );

      // Hold for 6 seconds, then continue tour
      this.holdTimeout = setTimeout(() => {
        if (!this.active || this.paused) return;
        // Check queue again
        if (this.queue.length > 0) {
          this.flyToNext();
        } else {
          this.tourToRegion(regions, this.tourIndex);
        }
      }, 6000);
    });
  }

  private flyToNext(): void {
    if (!this.active || this.paused || this.queue.length === 0) {
      this.decideNext();
      return;
    }

    const target = this.queue.shift()!;
    this.state = 'FLYING';

    // Stop any orbit
    if (this.orbitFrame) {
      cancelAnimationFrame(this.orbitFrame);
      this.orbitFrame = null;
    }

    this.mapView
      .flyToAsync(target.lng, target.lat, target.zoom, {
        duration: 3500,
        curve: 1.8,
        pitch: 40,
      })
      .then(() => {
        if (!this.active || this.paused) return;
        this.enterHold(target);
      });
  }

  private enterHold(target: CameraTarget): void {
    if (!this.active || this.paused) return;
    this.state = 'HOLDING';

    // Emit focus change for narration
    document.dispatchEvent(
      new CustomEvent('cinema:focus-change', {
        detail: {
          lat: target.lat,
          lng: target.lng,
          label: target.label,
          source: target.source,
          priority: target.priority,
        },
      }),
    );

    const holdDuration = HOLD_DURATIONS[target.priority] ?? 5000;

    // Subtle drift during hold
    const map = this.mapView.getMap();
    let driftFrame: number | null = null;
    if (map) {
      const drift = () => {
        if (!this.active || this.state !== 'HOLDING') return;
        const center = map.getCenter();
        map.setCenter([center.lng + 0.001, center.lat]);
        driftFrame = requestAnimationFrame(drift);
      };
      driftFrame = requestAnimationFrame(drift);
    }

    this.holdTimeout = setTimeout(() => {
      if (driftFrame) cancelAnimationFrame(driftFrame);
      if (!this.active || this.paused) return;
      this.decideNext();
    }, holdDuration);
  }

  private decideNext(): void {
    if (!this.active || this.paused) return;

    if (this.queue.length > 0) {
      this.flyToNext();
    } else {
      this.enterOrbit();
    }
  }
}
