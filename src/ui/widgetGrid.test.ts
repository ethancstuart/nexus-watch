import { describe, it, expect } from 'vitest';

// Test the pure utility logic from spaces.ts that widgetGrid depends on
import { colSpanToSize, resolveCollisions, compactLayout } from '../services/spaces.ts';
import type { SpaceWidget } from '../types/index.ts';

describe('colSpanToSize mapping', () => {
  it('returns compact for 1-4 cols', () => {
    expect(colSpanToSize(1)).toBe('compact');
    expect(colSpanToSize(2)).toBe('compact');
    expect(colSpanToSize(3)).toBe('compact');
    expect(colSpanToSize(4)).toBe('compact');
  });

  it('returns medium for 5-8 cols', () => {
    expect(colSpanToSize(5)).toBe('medium');
    expect(colSpanToSize(6)).toBe('medium');
    expect(colSpanToSize(7)).toBe('medium');
    expect(colSpanToSize(8)).toBe('medium');
  });

  it('returns large for 9+ cols', () => {
    expect(colSpanToSize(9)).toBe('large');
    expect(colSpanToSize(10)).toBe('large');
    expect(colSpanToSize(11)).toBe('large');
    expect(colSpanToSize(12)).toBe('large');
  });
});

describe('resolveCollisions for grid', () => {
  it('side-by-side widgets stay in place', () => {
    const widgets: SpaceWidget[] = [
      { panelId: 'weather', size: 'medium', col: 1, row: 1, colSpan: 4, rowSpan: 5 },
      { panelId: 'stocks', size: 'medium', col: 5, row: 1, colSpan: 4, rowSpan: 5 },
      { panelId: 'crypto', size: 'medium', col: 9, row: 1, colSpan: 4, rowSpan: 5 },
    ];
    const result = resolveCollisions(widgets);
    // All should remain at row 1
    for (const w of result) {
      expect(w.row).toBe(1);
    }
  });

  it('stacked widgets on same col push down', () => {
    const widgets: SpaceWidget[] = [
      { panelId: 'a', size: 'large', col: 1, row: 1, colSpan: 12, rowSpan: 5 },
      { panelId: 'b', size: 'large', col: 1, row: 1, colSpan: 12, rowSpan: 5 },
    ];
    const result = resolveCollisions(widgets);
    const rows = result.map((w) => w.row).sort((a, b) => a - b);
    expect(rows[0]).toBe(1);
    expect(rows[1]).toBe(6); // pushed below first widget
  });
});

describe('compactLayout for grid', () => {
  it('compacts a lone widget to row 1', () => {
    const widgets: SpaceWidget[] = [{ panelId: 'a', size: 'compact', col: 5, row: 20, colSpan: 3, rowSpan: 4 }];
    const result = compactLayout(widgets);
    expect(result[0].row).toBe(1);
    expect(result[0].col).toBe(5); // col unchanged
  });

  it('preserves correct stacking order', () => {
    const widgets: SpaceWidget[] = [
      { panelId: 'a', size: 'large', col: 1, row: 1, colSpan: 12, rowSpan: 5 },
      { panelId: 'b', size: 'large', col: 1, row: 20, colSpan: 12, rowSpan: 5 },
    ];
    const result = compactLayout(widgets);
    const a = result.find((w) => w.panelId === 'a')!;
    const b = result.find((w) => w.panelId === 'b')!;
    expect(a.row).toBe(1);
    expect(b.row).toBeLessThanOrEqual(6);
    // No overlap
    expect(b.row >= a.row + a.rowSpan).toBe(true);
  });
});
