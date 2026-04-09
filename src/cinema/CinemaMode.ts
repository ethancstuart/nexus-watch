import '../styles/cinema.css';
import { createElement } from '../utils/dom.ts';
import { CINEMA_PROFILES, getProfile, type CinemaProfile } from './profiles.ts';
import { CameraDirector, type CameraTarget } from './CameraDirector.ts';
import { EventTicker } from './EventTicker.ts';
import { HudOverlay } from './HudOverlay.ts';
import { NarrationOverlay } from './NarrationOverlay.ts';
import { AmbientAudio } from './AmbientAudio.ts';
import { EventLog } from './EventLog.ts';
import type { MapView } from '../map/MapView.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';

interface CinemaModeConfig {
  app: HTMLElement;
  mapContainer: HTMLElement;
  mapView: MapView;
  layerManager: MapLayerManager;
  getLayerData: () => Map<string, unknown>;
  signal: AbortSignal;
}

export class CinemaMode {
  private config: CinemaModeConfig;
  private active = false;
  private introPlayed = false;
  private activeProfile: CinemaProfile;
  private savedLayerState: string[] = [];
  private savedViewState: { center: [number, number]; zoom: number; pitch: number; bearing: number } | null = null;

  // DOM elements
  private profileBar: HTMLElement | null = null;
  private exitBtn: HTMLElement | null = null;
  private scanline: HTMLElement | null = null;

  // Subsystems
  private cameraDirector: CameraDirector | null = null;
  private eventTicker: EventTicker | null = null;
  private hudOverlay: HudOverlay | null = null;
  private narrationOverlay: NarrationOverlay | null = null;
  private ambientAudio: AmbientAudio | null = null;
  private eventLog: EventLog | null = null;
  private eventListener: ((e: Event) => void) | null = null;

  // Subsystem callbacks (for HUD, Ticker, Narration, Audio when built)
  private onEnterCallbacks: (() => void)[] = [];
  private onExitCallbacks: (() => void)[] = [];
  private onProfileChangeCallbacks: ((profile: CinemaProfile) => void)[] = [];

  constructor(config: CinemaModeConfig) {
    this.config = config;
    this.activeProfile = CINEMA_PROFILES[0]; // Default: Command Center
  }

  isActive(): boolean {
    return this.active;
  }

  getActiveProfile(): CinemaProfile {
    return this.activeProfile;
  }

  /** Register a callback for cinema enter — used by subsystems (Camera, Ticker, HUD, etc.) */
  onEnter(cb: () => void): void {
    this.onEnterCallbacks.push(cb);
  }

  /** Register a callback for cinema exit */
  onExit(cb: () => void): void {
    this.onExitCallbacks.push(cb);
  }

  /** Register a callback for profile changes */
  onProfileChange(cb: (profile: CinemaProfile) => void): void {
    this.onProfileChangeCallbacks.push(cb);
  }

  toggle(): void {
    if (this.active) {
      this.exit();
    } else {
      this.enter();
    }
  }

  enter(): void {
    if (this.active) return;
    this.active = true;

    // Save current state
    this.savedViewState = this.config.mapView.getViewState();
    this.savedLayerState = this.config.layerManager
      .getAllLayers()
      .filter((l) => l.isEnabled())
      .map((l) => l.id);

    // Apply profile layers
    this.applyProfileLayers();

    // Stop existing auto-rotate (CameraDirector will take over)
    this.config.mapView.stopRotation();

    if (!this.introPlayed) {
      this.playIntro();
    } else {
      this.fastEnter();
    }
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;

    // Stop subsystems
    if (this.cameraDirector) {
      this.cameraDirector.stop();
      this.cameraDirector = null;
    }
    if (this.eventTicker) {
      this.eventTicker.stop();
      this.eventTicker = null;
    }
    if (this.hudOverlay) {
      this.hudOverlay.stop();
      this.hudOverlay = null;
    }
    if (this.narrationOverlay) {
      this.narrationOverlay.stop();
      this.narrationOverlay = null;
    }
    if (this.ambientAudio) {
      this.ambientAudio.stop();
      this.ambientAudio = null;
    }
    if (this.eventLog) {
      this.eventLog.stop();
      this.eventLog = null;
    }

    // Remove event listeners
    if (this.eventListener) {
      document.removeEventListener('dashview:auto-alerts', this.eventListener);
      document.removeEventListener('dashview:layer-data', this.eventListener);
      this.eventListener = null;
    }

    // Notify subsystems
    for (const cb of this.onExitCallbacks) cb();

    // Remove cinema DOM
    this.profileBar?.remove();
    this.profileBar = null;
    this.exitBtn?.remove();
    this.exitBtn = null;
    this.scanline?.remove();
    this.scanline = null;

    // Remove cinema class (triggers CSS reverse transition)
    this.config.app.classList.remove('nw-cinema');

    // Restore layer state
    const allLayers = this.config.layerManager.getAllLayers();
    for (const layer of allLayers) {
      const wasEnabled = this.savedLayerState.includes(layer.id);
      if (wasEnabled && !layer.isEnabled()) {
        this.config.layerManager.enable(layer.id);
      } else if (!wasEnabled && layer.isEnabled()) {
        this.config.layerManager.disable(layer.id);
      }
    }

    // Restore view state
    if (this.savedViewState) {
      const map = this.config.mapView.getMap();
      if (map) {
        map.flyTo({
          center: this.savedViewState.center,
          zoom: this.savedViewState.zoom,
          pitch: this.savedViewState.pitch,
          bearing: this.savedViewState.bearing,
          duration: 1500,
        });
      }
    }

    // Trigger map resize after layout change
    setTimeout(() => this.config.mapView.getMap()?.resize(), 100);
  }

  setProfile(profileId: string): void {
    const profile = getProfile(profileId);
    this.activeProfile = profile;
    this.applyProfileLayers();
    this.updateProfileBar();
    if (this.cameraDirector) this.cameraDirector.setProfile(profile);
    if (this.eventTicker) this.eventTicker.setProfile(profile);
    if (this.hudOverlay) this.hudOverlay.setProfile(profile);
    if (this.narrationOverlay) this.narrationOverlay.setProfile(profile);
    if (this.eventLog) this.eventLog.setProfile(profile);
    for (const cb of this.onProfileChangeCallbacks) cb(profile);
  }

  private applyProfileLayers(): void {
    const allLayers = this.config.layerManager.getAllLayers();
    for (const layer of allLayers) {
      const shouldEnable = this.activeProfile.layers.includes(layer.id);
      if (shouldEnable && !layer.isEnabled()) {
        this.config.layerManager.enable(layer.id);
      } else if (!shouldEnable && layer.isEnabled()) {
        this.config.layerManager.disable(layer.id);
      }
    }
  }

  private playIntro(): void {
    this.introPlayed = true;

    // Dark overlay
    const overlay = createElement('div', { className: 'cinema-intro-overlay' });
    const text = createElement('div', { className: 'cinema-intro-text', textContent: 'NEXUSWATCH LIVE' });
    overlay.appendChild(text);
    document.body.appendChild(overlay);

    // Add cinema class after a brief moment (chrome starts fading behind the overlay)
    setTimeout(() => {
      this.config.app.classList.add('nw-cinema');
      this.config.mapView.getMap()?.resize();
    }, 200);

    // Fade out overlay after title animation
    setTimeout(() => {
      overlay.classList.add('fade-out');
    }, 2000);

    // Remove overlay + show cinema UI
    setTimeout(() => {
      overlay.remove();
      this.showCinemaUI();
    }, 2500);
  }

  private fastEnter(): void {
    this.config.app.classList.add('nw-cinema');
    setTimeout(() => {
      this.config.mapView.getMap()?.resize();
      this.showCinemaUI();
    }, 100);
  }

  private showCinemaUI(): void {
    // Profile bar
    this.profileBar = this.createProfileBar();
    document.body.appendChild(this.profileBar);
    requestAnimationFrame(() => this.profileBar?.classList.add('visible'));

    // Scanline
    this.scanline = createElement('div', { className: 'cinema-scanline' });
    this.config.mapContainer.appendChild(this.scanline);

    // Exit button
    this.exitBtn = createElement('button', { className: 'cinema-exit-btn', textContent: 'EXIT (Esc)' });
    this.exitBtn.addEventListener('click', () => this.exit());
    document.body.appendChild(this.exitBtn);

    // Start subsystems
    this.cameraDirector = new CameraDirector(this.config.mapView, this.activeProfile);
    this.cameraDirector.start();

    this.eventTicker = new EventTicker(this.config.mapView, this.config.layerManager, this.activeProfile);
    this.eventTicker.start();

    this.hudOverlay = new HudOverlay(this.config.layerManager, this.config.getLayerData, this.activeProfile);
    this.hudOverlay.start();

    this.narrationOverlay = new NarrationOverlay(this.activeProfile);
    this.narrationOverlay.start();

    this.ambientAudio = new AmbientAudio();
    this.ambientAudio.start();
    this.hudOverlay.setAudio(this.ambientAudio);

    this.eventLog = new EventLog(this.config.mapView, this.activeProfile);
    this.eventLog.start();

    // Wire event routing: layer data → camera targets
    this.eventListener = (e: Event) => {
      if (!this.active || !this.cameraDirector) return;
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      // Route auto-alerts to camera as high-priority targets
      if (e.type === 'dashview:auto-alerts') {
        const alerts = detail.alerts as Array<{ lat: number; lon: number; text: string; severity: string }>;
        if (alerts) {
          for (const alert of alerts) {
            if (!alert.lat || !alert.lon) continue;
            this.cameraDirector.addTarget({
              lng: alert.lon,
              lat: alert.lat,
              zoom: this.activeProfile.cameraZoom,
              priority: alert.severity === 'critical' ? 0 : 1,
              holdDuration: alert.severity === 'critical' ? 8000 : 5000,
              source: 'auto-alert',
              label: alert.text,
              timestamp: Date.now(),
            });
          }
        }
      }

      // Route high-priority intel items from layer data
      if (e.type === 'dashview:layer-data') {
        const layerId = detail.layerId as string;
        const data = detail.data;
        if (!data || !Array.isArray(data)) return;
        this.routeLayerData(layerId, data);
      }
    };

    document.addEventListener('dashview:auto-alerts', this.eventListener);
    document.addEventListener('dashview:layer-data', this.eventListener);

    // Notify subsystems
    for (const cb of this.onEnterCallbacks) cb();

    // Dispatch event for external listeners
    document.dispatchEvent(new CustomEvent('cinema:enter', { detail: { profile: this.activeProfile } }));
  }

  private routeLayerData(layerId: string, data: unknown[]): void {
    if (!this.cameraDirector) return;
    // Only route from profile's active layers
    if (!this.activeProfile.layers.includes(layerId)) return;

    // Extract high-value events from specific layer types
    for (const item of data) {
      const d = item as Record<string, unknown>;
      const lat = d.lat as number | undefined;
      const lon = d.lon as number | undefined;
      if (!lat || !lon) continue;

      const target = this.classifyLayerEvent(layerId, d, lat, lon);
      if (!target) continue;

      this.cameraDirector.addTarget(target);
    }
  }

  private classifyLayerEvent(
    layerId: string,
    d: Record<string, unknown>,
    lat: number,
    lon: number,
  ): CameraTarget | null {
    if (layerId === 'earthquakes') {
      const mag = d.magnitude as number | undefined;
      if (!mag || mag < 4.5) return null;
      const priority = mag >= 6.5 ? 0 : mag >= 5.5 ? 1 : 2;
      return {
        lng: lon,
        lat,
        zoom: this.activeProfile.cameraZoom,
        priority,
        holdDuration: priority === 0 ? 8000 : priority === 1 ? 5000 : 3000,
        source: layerId,
        label: `M${mag.toFixed(1)} earthquake — ${(d.place as string) || 'Unknown location'}`,
        timestamp: Date.now(),
      };
    }

    if (layerId === 'acled') {
      const fatalities = d.fatalities as number | undefined;
      if (!fatalities || fatalities <= 50) return null;
      return {
        lng: lon,
        lat,
        zoom: this.activeProfile.cameraZoom,
        priority: 0,
        holdDuration: 8000,
        source: layerId,
        label: `${(d.event_type as string) || 'Conflict'} — ${fatalities} casualties`,
        timestamp: Date.now(),
      };
    }

    return null;
  }

  private createProfileBar(): HTMLElement {
    const bar = createElement('div', { className: 'cinema-profile-bar' });

    for (const profile of CINEMA_PROFILES) {
      const pill = createElement('button', {
        className: `cinema-profile-pill${profile.id === this.activeProfile.id ? ' active' : ''}`,
        textContent: profile.shortKey,
      });
      pill.title = profile.name;
      pill.addEventListener('click', () => this.setProfile(profile.id));
      bar.appendChild(pill);
    }

    return bar;
  }

  private updateProfileBar(): void {
    if (!this.profileBar) return;
    const pills = this.profileBar.querySelectorAll('.cinema-profile-pill');
    pills.forEach((pill, i) => {
      pill.classList.toggle('active', CINEMA_PROFILES[i].id === this.activeProfile.id);
    });
  }

  destroy(): void {
    if (this.active) this.exit();
    this.onEnterCallbacks = [];
    this.onExitCallbacks = [];
    this.onProfileChangeCallbacks = [];
  }
}
