import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../services/tier.ts', () => ({
  hasAccess: vi.fn(() => true),
}));

vi.mock('../services/analytics.ts', () => ({
  trackPanelView: vi.fn(),
}));

import { Panel } from './Panel.ts';

// Concrete test subclass
class TestPanel extends Panel {
  lastRenderData: unknown = null;
  fetchCount = 0;

  constructor() {
    super({
      id: 'test',
      title: 'Test Panel',
      enabled: true,
      refreshInterval: 0,
      priority: 1,
      category: 'utility',
    });
  }

  async fetchData(): Promise<void> {
    this.fetchCount++;
    this.render({ value: 42 });
  }

  render(data: unknown): void {
    this.lastRenderData = data;
    this.contentEl.textContent = JSON.stringify(data);
  }

  getLastData(): unknown {
    return this.lastRenderData;
  }
}

let panel: TestPanel;

beforeEach(() => {
  panel = new TestPanel();
});

describe('Panel base class', () => {
  describe('showError', () => {
    it('displays error message and retry button', () => {
      panel.showError('Something went wrong');

      const errorEl = panel.container.querySelector('.panel-error')! as HTMLElement;
      expect(errorEl.style.display).not.toBe('none');
      expect(errorEl.textContent).toContain('Something went wrong');

      const retryBtn = errorEl.querySelector('.panel-retry-btn');
      expect(retryBtn).not.toBeNull();
      expect(retryBtn!.textContent).toBe('Retry');
    });

    it('hides content when showing error', () => {
      panel.showError('fail');
      const contentEl = panel.container.querySelector('.panel-content')! as HTMLElement;
      expect(contentEl.style.display).toBe('none');
    });
  });

  describe('showLoading', () => {
    it('creates loading dot element', () => {
      panel.showLoading();

      const contentEl = panel.container.querySelector('.panel-content')!;
      const loadingDot = contentEl.querySelector('.panel-loading-dot');
      expect(loadingDot).not.toBeNull();
    });

    it('hides error when showing loading', () => {
      panel.showError('fail');
      panel.showLoading();

      const errorEl = panel.container.querySelector('.panel-error')! as HTMLElement;
      expect(errorEl.style.display).toBe('none');
    });
  });

  describe('setCollapsed', () => {
    it('toggles collapsed class', () => {
      expect(panel.container.classList.contains('panel-collapsed')).toBe(false);

      panel.setCollapsed(true);
      expect(panel.container.classList.contains('panel-collapsed')).toBe(true);
      expect(panel.collapsed).toBe(true);

      panel.setCollapsed(false);
      expect(panel.container.classList.contains('panel-collapsed')).toBe(false);
      expect(panel.collapsed).toBe(false);
    });

    it('updates ARIA attributes', () => {
      const collapseBtn = panel.container.querySelector('.panel-collapse-btn')!;

      panel.setCollapsed(true);
      expect(collapseBtn.getAttribute('aria-expanded')).toBe('false');
      expect(collapseBtn.getAttribute('aria-label')).toBe('Expand panel');

      panel.setCollapsed(false);
      expect(collapseBtn.getAttribute('aria-expanded')).toBe('true');
      expect(collapseBtn.getAttribute('aria-label')).toBe('Collapse panel');
    });
  });

  describe('renderAtSize', () => {
    it('calls render with last data', async () => {
      await panel.fetchData();
      expect(panel.lastRenderData).toEqual({ value: 42 });

      // renderAtSize should re-render with the data from getLastData()
      const renderCallCount = panel.fetchCount;
      panel.renderAtSize('compact');
      // render was called (lastRenderData still equals the last data)
      expect(panel.lastRenderData).toEqual({ value: 42 });
      // fetchData was NOT called again
      expect(panel.fetchCount).toBe(renderCallCount);
    });

    it('does nothing if no data available', () => {
      panel.renderAtSize('medium');
      expect(panel.lastRenderData).toBeNull();
    });
  });

  describe('container structure', () => {
    it('has correct data attributes', () => {
      expect(panel.container.dataset.panelId).toBe('test');
      expect(panel.container.dataset.category).toBe('utility');
    });

    it('has ARIA attributes', () => {
      expect(panel.container.getAttribute('role')).toBe('region');
      expect(panel.container.getAttribute('aria-labelledby')).toBe('panel-title-test');
    });

    it('has header with title', () => {
      const title = panel.container.querySelector('.panel-title');
      expect(title).not.toBeNull();
      expect(title!.textContent).toBe('Test Panel');
    });
  });
});
