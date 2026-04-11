import { createElement } from '../utils/dom.ts';

const STORAGE_KEY = 'nw:onboarded';

/**
 * Minimal onboarding — non-blocking tooltip instead of a modal wall.
 * The product should sell itself. This just orients the user.
 */
export function showOnboarding(container: HTMLElement): void {
  if (localStorage.getItem(STORAGE_KEY)) return;

  // Don't block the map — wait until it's loaded and layers are visible
  setTimeout(() => {
    const tooltip = createElement('div', { className: 'nw-welcome-tooltip' });
    tooltip.innerHTML = `
      <div class="nw-welcome-header">
        <span class="nw-welcome-badge">WELCOME TO NEXUSWATCH</span>
        <button class="nw-welcome-close" title="Dismiss">✕</button>
      </div>
      <div class="nw-welcome-body">
        <p>You're looking at a live geopolitical intelligence feed. Here's how to explore:</p>
        <div class="nw-welcome-tips">
          <div class="nw-welcome-tip"><span class="nw-welcome-key">THEATERS</span> Jump to regions — Middle East, Indo-Pacific, Energy Chokepoints</div>
          <div class="nw-welcome-tip"><span class="nw-welcome-key">CINEMA</span> Watch an auto-guided threat tour with AI narration</div>
          <div class="nw-welcome-tip"><span class="nw-welcome-key">ALERTS</span> Create natural language monitoring rules</div>
          <div class="nw-welcome-tip"><span class="nw-welcome-key">MORE ▾</span> Entity graph, crisis replay, split view, investigations</div>
          <div class="nw-welcome-tip"><span class="nw-welcome-key">?</span> Keyboard shortcuts</div>
        </div>
      </div>
    `;

    tooltip.querySelector('.nw-welcome-close')?.addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEY, '1');
      tooltip.classList.add('nw-welcome-exit');
      setTimeout(() => tooltip.remove(), 300);
    });

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
      if (tooltip.parentElement) {
        localStorage.setItem(STORAGE_KEY, '1');
        tooltip.classList.add('nw-welcome-exit');
        setTimeout(() => tooltip.remove(), 300);
      }
    }, 15000);

    container.appendChild(tooltip);
  }, 3000); // Wait 3 seconds for map to load
}
