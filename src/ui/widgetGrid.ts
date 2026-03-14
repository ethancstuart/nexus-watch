import { createElement } from '../utils/dom.ts';
import { Panel } from '../panels/Panel.ts';
import {
  getSpaces,
  updateWidgetPlacement,
  colSpanToSize,
} from '../services/spaces.ts';
import type { Space } from '../types/index.ts';

const MIN_COL_SPAN = 3;
const MIN_ROW_SPAN = 1;
const ROW_HEIGHT = 60;
const GAP = 12;

// ─── Grid Metrics ────────────────────────────────────────────────

interface GridMetrics {
  colCount: number;
  colWidth: number;
  rowHeight: number;
  gridLeft: number;
  gridTop: number;
  gap: number;
}

function getGridMetrics(grid: HTMLElement): GridMetrics {
  const rect = grid.getBoundingClientRect();
  const style = getComputedStyle(grid);
  const cols = style.gridTemplateColumns.split(' ').length;
  const gap = parseFloat(style.gap) || GAP;
  const padding = parseFloat(style.paddingLeft) || 16;
  const totalGap = gap * (cols - 1);
  const colWidth = (rect.width - padding * 2 - totalGap) / cols;
  return {
    colCount: cols,
    colWidth,
    rowHeight: ROW_HEIGHT,
    gridLeft: rect.left + padding,
    gridTop: rect.top + parseFloat(style.paddingTop) || 16,
    gap,
  };
}

function cellFromPoint(
  x: number,
  y: number,
  metrics: GridMetrics,
): { col: number; row: number } {
  const relX = x - metrics.gridLeft;
  const relY = y - metrics.gridTop;
  const cellWidth = metrics.colWidth + metrics.gap;
  const cellHeight = metrics.rowHeight + metrics.gap;
  const col = Math.max(1, Math.min(metrics.colCount, Math.floor(relX / cellWidth) + 1));
  const row = Math.max(1, Math.floor(relY / cellHeight) + 1);
  return { col, row };
}

// ─── Ghost Grid Overlay ──────────────────────────────────────────

function showGhostGrid(grid: HTMLElement, rows: number): HTMLElement {
  removeGhostGrid(grid);
  const ghost = createElement('div', { className: 'space-grid-ghost' });
  const metrics = getGridMetrics(grid);
  const cellCount = metrics.colCount * rows;
  for (let i = 0; i < cellCount; i++) {
    ghost.appendChild(createElement('div', { className: 'space-grid-ghost-cell' }));
  }
  grid.appendChild(ghost);
  return ghost;
}

function removeGhostGrid(grid: HTMLElement): void {
  grid.querySelector('.space-grid-ghost')?.remove();
}

function showGhostPreview(
  ghost: HTMLElement,
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
): void {
  let preview = ghost.querySelector('.space-grid-ghost-preview') as HTMLElement | null;
  if (!preview) {
    preview = createElement('div', { className: 'space-grid-ghost-preview' });
    ghost.appendChild(preview);
  }
  preview.style.setProperty('--preview-col', String(col));
  preview.style.setProperty('--preview-colspan', String(colSpan));
  preview.style.setProperty('--preview-row', String(row));
  preview.style.setProperty('--preview-rowspan', String(rowSpan));
}

// ─── Resize Tooltip ──────────────────────────────────────────────

function showResizeTooltip(x: number, y: number, colSpan: number, rowSpan: number): HTMLElement {
  let tooltip = document.querySelector('.widget-resize-tooltip') as HTMLElement | null;
  if (!tooltip) {
    tooltip = createElement('div', { className: 'widget-resize-tooltip' });
    document.body.appendChild(tooltip);
  }
  tooltip.textContent = `${colSpan}\u00D7${rowSpan}`;
  tooltip.style.left = `${x + 12}px`;
  tooltip.style.top = `${y + 12}px`;
  return tooltip;
}

function removeResizeTooltip(): void {
  document.querySelector('.widget-resize-tooltip')?.remove();
}

// ─── Listener Cleanup ───────────────────────────────────────────

let activeAbortController: AbortController | null = null;

// ─── Render Space ────────────────────────────────────────────────

export function renderSpace(
  container: HTMLElement,
  space: Space,
  panels: Map<string, Panel>,
): void {
  // Abort previous listeners to prevent accumulation
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  container.textContent = '';

  const widgets = space.widgets;

  for (const widget of widgets) {
    const panel = panels.get(widget.panelId);
    if (!panel) continue;

    // Set explicit grid placement
    panel.container.style.gridColumn = `${widget.col} / span ${widget.colSpan}`;
    panel.container.style.gridRow = `${widget.row} / span ${widget.rowSpan}`;

    panel.container.classList.remove('widget-compact', 'widget-medium', 'widget-large');
    panel.container.classList.add(`widget-${colSpanToSize(widget.colSpan)}`);

    // Stagger entry animation
    const idx = widgets.indexOf(widget);
    panel.container.style.animationDelay = `${idx * 0.04}s`;

    // Add resize handles if not present
    addResizeHandles(panel.container);

    container.appendChild(panel.container);
  }

  // Init interactions (pass signal for cleanup on next render)
  initDragToPlace(container, space.id, panels, activeAbortController.signal);
  initEdgeResize(container, space.id, panels, activeAbortController.signal);
}

// ─── Update Placements In-Place ─────────────────────────────────

function updatePlacementsInPlace(
  _container: HTMLElement,
  space: Space,
  panels: Map<string, Panel>,
): void {
  for (const widget of space.widgets) {
    const panel = panels.get(widget.panelId);
    if (!panel) continue;

    panel.container.style.gridColumn = `${widget.col} / span ${widget.colSpan}`;
    panel.container.style.gridRow = `${widget.row} / span ${widget.rowSpan}`;

    const newSize = colSpanToSize(widget.colSpan);
    panel.container.classList.remove('widget-compact', 'widget-medium', 'widget-large');
    panel.container.classList.add(`widget-${newSize}`);
  }
}

// ─── Resize Handles ──────────────────────────────────────────────

function addResizeHandles(card: HTMLElement): void {
  if (card.querySelector('.widget-resize-right')) return;
  const right = createElement('div', { className: 'widget-resize-right' });
  right.setAttribute('role', 'separator');
  right.setAttribute('aria-orientation', 'vertical');
  const bottom = createElement('div', { className: 'widget-resize-bottom' });
  bottom.setAttribute('role', 'separator');
  bottom.setAttribute('aria-orientation', 'horizontal');
  const corner = createElement('div', { className: 'widget-resize-corner' });
  corner.setAttribute('role', 'separator');
  card.appendChild(right);
  card.appendChild(bottom);
  card.appendChild(corner);
}

// ─── Drag to Place ───────────────────────────────────────────────

function initDragToPlace(
  grid: HTMLElement,
  spaceId: string,
  panels: Map<string, Panel>,
  signal: AbortSignal,
): void {
  const panelCards = grid.querySelectorAll('.panel-card[data-panel-id]');

  for (const card of panelCards) {
    const el = card as HTMLElement;
    const header = el.querySelector('.panel-header');
    if (!header) continue;

    // Add grip handle if not present
    if (!header.querySelector('.panel-drag-handle')) {
      const grip = document.createElement('span');
      grip.className = 'panel-drag-handle';
      grip.textContent = '\u2630';
      grip.setAttribute('aria-label', 'Drag to reorder');
      header.insertBefore(grip, header.firstChild);
    }

    const grip = header.querySelector('.panel-drag-handle') as HTMLElement;
    if (!grip) continue;

    // Mouse drag
    grip.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      startDrag(e.clientX, e.clientY, el, grid, spaceId, panels);
    }, { signal });

    // Touch drag
    grip.addEventListener('touchstart', (e: TouchEvent) => {
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY, el, grid, spaceId, panels);
    }, { passive: true, signal });
  }
}

function startDrag(
  startX: number,
  startY: number,
  card: HTMLElement,
  grid: HTMLElement,
  spaceId: string,
  panels: Map<string, Panel>,
): void {
  const panelId = card.dataset.panelId;
  if (!panelId) return;

  const spaces = getSpaces();
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return;
  const widget = space.widgets.find((w) => w.panelId === panelId);
  if (!widget) return;

  const wColSpan = widget.colSpan;
  const wRowSpan = widget.rowSpan;

  let dragActive = false;
  let clone: HTMLElement | null = null;
  let ghost: HTMLElement | null = null;
  const THRESHOLD = 10;

  const maxRow = Math.max(...space.widgets.map((w) => w.row + w.rowSpan));

  // Cache metrics once at drag start — grid doesn't resize during a drag
  const cachedMetrics = getGridMetrics(grid);

  function onMove(x: number, y: number) {
    const dx = x - startX;
    const dy = y - startY;

    if (!dragActive) {
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      dragActive = true;

      // Create floating clone
      clone = card.cloneNode(true) as HTMLElement;
      clone.className = 'panel-card panel-dragging panel-drag-clone';
      const rect = card.getBoundingClientRect();
      clone.style.cssText = `
        position: fixed; z-index: 10000; pointer-events: none; opacity: 0.8;
        width: ${rect.width}px; height: ${rect.height}px;
        left: ${rect.left}px; top: ${rect.top}px;
      `;
      document.body.appendChild(clone);
      card.classList.add('panel-dragging');

      // Show ghost grid
      ghost = showGhostGrid(grid, maxRow + 4);
    }

    if (clone) {
      clone.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    // Calculate target cell (using cached metrics)
    const target = cellFromPoint(x, y, cachedMetrics);
    // Clamp so widget fits in grid
    const clampedCol = Math.max(1, Math.min(cachedMetrics.colCount - wColSpan + 1, target.col));
    const clampedRow = Math.max(1, target.row);

    if (ghost) {
      showGhostPreview(ghost, clampedCol, clampedRow, wColSpan, wRowSpan);
    }
  }

  function onEnd(x: number, y: number) {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);

    card.classList.remove('panel-dragging');
    clone?.remove();
    removeGhostGrid(grid);

    if (!dragActive) return;

    const target = cellFromPoint(x, y, cachedMetrics);
    const newCol = Math.max(1, Math.min(cachedMetrics.colCount - wColSpan + 1, target.col));
    const newRow = Math.max(1, target.row);

    updateWidgetPlacement(spaceId, panelId!, { col: newCol, row: newRow });

    // Update positions in-place (no DOM teardown)
    const updatedSpaces = getSpaces();
    const updatedSpace = updatedSpaces.find((s) => s.id === spaceId);
    if (updatedSpace) {
      updatePlacementsInPlace(grid, updatedSpace, panels);
    }
  }

  function handleMouseMove(e: MouseEvent) { onMove(e.clientX, e.clientY); }
  function handleMouseUp(e: MouseEvent) { onEnd(e.clientX, e.clientY); }
  function handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    const t = e.touches[0];
    onMove(t.clientX, t.clientY);
  }
  function handleTouchEnd(e: TouchEvent) {
    const t = e.changedTouches[0];
    onEnd(t.clientX, t.clientY);
  }

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd);
}

// ─── Edge Resize ─────────────────────────────────────────────────

function initEdgeResize(
  grid: HTMLElement,
  spaceId: string,
  panels: Map<string, Panel>,
  signal: AbortSignal,
): void {
  const panelCards = grid.querySelectorAll('.panel-card[data-panel-id]');

  for (const card of panelCards) {
    const el = card as HTMLElement;
    const rightHandle = el.querySelector('.widget-resize-right');
    const bottomHandle = el.querySelector('.widget-resize-bottom');
    const cornerHandle = el.querySelector('.widget-resize-corner');

    if (rightHandle) {
      rightHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startResize(e as MouseEvent, el, grid, spaceId, panels, 'right');
      }, { signal });
      rightHandle.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        startResize(e as TouchEvent, el, grid, spaceId, panels, 'right');
      }, { passive: true, signal });
    }
    if (bottomHandle) {
      bottomHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startResize(e as MouseEvent, el, grid, spaceId, panels, 'bottom');
      }, { signal });
      bottomHandle.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        startResize(e as TouchEvent, el, grid, spaceId, panels, 'bottom');
      }, { passive: true, signal });
    }
    if (cornerHandle) {
      cornerHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startResize(e as MouseEvent, el, grid, spaceId, panels, 'corner');
      }, { signal });
      cornerHandle.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        startResize(e as TouchEvent, el, grid, spaceId, panels, 'corner');
      }, { passive: true, signal });
    }
  }
}

function startResize(
  _e: MouseEvent | TouchEvent,
  card: HTMLElement,
  grid: HTMLElement,
  spaceId: string,
  panels: Map<string, Panel>,
  direction: 'right' | 'bottom' | 'corner',
): void {
  const panelId = card.dataset.panelId;
  if (!panelId) return;

  const spaces = getSpaces();
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return;
  const widget = space.widgets.find((w) => w.panelId === panelId);
  if (!widget) return;

  const panel = panels.get(panelId);
  const minColSpan = panel && !panel.supportedSizes.includes('compact') ?
    (panel.supportedSizes.includes('medium') ? 5 : 9) : MIN_COL_SPAN;

  const wCol = widget.col;
  const wRow = widget.row;
  const startColSpan = widget.colSpan;
  const startRowSpan = widget.rowSpan;
  const metrics = getGridMetrics(grid);

  card.classList.add('widget-resizing');

  const ghost = showGhostGrid(grid, Math.max(...space.widgets.map((w) => w.row + w.rowSpan)) + 4);

  function onMove(x: number, y: number) {
    const target = cellFromPoint(x, y, metrics);

    let newColSpan = startColSpan;
    let newRowSpan = startRowSpan;

    if (direction === 'right' || direction === 'corner') {
      newColSpan = Math.max(minColSpan, Math.min(metrics.colCount - wCol + 1, target.col - wCol + 1));
    }
    if (direction === 'bottom' || direction === 'corner') {
      newRowSpan = Math.max(MIN_ROW_SPAN, target.row - wRow + 1);
    }

    // Live update inline styles
    card.style.gridColumn = `${wCol} / span ${newColSpan}`;
    card.style.gridRow = `${wRow} / span ${newRowSpan}`;

    showGhostPreview(ghost, wCol, wRow, newColSpan, newRowSpan);
    showResizeTooltip(x, y, newColSpan, newRowSpan);
  }

  function onEnd(x: number, y: number) {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);

    card.classList.remove('widget-resizing');
    removeGhostGrid(grid);
    removeResizeTooltip();

    const target = cellFromPoint(x, y, metrics);

    let newColSpan = startColSpan;
    let newRowSpan = startRowSpan;

    if (direction === 'right' || direction === 'corner') {
      newColSpan = Math.max(minColSpan, Math.min(metrics.colCount - wCol + 1, target.col - wCol + 1));
    }
    if (direction === 'bottom' || direction === 'corner') {
      newRowSpan = Math.max(MIN_ROW_SPAN, target.row - wRow + 1);
    }

    if (newColSpan !== startColSpan || newRowSpan !== startRowSpan) {
      updateWidgetPlacement(spaceId, panelId!, { colSpan: newColSpan, rowSpan: newRowSpan });

      // Update positions in-place (no DOM teardown)
      const updatedSpaces = getSpaces();
      const updatedSpace = updatedSpaces.find((s) => s.id === spaceId);
      if (updatedSpace) {
        updatePlacementsInPlace(grid, updatedSpace, panels);
      }

      // Re-render panel content only if size category changed
      const newSize = colSpanToSize(newColSpan);
      const oldSize = colSpanToSize(startColSpan);
      if (newSize !== oldSize && panel && panel.supportedSizes.includes(newSize)) {
        panel.renderAtSize(newSize);
      }
    }
  }

  function handleMouseMove(e: MouseEvent) { onMove(e.clientX, e.clientY); }
  function handleMouseUp(e: MouseEvent) { onEnd(e.clientX, e.clientY); }
  function handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    const t = e.touches[0];
    onMove(t.clientX, t.clientY);
  }
  function handleTouchEnd(e: TouchEvent) {
    const t = e.changedTouches[0];
    onEnd(t.clientX, t.clientY);
  }

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd);
}
