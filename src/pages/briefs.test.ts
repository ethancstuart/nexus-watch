import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderBriefs } from './briefs.ts';

/**
 * The /briefs archive: each card titled with the day's subject, previewed in
 * plain words, under a nav with no repeated link, on the register palette.
 * Synthetic archive response; fetch is stubbed.
 */

const ARCHIVE = {
  briefs: [
    {
      date: '2026-11-15',
      subject: 'Twelve calls settled, four hit',
      preview: "TODAY'S CALL Today's Call The Ledger — 12 resolved today, 4 hit…",
    },
    { date: '2026-11-14', subject: null, preview: 'The Ledger — 9 resolved today, 2 hit' },
  ],
  count: 2,
};

async function render(): Promise<HTMLElement> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(ARCHIVE), { status: 200 }))),
  );
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderBriefs(root);
  await vi.waitFor(() => {
    if (!root.querySelector('.dossier-card')) throw new Error('cards not rendered yet');
  });
  return root;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.textContent = '';
});

describe('/briefs archive', () => {
  it("titles each card with the day's subject, falling back to the date", async () => {
    const root = await render();
    const heads = [...root.querySelectorAll('.dossier-card-headline')].map((h) => h.textContent);
    expect(heads).toEqual(['Twelve calls settled, four hit', 'Situation Brief · 2026-11-14']);
  });

  it('previews in plain words, never markup', async () => {
    const root = await render();
    const previews = [...root.querySelectorAll('.dossier-card-preview')];
    expect(previews).toHaveLength(2);
    expect(previews[0].textContent).toBe(ARCHIVE.briefs[0].preview);
    for (const p of previews) {
      expect(p.innerHTML).not.toMatch(/&lt;|&amp;quot;|style=/);
      expect(p.children).toHaveLength(0);
    }
  });

  it('lists each nav destination once', async () => {
    const root = await render();
    const hrefs = [...root.querySelectorAll('.dossier-nav-links a')].map((a) => a.getAttribute('href'));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('opts into the register palette, not the dossier', async () => {
    const root = await render();
    expect(root.querySelector('.briefs-dossier')?.classList.contains('briefs-register')).toBe(true);
  });
});
