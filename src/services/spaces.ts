import type { Space, SpaceWidget, WidgetSize } from '../types/index.ts';
import * as storage from './storage.ts';

const SPACES_KEY = 'dashview:spaces';
const ACTIVE_SPACE_KEY = 'dashview:active-space';

const COLS = 12;

const DEFAULT_ROW_SPAN: Record<WidgetSize, number> = {
  compact: 4,
  medium: 5,
  large: 6,
};

export function colSpanToSize(colSpan: number): WidgetSize {
  if (colSpan <= 4) return 'compact';
  if (colSpan <= 8) return 'medium';
  return 'large';
}

const DEFAULT_SPACES: Space[] = [
  {
    id: 'overview',
    name: 'Overview',
    icon: '\u26A1',
    widgets: [
      { panelId: 'weather', size: 'medium', col: 1, row: 1, colSpan: 4, rowSpan: 5 },
      { panelId: 'stocks', size: 'medium', col: 5, row: 1, colSpan: 4, rowSpan: 5 },
      { panelId: 'crypto', size: 'medium', col: 9, row: 1, colSpan: 4, rowSpan: 5 },
      { panelId: 'news', size: 'medium', col: 1, row: 6, colSpan: 6, rowSpan: 5 },
      { panelId: 'sports', size: 'compact', col: 7, row: 6, colSpan: 3, rowSpan: 4 },
      { panelId: 'entertainment', size: 'compact', col: 10, row: 6, colSpan: 3, rowSpan: 4 },
    ],
  },
  {
    id: 'markets',
    name: 'Markets',
    icon: '\uD83D\uDCC8',
    widgets: [
      { panelId: 'stocks', size: 'large', col: 1, row: 1, colSpan: 6, rowSpan: 6 },
      { panelId: 'crypto', size: 'large', col: 7, row: 1, colSpan: 6, rowSpan: 6 },
      { panelId: 'news', size: 'large', col: 1, row: 7, colSpan: 12, rowSpan: 6 },
    ],
  },
  {
    id: 'globe',
    name: 'Globe',
    icon: '\uD83C\uDF0D',
    widgets: [
      { panelId: 'globe', size: 'large', col: 1, row: 1, colSpan: 12, rowSpan: 6 },
    ],
  },
  {
    id: 'personal',
    name: 'Personal',
    icon: '\uD83C\uDFE0',
    widgets: [
      { panelId: 'calendar', size: 'medium', col: 1, row: 1, colSpan: 6, rowSpan: 5 },
      { panelId: 'notes', size: 'medium', col: 7, row: 1, colSpan: 6, rowSpan: 5 },
      { panelId: 'weather', size: 'medium', col: 1, row: 6, colSpan: 4, rowSpan: 5 },
      { panelId: 'chat', size: 'large', col: 5, row: 6, colSpan: 8, rowSpan: 6 },
    ],
  },
];

// Check if a widget has old position-based format (no col/row)
function needsMigration(widget: SpaceWidget & { position?: number }): boolean {
  return widget.col === undefined || widget.row === undefined;
}

// Migrate old position-based widgets to col/row grid placement
function migrateToGrid(widgets: (SpaceWidget & { position?: number })[]): SpaceWidget[] {
  const sorted = [...widgets].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const placed: SpaceWidget[] = [];

  for (const w of sorted) {
    const colSpan = w.colSpan || 6;
    const size = w.size || colSpanToSize(colSpan);
    const rowSpan = w.rowSpan || DEFAULT_ROW_SPAN[size];
    const pos = findFirstAvailable(placed, colSpan, rowSpan);
    placed.push({
      panelId: w.panelId,
      size,
      col: pos.col,
      row: pos.row,
      colSpan,
      rowSpan,
    });
  }

  return placed;
}

// Find first available (col, row) for a widget of given size using top-left packing
function findFirstAvailable(
  placed: SpaceWidget[],
  colSpan: number,
  rowSpan: number,
): { col: number; row: number } {
  for (let row = 1; row < 100; row++) {
    for (let col = 1; col <= COLS - colSpan + 1; col++) {
      if (!overlapsAny(placed, col, row, colSpan, rowSpan)) {
        return { col, row };
      }
    }
  }
  return { col: 1, row: 1 };
}

// Check if a rectangle overlaps any placed widget
function overlapsAny(
  widgets: SpaceWidget[],
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
): boolean {
  for (const w of widgets) {
    if (rectsOverlap(col, row, colSpan, rowSpan, w.col, w.row, w.colSpan, w.rowSpan)) {
      return true;
    }
  }
  return false;
}

function rectsOverlap(
  c1: number, r1: number, cs1: number, rs1: number,
  c2: number, r2: number, cs2: number, rs2: number,
): boolean {
  return c1 < c2 + cs2 && c1 + cs1 > c2 && r1 < r2 + rs2 && r1 + rs1 > r2;
}

// Resolve collisions by pushing overlapping panels down
export function resolveCollisions(widgets: SpaceWidget[]): SpaceWidget[] {
  const sorted = [...widgets].sort((a, b) => a.row - b.row || a.col - b.col);
  const result: SpaceWidget[] = [];

  for (const w of sorted) {
    let row = w.row;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidate = { ...w, row };
      const overlap = result.some((placed) =>
        rectsOverlap(candidate.col, candidate.row, candidate.colSpan, candidate.rowSpan,
          placed.col, placed.row, placed.colSpan, placed.rowSpan));
      if (!overlap) break;
      row++;
    }
    result.push({ ...w, row });
  }

  return result;
}

// Compact layout upward to fill gaps
export function compactLayout(widgets: SpaceWidget[]): SpaceWidget[] {
  const sorted = [...widgets].sort((a, b) => a.row - b.row || a.col - b.col);
  const result: SpaceWidget[] = [];

  for (const w of sorted) {
    let bestRow = 1;
    for (let tryRow = 1; tryRow <= w.row; tryRow++) {
      const candidate = { ...w, row: tryRow };
      const overlap = result.some((placed) =>
        rectsOverlap(candidate.col, candidate.row, candidate.colSpan, candidate.rowSpan,
          placed.col, placed.row, placed.colSpan, placed.rowSpan));
      if (!overlap) {
        bestRow = tryRow;
        break;
      }
    }
    result.push({ ...w, row: bestRow });
  }

  return result;
}

export function getSpaces(): Space[] {
  const saved = storage.get<Space[] | null>(SPACES_KEY, null);
  if (saved && saved.length > 0) {
    // Migrate: replace old 'world' space with 'globe' space
    const worldIdx = saved.findIndex((s) => s.id === 'world');
    if (worldIdx !== -1 && !saved.some((s) => s.id === 'globe')) {
      const globeDefault = DEFAULT_SPACES.find((s) => s.id === 'globe');
      if (globeDefault) {
        saved[worldIdx] = { ...globeDefault, widgets: [...globeDefault.widgets] };
        storage.set(SPACES_KEY, saved);
        if (storage.get<string>(ACTIVE_SPACE_KEY, '') === 'world') {
          storage.set(ACTIVE_SPACE_KEY, 'globe');
        }
      }
    }

    // Migrate: old multi-widget Globe space to single-widget
    const globeSpace = saved.find((s) => s.id === 'globe');
    if (globeSpace && globeSpace.widgets.length > 1) {
      globeSpace.widgets = [{ panelId: 'globe', size: 'large', col: 1, row: 1, colSpan: 12, rowSpan: 6 }];
      storage.set(SPACES_KEY, saved);
    }

    // Migrate: old position-based widgets to col/row grid
    let migrated = false;
    for (const space of saved) {
      if (space.widgets.length > 0 && needsMigration(space.widgets[0] as SpaceWidget & { position?: number })) {
        space.widgets = migrateToGrid(space.widgets as (SpaceWidget & { position?: number })[]);
        migrated = true;
      }
    }
    if (migrated) {
      storage.set(SPACES_KEY, saved);
    }

    return saved;
  }
  // First load — save defaults so they persist and sync across devices
  const defaults = DEFAULT_SPACES.map((s) => ({ ...s, widgets: [...s.widgets] }));
  storage.set(SPACES_KEY, defaults);
  return defaults;
}

export function saveSpaces(spaces: Space[]): void {
  storage.set(SPACES_KEY, spaces);
}

export function getActiveSpace(): string {
  return storage.get<string>(ACTIVE_SPACE_KEY, 'overview');
}

export function setActiveSpace(id: string): void {
  storage.set(ACTIVE_SPACE_KEY, id);
}

export function createSpace(name: string, icon: string, widgets: SpaceWidget[] = []): Space {
  const spaces = getSpaces();
  const id = `space-${Date.now()}`;
  const space: Space = { id, name, icon, widgets };
  spaces.push(space);
  saveSpaces(spaces);
  return space;
}

export function deleteSpace(id: string): void {
  const spaces = getSpaces().filter((s) => s.id !== id);
  saveSpaces(spaces);
  if (getActiveSpace() === id && spaces.length > 0) {
    setActiveSpace(spaces[0].id);
  }
}

export function updateSpace(id: string, changes: Partial<Pick<Space, 'name' | 'icon' | 'widgets'>>): void {
  const spaces = getSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return;
  if (changes.name !== undefined) space.name = changes.name;
  if (changes.icon !== undefined) space.icon = changes.icon;
  if (changes.widgets !== undefined) space.widgets = changes.widgets;
  saveSpaces(spaces);
}

export function addWidgetToSpace(spaceId: string, panelId: string, size: WidgetSize = 'medium'): void {
  const spaces = getSpaces();
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return;
  // Don't add duplicates
  if (space.widgets.some((w) => w.panelId === panelId)) return;
  const colSpanMap: Record<WidgetSize, number> = { compact: 3, medium: 6, large: 12 };
  const colSpan = colSpanMap[size];
  const rowSpan = DEFAULT_ROW_SPAN[size];
  const pos = findFirstAvailable(space.widgets, colSpan, rowSpan);
  space.widgets.push({ panelId, size, col: pos.col, row: pos.row, colSpan, rowSpan });
  saveSpaces(spaces);
}

export function removeWidgetFromSpace(spaceId: string, panelId: string): void {
  const spaces = getSpaces();
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return;
  space.widgets = space.widgets.filter((w) => w.panelId !== panelId);
  space.widgets = compactLayout(space.widgets);
  saveSpaces(spaces);
}

export function updateWidgetPlacement(
  spaceId: string,
  panelId: string,
  placement: Partial<Pick<SpaceWidget, 'col' | 'row' | 'colSpan' | 'rowSpan'>>,
): void {
  const spaces = getSpaces();
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return;
  const widget = space.widgets.find((w) => w.panelId === panelId);
  if (!widget) return;

  if (placement.col !== undefined) widget.col = placement.col;
  if (placement.row !== undefined) widget.row = placement.row;
  if (placement.colSpan !== undefined) {
    widget.colSpan = placement.colSpan;
    widget.size = colSpanToSize(placement.colSpan);
  }
  if (placement.rowSpan !== undefined) widget.rowSpan = placement.rowSpan;

  // Resolve collisions and compact
  const others = space.widgets.filter((w) => w.panelId !== panelId);
  space.widgets = compactLayout(resolveCollisions([widget, ...others]));
  saveSpaces(spaces);
}

export function reorderWidgets(spaceId: string, widgetOrder: string[]): void {
  const spaces = getSpaces();
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return;
  const byPanel = new Map(space.widgets.map((w) => [w.panelId, w]));
  const reordered = widgetOrder
    .map((pid) => byPanel.get(pid))
    .filter((w): w is SpaceWidget => w !== undefined);
  // Re-pack in order
  const packed: SpaceWidget[] = [];
  for (const w of reordered) {
    const pos = findFirstAvailable(packed, w.colSpan, w.rowSpan);
    packed.push({ ...w, col: pos.col, row: pos.row });
  }
  space.widgets = packed;
  saveSpaces(spaces);
}

export function getDefaultSpaces(): Space[] {
  return DEFAULT_SPACES;
}
