import maplibregl from 'maplibre-gl';

const CARTO_DARK_MATTER = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export class MapView {
  private map: maplibregl.Map | null = null;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): maplibregl.Map {
    this.map = new maplibregl.Map({
      container: this.container,
      style: CARTO_DARK_MATTER,
      center: [20, 30],
      zoom: 2.5,
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

    return this.map;
  }

  getMap(): maplibregl.Map | null {
    return this.map;
  }

  flyTo(lng: number, lat: number, zoom = 6): void {
    this.map?.flyTo({ center: [lng, lat], zoom, duration: 1500 });
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
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.map?.remove();
    this.map = null;
  }
}
