import maplibregl from 'maplibre-gl';
import { getMapStyleUrl } from './MapStyleToggle.ts';
const VIEWPORT_KEY = 'nw:map-viewport';
const MAPLIBRE_CSS_URL = 'https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css';

/**
 * Inject the maplibre-gl stylesheet on first MapView construction.
 * Loading it from index.html would block paint on every route — but
 * landing/pricing/etc. don't render the globe. Idempotent: we tag the
 * <link> so subsequent MapView instances don't re-add it.
 */
function ensureMaplibreStylesheet(): void {
  const existing = document.querySelector<HTMLLinkElement>('link[data-nw-maplibre-css]');
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MAPLIBRE_CSS_URL;
  link.crossOrigin = 'anonymous';
  link.dataset.nwMaplibreCss = '1';
  document.head.appendChild(link);
}

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
    // Inject maplibre-gl.css before constructing the map so default
    // controls (zoom, attribution, popups) render styled. See top-level
    // comment on ensureMaplibreStylesheet for why this isn't in index.html.
    ensureMaplibreStylesheet();
    // 2026-05-02: bumped to globe-v3 so existing users get the new
    // wide-angle default zoom (was 3.8, now 1.5 — shows the full globe
    // on first load instead of a continental crop).
    const GLOBE_VERSION = 'globe-v3';
    if (localStorage.getItem('nw:globe-version') !== GLOBE_VERSION) {
      localStorage.removeItem(VIEWPORT_KEY);
      localStorage.setItem('nw:globe-version', GLOBE_VERSION);
    }
    const saved = this.loadViewport();

    this.map = new maplibregl.Map({
      container: this.container,
      style: getMapStyleUrl(),
      center: saved?.center || [0, 20],
      zoom: saved?.zoom || 1.5,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxZoom: 18,
      minZoom: 0.8,
      // Prefer fade-in on tile load so empty-tile frames don't flash.
      fadeDuration: 300,
      // Parallelize tile sprite/icon image fetches. MapLibre default is
      // 16 — we explicitly set it to make the boot path faster on
      // connections that can support it. Lower-end mobile networks still
      // benefit because the requests are HTTP/2 multiplexed. The option
      // is accepted at runtime but not in the v5 MapOptions type, so we
      // widen via a cast.
      ...({ maxParallelImageRequests: 16, preserveDrawingBuffer: true } as Record<string, unknown>),
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
      // Dim base-style country / place labels at globe-zoom levels so they
      // stay ambient context — data labels (event markers, intel pills) own
      // first read. CARTO dark-matter / positron / voyager all use layer ids
      // that include 'country'/'place'/'state'/'admin'; we filter by name
      // pattern instead of hard-coding so the override survives style swaps.
      this.dimBaseStyleLabels();
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

    // 2026-05-02: removed auto-geolocate-to-user behavior on first load.
    // It produced a permission prompt before the user understood what
    // the platform was, and yanked the camera away from the globe overview
    // — disorienting for new visitors. Users can fly to their region via
    // the search bar or country panel.

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

  /**
   * Dim base-style country / place / state labels at globe-zoom levels so
   * they stay ambient context. Without this the CARTO dark-matter style
   * paints "NORTH KOREA / SOUTH KOREA / JAPAN" at full size right on top of
   * our data labels (M-x earthquakes, ACLED events, intel pills) which makes
   * the Cinema-mode globe unreadable around dense regions.
   *
   * Heuristic: any base-style symbol layer whose id mentions country / place /
   * state / admin / city is treated as a "place label." Strategy:
   *   - text-opacity ramps from 0.25 (zoom 2) → 0.65 (zoom 8). Country
   *     names read at theater-zoom but stay quiet at globe-zoom.
   *   - text-size scales down (10px@z2 → 14px@z8) so we don't get the
   *     20px+ "MONGOLIA" stomp.
   *   - text-color forced to a muted gray so labels never compete with the
   *     orange/red severity colors on our data layers.
   *   - text-halo-color set to pure black so labels read against the dark
   *     basemap without bleeding.
   * If MapLibre rejects a property (style spec mismatch), we silently skip
   * that layer rather than throwing — the goal is best-effort dimming.
   */
  private dimBaseStyleLabels(): void {
    if (!this.map) return;
    const style = this.map.getStyle();
    if (!style?.layers) return;

    const PLACE_LABEL_PATTERN = /\b(country|place|state|admin|city|town|locality)\b/i;
    const dimColor = '#7a7a7a';
    const haloColor = 'rgba(0, 0, 0, 0.9)';
    const opacityRamp = ['interpolate', ['linear'], ['zoom'], 2, 0.25, 5, 0.5, 8, 0.65] as unknown;
    const sizeRamp = ['interpolate', ['linear'], ['zoom'], 2, 10, 5, 12, 8, 14] as unknown;

    for (const layer of style.layers) {
      if (layer.type !== 'symbol') continue;
      if (!PLACE_LABEL_PATTERN.test(layer.id)) continue;

      try {
        this.map.setPaintProperty(layer.id, 'text-opacity', opacityRamp as maplibregl.ExpressionSpecification);
      } catch {
        /* layer may not have text — skip */
      }
      try {
        this.map.setPaintProperty(layer.id, 'text-color', dimColor);
      } catch {
        /* skip */
      }
      try {
        this.map.setPaintProperty(layer.id, 'text-halo-color', haloColor);
      } catch {
        /* skip */
      }
      try {
        this.map.setPaintProperty(layer.id, 'text-halo-width', 1);
      } catch {
        /* skip */
      }
      try {
        this.map.setLayoutProperty(layer.id, 'text-size', sizeRamp as maplibregl.ExpressionSpecification);
      } catch {
        /* skip */
      }
    }
  }

  destroy(): void {
    this.saveViewport();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.map?.remove();
    this.map = null;
  }
}
