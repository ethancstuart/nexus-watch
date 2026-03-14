import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpaceWidget } from '../types/index.ts';

// Mock storage to isolate tests
vi.mock('./storage.ts', () => ({
  get: vi.fn(() => null),
  set: vi.fn(),
}));

let colSpanToSize: typeof import('./spaces.ts').colSpanToSize;
let resolveCollisions: typeof import('./spaces.ts').resolveCollisions;
let compactLayout: typeof import('./spaces.ts').compactLayout;
let addWidgetToSpace: typeof import('./spaces.ts').addWidgetToSpace;
let updateWidgetPlacement: typeof import('./spaces.ts').updateWidgetPlacement;
let getSpaces: typeof import('./spaces.ts').getSpaces;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./spaces.ts');
  colSpanToSize = mod.colSpanToSize;
  resolveCollisions = mod.resolveCollisions;
  compactLayout = mod.compactLayout;
  addWidgetToSpace = mod.addWidgetToSpace;
  updateWidgetPlacement = mod.updateWidgetPlacement;
  getSpaces = mod.getSpaces;
});

describe('colSpanToSize', () => {
  it('maps small colSpan to compact', () => {
    expect(colSpanToSize(3)).toBe('compact');
    expect(colSpanToSize(4)).toBe('compact');
  });

  it('maps medium colSpan to medium', () => {
    expect(colSpanToSize(5)).toBe('medium');
    expect(colSpanToSize(6)).toBe('medium');
    expect(colSpanToSize(8)).toBe('medium');
  });

  it('maps large colSpan to large', () => {
    expect(colSpanToSize(9)).toBe('large');
    expect(colSpanToSize(12)).toBe('large');
  });
});

describe('resolveCollisions', () => {
  it('returns unchanged widgets when no overlaps', () => {
    const widgets: SpaceWidget[] = [
      { panelId: 'a', size: 'medium', col: 1, row: 1, colSpan: 6, rowSpan: 5 },
      { panelId: 'b', size: 'medium', col: 7, row: 1, colSpan: 6, rowSpan: 5 },
    ];
    const result = resolveCollisions(widgets);
    expect(result).toHaveLength(2);
    expect(result[0].row).toBe(1);
    expect(result[1].row).toBe(1);
  });

  it('pushes overlapping widget down', () => {
    const widgets: SpaceWidget[] = [
      { panelId: 'a', size: 'medium', col: 1, row: 1, colSpan: 6, rowSpan: 5 },
      { panelId: 'b', size: 'medium', col: 1, row: 1, colSpan: 6, rowSpan: 5 },
    ];
    const result = resolveCollisions(widgets);
    expect(result).toHaveLength(2);
    // One should stay at row 1, other pushed down
    const rows = result.map(w => w.row).sort();
    expect(rows[0]).toBe(1);
    expect(rows[1]).toBeGreaterThan(1);
  });

  it('handles single widget', () => {
    const widgets: SpaceWidget[] = [
      { panelId: 'a', size: 'compact', col: 1, row: 1, colSpan: 3, rowSpan: 4 },
    ];
    const result = resolveCollisions(widgets);
    expect(result).toHaveLength(1);
    expect(result[0].row).toBe(1);
  });

  it('handles empty list', () => {
    expect(resolveCollisions([])).toEqual([]);
  });
});

describe('compactLayout', () => {
  it('compacts widgets upward to fill gaps', () => {
    const widgets: SpaceWidget[] = [
      { panelId: 'a', size: 'medium', col: 1, row: 5, colSpan: 6, rowSpan: 3 },
    ];
    const result = compactLayout(widgets);
    expect(result[0].row).toBe(1);
  });

  it('does not move widgets that would overlap', () => {
    const widgets: SpaceWidget[] = [
      { panelId: 'a', size: 'medium', col: 1, row: 1, colSpan: 6, rowSpan: 5 },
      { panelId: 'b', size: 'medium', col: 1, row: 10, colSpan: 6, rowSpan: 5 },
    ];
    const result = compactLayout(widgets);
    // b should compact to row 6 (right after a ends)
    const bWidget = result.find(w => w.panelId === 'b')!;
    expect(bWidget.row).toBeLessThanOrEqual(6);
    expect(bWidget.row).toBeGreaterThanOrEqual(1);
  });

  it('handles empty list', () => {
    expect(compactLayout([])).toEqual([]);
  });
});

describe('addWidgetToSpace', () => {
  it('packs widget into first available spot', async () => {
    const storageModule = await import('./storage.ts');
    vi.mocked(storageModule.get).mockReturnValue([
      {
        id: 'test-space',
        name: 'Test',
        icon: 'T',
        widgets: [
          { panelId: 'a', size: 'medium', col: 1, row: 1, colSpan: 6, rowSpan: 5 },
        ],
      },
    ]);

    addWidgetToSpace('test-space', 'b', 'medium');

    expect(storageModule.set).toHaveBeenCalled();
    const calls = vi.mocked(storageModule.set).mock.calls;
    const lastCall = calls[calls.length - 1];
    const savedSpaces = lastCall[1] as { widgets: SpaceWidget[] }[];
    const newWidget = savedSpaces[0].widgets.find((w: SpaceWidget) => w.panelId === 'b');
    expect(newWidget).toBeDefined();
    expect(newWidget!.colSpan).toBe(6);
  });

  it('does not add duplicate widget', async () => {
    const storageModule = await import('./storage.ts');
    vi.mocked(storageModule.get).mockReturnValue([
      {
        id: 'test-space',
        name: 'Test',
        icon: 'T',
        widgets: [
          { panelId: 'a', size: 'medium', col: 1, row: 1, colSpan: 6, rowSpan: 5 },
        ],
      },
    ]);

    addWidgetToSpace('test-space', 'a', 'medium');

    // Only getSpaces calls set (for migrations), addWidget should not add a second 'a'
    const calls = vi.mocked(storageModule.set).mock.calls;
    if (calls.length > 0) {
      const lastSaved = calls[calls.length - 1][1] as { widgets: SpaceWidget[] }[];
      const space = lastSaved[0];
      const aCount = space.widgets.filter((w: SpaceWidget) => w.panelId === 'a').length;
      expect(aCount).toBe(1);
    }
  });
});

describe('updateWidgetPlacement', () => {
  it('updates position and resolves collisions', async () => {
    const storageModule = await import('./storage.ts');
    vi.mocked(storageModule.get).mockReturnValue([
      {
        id: 'test-space',
        name: 'Test',
        icon: 'T',
        widgets: [
          { panelId: 'a', size: 'medium', col: 1, row: 1, colSpan: 6, rowSpan: 5 },
          { panelId: 'b', size: 'medium', col: 7, row: 1, colSpan: 6, rowSpan: 5 },
        ],
      },
    ]);

    updateWidgetPlacement('test-space', 'a', { col: 7, row: 1 });

    expect(storageModule.set).toHaveBeenCalled();
    const calls = vi.mocked(storageModule.set).mock.calls;
    const lastCall = calls[calls.length - 1];
    const savedSpaces = lastCall[1] as { widgets: SpaceWidget[] }[];
    const widgets = savedSpaces[0].widgets;
    // After collision resolution, no two widgets should overlap
    for (let i = 0; i < widgets.length; i++) {
      for (let j = i + 1; j < widgets.length; j++) {
        const a = widgets[i];
        const b = widgets[j];
        const overlaps = a.col < b.col + b.colSpan && a.col + a.colSpan > b.col &&
                         a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe('getSpaces', () => {
  it('returns default spaces when storage is empty', async () => {
    const storageModule = await import('./storage.ts');
    vi.mocked(storageModule.get).mockReturnValue(null);
    const spaces = getSpaces();
    expect(spaces.length).toBeGreaterThanOrEqual(4);
    expect(spaces.some(s => s.id === 'overview')).toBe(true);
  });

  it('widget at grid edge does not exceed 12 columns', () => {
    const spaces = getSpaces();
    for (const space of spaces) {
      for (const widget of space.widgets) {
        expect(widget.col + widget.colSpan - 1).toBeLessThanOrEqual(12);
      }
    }
  });
});
