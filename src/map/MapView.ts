import maplibregl from 'maplibre-gl';

const CARTO_DARK_MATTER = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const VIEWPORT_KEY = 'nw:map-viewport';

interface SavedViewport {
  center: [number, number];
  zoom: number;
}

export class MapView {
  private map: maplibregl.Map | null = null;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): maplibregl.Map {
    const saved = this.loadViewport();

    this.map = new maplibregl.Map({
      container: this.container,
      style: CARTO_DARK_MATTER,
      center: saved?.center || [20, 30],
      zoom: saved?.zoom || 2.5,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxZoom: 18,
      minZoom: 1.5,
    });

    this.map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), 'bottom-left');

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

    return this.map;
  }

  getMap(): maplibregl.Map | null {
    return this.map;
  }

  flyTo(lng: number, lat: number, zoom = 6): void {
    this.map?.flyTo({ center: [lng, lat], zoom, duration: 1500 });
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
