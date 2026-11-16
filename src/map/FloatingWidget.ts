import { createElement } from '../utils/dom.ts';

const STORAGE_KEY = 'nw:floating-widgets';

interface WidgetState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

export class FloatingWidgetManager {
  private container: HTMLElement;
  private widgets = new Map<string, { state: WidgetState; el: HTMLElement }>();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  open(id: string, title: string, contentBuilder: (body: HTMLElement) => void): void {
    if (this.widgets.has(id)) {
      // Focus existing
      const w = this.widgets.get(id)!;
      w.el.style.zIndex = String(this.getTopZ() + 1);
      return;
    }

    const state: WidgetState = {
      id,
      x: 20 + this.widgets.size * 30,
      y: 60 + this.widgets.size * 30,
      width: 340,
      height: 280,
      minimized: false,
    };

    const el = this.createWidgetEl(state, title, contentBuilder);
    this.container.appendChild(el);
    this.widgets.set(id, { state, el });
    this.save();
  }

  close(id: string): void {
    const w = this.widgets.get(id);
    if (!w) return;
    w.el.remove();
    this.widgets.delete(id);
    this.save();
  }

  isOpen(id: string): boolean {
    return this.widgets.has(id);
  }

  private createWidgetEl(state: WidgetState, title: string, contentBuilder: (body: HTMLElement) => void): HTMLElement {
    const el = createElement('div', { className: 'nw-float-widget' });
    el.style.left = `${state.x}px`;
    el.style.top = `${state.y}px`;
    el.style.width = `${state.width}px`;
    el.style.height = `${state.height}px`;
    el.style.zIndex = String(this.getTopZ() + 1);

    // Header
    const header = createElement('div', { className: 'nw-float-header' });
    const titleEl = createElement('span', { className: 'nw-float-title', textContent: title });

    const controls = createElement('div', { className: 'nw-float-controls' });
    const minBtn = createElement('button', { className: 'nw-float-btn', textContent: '\u2014' });
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.minimized = !state.minimized;
      el.classList.toggle('nw-float-minimized', state.minimized);
      this.save();
    });
    const closeBtn = createElement('button', { className: 'nw-float-btn nw-float-close-btn', textContent: '\u2715' });
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close(state.id);
    });
    controls.appendChild(minBtn);
    controls.appendChild(closeBtn);
    header.appendChild(titleEl);
    header.appendChild(controls);

    // Body
    const body = createElement('div', { className: 'nw-float-body' });
    contentBuilder(body);

    // Resize handle
    const resize = createElement('div', { className: 'nw-float-resize' });

    el.appendChild(header);
    el.appendChild(body);
    el.appendChild(resize);

    // Drag
    this.initDrag(el, header, state);
    // Resize
    this.initResize(el, resize, state);
    // Focus on click
    el.addEventListener('mousedown', () => {
      el.style.zIndex = String(this.getTopZ() + 1);
    });

    return el;
  }

  private initDrag(el: HTMLElement, handle: HTMLElement, state: WidgetState): void {
    let sx = 0,
      sy = 0,
      sl = 0,
      st = 0;
    const move = (e: MouseEvent) => {
      const nx = Math.max(0, sl + e.clientX - sx);
      const ny = Math.max(0, st + e.clientY - sy);
      el.style.left = `${nx}px`;
      el.style.top = `${ny}px`;
      state.x = nx;
      state.y = ny;
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.save();
    };
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      sx = e.clientX;
      sy = e.clientY;
      sl = el.offsetLeft;
      st = el.offsetTop;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  private initResize(el: HTMLElement, handle: HTMLElement, state: WidgetState): void {
    let sx = 0,
      sy = 0,
      sw = 0,
      sh = 0;
    const move = (e: MouseEvent) => {
      const nw = Math.max(240, sw + e.clientX - sx);
      const nh = Math.max(160, sh + e.clientY - sy);
      el.style.width = `${nw}px`;
      el.style.height = `${nh}px`;
      state.width = nw;
      state.height = nh;
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.save();
    };
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sx = e.clientX;
      sy = e.clientY;
      sw = el.offsetWidth;
      sh = el.offsetHeight;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  private getTopZ(): number {
    let max = 100;
    for (const { el } of this.widgets.values()) {
      const z = parseInt(el.style.zIndex || '100');
      if (z > max) max = z;
    }
    return max;
  }

  private save(): void {
    const states: WidgetState[] = [];
    for (const { state } of this.widgets.values()) {
      states.push({ ...state });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  }

  destroy(): void {
    for (const { el } of this.widgets.values()) el.remove();
    this.widgets.clear();
  }
}
