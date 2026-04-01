import { createElement } from '../utils/dom.ts';
import type { Panel } from '../panels/Panel.ts';
import type { MapOverlayWidget } from '../types/index.ts';

const STORAGE_KEY = 'dashview:map-overlays';
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;

export class MapOverlayManager {
  private mapContainer: HTMLElement;
  private overlays = new Map<string, { widget: MapOverlayWidget; el: HTMLElement; panel: Panel }>();
  private panelRegistry: Map<string, Panel>;

  constructor(mapContainer: HTMLElement, panelRegistry: Map<string, Panel>) {
    this.mapContainer = mapContainer;
    this.panelRegistry = panelRegistry;
    this.loadState();
  }

  openOverlay(panelId: string): void {
    if (this.overlays.has(panelId)) {
      // Already open — focus it
      const overlay = this.overlays.get(panelId)!;
      overlay.el.style.zIndex = String(this.getTopZ() + 1);
      return;
    }

    const panel = this.panelRegistry.get(panelId);
    if (!panel) return;

    const widget: MapOverlayWidget = {
      panelId,
      x: 20 + this.overlays.size * 30,
      y: 60 + this.overlays.size * 30,
      width: 380,
      height: 320,
      minimized: false,
    };

    const el = this.createOverlayElement(widget, panel);
    this.mapContainer.appendChild(el);
    panel.attachToDOM(el.querySelector('.map-overlay-body') as HTMLElement);
    void panel.startDataCycle();

    this.overlays.set(panelId, { widget, el, panel });
    this.saveState();
  }

  closeOverlay(panelId: string): void {
    const overlay = this.overlays.get(panelId);
    if (!overlay) return;
    overlay.panel.stopDataCycle();
    overlay.panel.container.remove();
    overlay.el.remove();
    this.overlays.delete(panelId);
    this.saveState();
  }

  isOpen(panelId: string): boolean {
    return this.overlays.has(panelId);
  }

  getOpenPanelIds(): string[] {
    return Array.from(this.overlays.keys());
  }

  private createOverlayElement(widget: MapOverlayWidget, panel: Panel): HTMLElement {
    const el = createElement('div', { className: 'map-overlay' });
    el.style.left = `${widget.x}px`;
    el.style.top = `${widget.y}px`;
    el.style.width = `${widget.width}px`;
    el.style.height = `${widget.height}px`;
    el.style.zIndex = String(this.getTopZ() + 1);
    el.dataset.panelId = widget.panelId;

    // Header bar
    const header = createElement('div', { className: 'map-overlay-header' });
    const title = createElement('span', { className: 'map-overlay-title', textContent: panel.title });

    const controls = createElement('div', { className: 'map-overlay-controls' });

    const minBtn = createElement('button', { className: 'map-overlay-btn', textContent: '\u2014' });
    minBtn.title = 'Minimize';
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimize(widget.panelId);
    });

    const closeBtn = createElement('button', { className: 'map-overlay-btn map-overlay-close', textContent: '\u2715' });
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeOverlay(widget.panelId);
    });

    controls.appendChild(minBtn);
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);

    // Body
    const body = createElement('div', { className: 'map-overlay-body' });

    // Resize handle
    const resizeHandle = createElement('div', { className: 'map-overlay-resize' });

    el.appendChild(header);
    el.appendChild(body);
    el.appendChild(resizeHandle);

    // Drag
    this.initDrag(el, header, widget);
    // Resize
    this.initResize(el, resizeHandle, widget);
    // Focus on click
    el.addEventListener('mousedown', () => {
      el.style.zIndex = String(this.getTopZ() + 1);
    });

    return el;
  }

  private toggleMinimize(panelId: string): void {
    const overlay = this.overlays.get(panelId);
    if (!overlay) return;
    overlay.widget.minimized = !overlay.widget.minimized;
    overlay.el.classList.toggle('map-overlay-minimized', overlay.widget.minimized);
    this.saveState();
  }

  private initDrag(el: HTMLElement, handle: HTMLElement, widget: MapOverlayWidget): void {
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = Math.max(0, Math.min(startLeft + dx, this.mapContainer.clientWidth - 100));
      const newTop = Math.max(0, Math.min(startTop + dy, this.mapContainer.clientHeight - 40));
      el.style.left = `${newLeft}px`;
      el.style.top = `${newTop}px`;
      widget.x = newLeft;
      widget.y = newTop;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      el.classList.remove('map-overlay-dragging');
      this.saveState();
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = el.offsetLeft;
      startTop = el.offsetTop;
      el.classList.add('map-overlay-dragging');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  private initResize(el: HTMLElement, handle: HTMLElement, widget: MapOverlayWidget): void {
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    const onMouseMove = (e: MouseEvent) => {
      const newW = Math.max(MIN_WIDTH, startW + (e.clientX - startX));
      const newH = Math.max(MIN_HEIGHT, startH + (e.clientY - startY));
      el.style.width = `${newW}px`;
      el.style.height = `${newH}px`;
      widget.width = newW;
      widget.height = newH;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.saveState();
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      startW = el.offsetWidth;
      startH = el.offsetHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  private getTopZ(): number {
    let max = 100;
    for (const { el } of this.overlays.values()) {
      const z = parseInt(el.style.zIndex || '100', 10);
      if (z > max) max = z;
    }
    return max;
  }

  private saveState(): void {
    const state: MapOverlayWidget[] = [];
    for (const { widget } of this.overlays.values()) {
      state.push({ ...widget });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private loadState(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const widgets = JSON.parse(stored) as MapOverlayWidget[];
      // We'll restore overlays after panels are ready — just keep the state
      this._pendingRestore = widgets;
    } catch {
      // ignore
    }
  }

  private _pendingRestore: MapOverlayWidget[] | null = null;

  restoreOverlays(): void {
    if (!this._pendingRestore) return;
    for (const w of this._pendingRestore) {
      if (this.panelRegistry.has(w.panelId)) {
        const panel = this.panelRegistry.get(w.panelId)!;
        const el = this.createOverlayElement(w, panel);
        this.mapContainer.appendChild(el);
        panel.attachToDOM(el.querySelector('.map-overlay-body') as HTMLElement);
        void panel.startDataCycle();
        this.overlays.set(w.panelId, { widget: w, el, panel });
      }
    }
    this._pendingRestore = null;
  }

  destroy(): void {
    for (const [id] of this.overlays) {
      this.closeOverlay(id);
    }
  }
}
