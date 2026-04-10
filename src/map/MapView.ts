import maplibregl from 'maplibre-gl';
import { getMapStyleUrl } from './MapStyleToggle.ts';
const VIEWPORT_KEY = 'nw:map-viewport';

interface SavedViewport {
  center: [number, number];
  zoom: number;
}

export class MapView {
  private map: maplibregl.Map | null = null;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;
  private rotating = false;
  private rotationSpeed = 0.006;
  private rotationFrame: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): maplibregl.Map {
    // Clear stale viewport from pre-globe era
    const GLOBE_VERSION = 'globe-v2';
    if (localStorage.getItem('nw:globe-version') !== GLOBE_VERSION) {
      localStorage.removeItem(VIEWPORT_KEY);
      localStorage.setItem('nw:globe-version', GLOBE_VERSION);
    }
    const saved = this.loadViewport();

    this.map = new maplibregl.Map({
      container: this.container,
      style: getMapStyleUrl(),
      center: saved?.center || [0, 20],
      zoom: saved?.zoom || 3.8,
      pitch: 10,
      bearing: 0,
      attributionControl: false,
      maxZoom: 18,
      minZoom: 0.8,
    });

    this.map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), 'bottom-left');

    // Enable globe projection and atmosphere after style loads
    this.map.on('style.load', () => {
      try {
        this.map?.setProjection({ type: 'globe' } as maplibregl.ProjectionSpecification);
      } catch {
        // Globe projection not supported — stay on mercator
      }
      try {
        (this.map as unknown as { setFog: (opts: Record<string, unknown>) => void })?.setFog({
          color: 'rgba(0, 0, 0, 1)',
          'high-color': 'rgba(20, 10, 5, 1)',
          'horizon-blend': 0.12,
          'space-color': 'rgba(0, 0, 0, 1)',
          'star-intensity': 0.6,
        });
      } catch {
        // Fog not supported
      }
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.map?.resize();
    });
    this.resizeObserver.observe(this.container);

    // Persist viewport on move (debounced)
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    this.map.on('moveend', () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => this.saveViewport(), 1000);
    });

    // Center on user's location if no saved viewport
    if (!saved && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.map?.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 3.5,
            duration: 2000,
          });
        },
        () => {
          // Geolocation denied — stay at default center
        },
        { timeout: 5000 },
      );
    }

    // Auto-rotate globe slowly on first load (stops on user interaction)
    this.rotating = true;
    this.rotationSpeed = 0.006;
    const rotateGlobe = () => {
      if (!this.rotating || !this.map) return;
      const center = this.map.getCenter();
      this.map.setCenter([center.lng + this.rotationSpeed, center.lat]);
      this.rotationFrame = requestAnimationFrame(rotateGlobe);
    };

    // Start rotation after layers load
    this.map.on('load', () => {
      setTimeout(() => rotateGlobe(), 2000);
    });

    // Stop on any user interaction, resume after 30 seconds idle
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const stopRotation = () => {
      this.rotating = false;
      if (this.rotationFrame) cancelAnimationFrame(this.rotationFrame);
      this.rotationFrame = null;
      // Resume after 30 seconds of no interaction
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!this.rotating && this.map) {
          this.rotating = true;
          rotateGlobe();
        }
      }, 30000);
    };
    this.map.on('mousedown', stopRotation);
    this.map.on('touchstart', stopRotation);
    this.map.on('wheel', stopRotation);

    return this.map;
  }

  getMap(): maplibregl.Map | null {
    return this.map;
  }

  flyTo(lng: number, lat: number, zoom = 6): void {
    this.map?.flyTo({ center: [lng, lat], zoom, duration: 2200, curve: 1.42 });
  }

  private saveViewport(): void {
    if (!this.map) return;
    const c = this.map.getCenter();
    const vp: SavedViewport = { center: [c.lng, c.lat], zoom: this.map.getZoom() };
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify(vp));
  }

  private loadViewport(): SavedViewport | null {
    try {
      const raw = localStorage.getItem(VIEWPORT_KEY);
      if (raw) return JSON.parse(raw) as SavedViewport;
    } catch {
      // ignore
    }
    return null;
  }

  startRotation(degreesPerFrame = 0.006): void {
    if (this.rotating) return;
    this.rotating = true;
    this.rotationSpeed = degreesPerFrame;
    const rotate = () => {
      if (!this.rotating || !this.map) return;
      const center = this.map.getCenter();
      this.map.setCenter([center.lng + this.rotationSpeed, center.lat]);
      this.rotationFrame = requestAnimationFrame(rotate);
    };
    rotate();
  }

  stopRotation(): void {
    this.rotating = false;
    if (this.rotationFrame) cancelAnimationFrame(this.rotationFrame);
    this.rotationFrame = null;
  }

  isRotating(): boolean {
    return this.rotating;
  }

  flyToAsync(
    lng: number,
    lat: number,
    zoom = 6,
    opts?: Partial<{ duration: number; curve: number; pitch: number }>,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) {
        resolve();
        return;
      }
      const onEnd = () => {
        this.map?.off('moveend', onEnd);
        resolve();
      };
      this.map.on('moveend', onEnd);
      this.map.flyTo({
        center: [lng, lat],
        zoom,
        duration: opts?.duration ?? 3500,
        curve: opts?.curve ?? 1.8,
        pitch: opts?.pitch ?? 10,
        essential: true,
      });
    });
  }

  getViewState(): { center: [number, number]; zoom: number; pitch: number; bearing: number } {
    if (!this.map) return { center: [20, 30], zoom: 2.5, pitch: 0, bearing: 0 };
    const c = this.map.getCenter();
    return {
      center: [c.lng, c.lat],
      zoom: this.map.getZoom(),
      pitch: this.map.getPitch(),
      bearing: this.map.getBearing(),
    };
  }

  destroy(): void {
    this.saveViewport();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.map?.remove();
    this.map = null;
  }
}
