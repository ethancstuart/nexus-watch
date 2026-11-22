import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMethodology } from './methodology.ts';
import { renderBrief } from './briefs.ts';
import { renderLanding } from './landing.ts';

/**
 * The SUBSCRIBE links on /briefs/<date> and /methodology pointed at
 * https://brief.nexuswatch.dev, a CNAME to beehiiv that answered HTTP 403 when
 * the lead checked it on 2026-11-22. A reader who clicked SUBSCRIBE was
 * refused. They now land on the site's own sign-up, the Subscribe section of
 * the landing page (`/#subscribe`), whose form posts to /api/subscribe.
 * Hermetic: fetch is stubbed; nothing leaves the process.
 */

// Raw source, via Vite, so this file needs no Node types.
const sources = import.meta.glob<string>(
  ['../**/*.ts', '!../**/*.test.ts', '../../api/**/*.ts', '!../../api/**/*.test.ts', '../../index.html'],
  { query: '?raw', import: 'default', eager: true },
);

function subscribeLinks(root: HTMLElement): HTMLAnchorElement[] {
  return [...root.querySelectorAll('a')].filter((a) => /subscribe/i.test(a.textContent ?? ''));
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 503 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  document.body.textContent = '';
});

describe('SUBSCRIBE goes to the site’s own sign-up', () => {
  it.each([
    ['/methodology', (root: HTMLElement) => renderMethodology(root)],
    ['/briefs/<date>', (root: HTMLElement) => renderBrief(root, '2026-11-20')],
  ])('%s: the nav link is /#subscribe, in the same tab', (_, render) => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(root);
    const links = subscribeLinks(root).filter((a) => a.textContent?.trim() === 'SUBSCRIBE');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/#subscribe');
    expect(links[0].hasAttribute('target')).toBe(false);
  });

  it('no shipped source links to brief.nexuswatch.dev', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    const offenders = Object.entries(sources)
      .filter(([, code]) => /brief\.nexuswatch\.dev/i.test(code))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });
});

describe('the landing page receives /#subscribe', () => {
  function render(): HTMLElement {
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderLanding(root);
    return root;
  }

  it('the Subscribe section is #subscribe and holds the form that posts to /api/subscribe', () => {
    const section = render().querySelector('#subscribe');
    expect(section?.getAttribute('aria-label')).toBe('Newsletter');
    expect(section?.querySelector('form#nw-subscribe-form input[type=email]')).not.toBeNull();
  });

  it('arriving at /#subscribe scrolls to that section once it is drawn, and shows it', () => {
    window.history.replaceState(null, '', '/#subscribe');
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const root = render();
    expect(scroll).toHaveBeenCalledTimes(1);
    const target = scroll.mock.contexts[0] as Element;
    expect(target).toBe(root.querySelector('#subscribe'));
    expect(target.classList.contains('is-revealed')).toBe(true);
  });

  it('arriving at / scrolls nowhere', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    render();
    expect(scroll).not.toHaveBeenCalled();
  });
});
