import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderBrief, renderBriefs } from './briefs.ts';

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

/**
 * Correction notes in the SPA. The page never holds a note itself: it shows one
 * only when the server's JSON carries it, which the server does only for a
 * note the owner approved (api/_lib/corrections.ts). Synthetic responses.
 */
describe('correction notes in the SPA', () => {
  async function renderArchive(briefs: unknown[]): Promise<HTMLElement> {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ briefs, count: briefs.length }), { status: 200 }))),
    );
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderBriefs(root);
    await vi.waitFor(() => {
      if (!root.querySelector('.dossier-card')) throw new Error('cards not rendered yet');
    });
    return root;
  }

  async function renderOne(response: Record<string, unknown>): Promise<HTMLElement> {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(response), { status: 200 }))),
    );
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderBrief(root, String(response.brief_date));
    await vi.waitFor(() => {
      if (!root.querySelector('.dossier-body')) throw new Error('brief not rendered yet');
    });
    return root;
  }

  const ROW = {
    brief_date: '2026-09-08',
    summary: null,
    content: { briefText: '## Good Morning\n\nSynthetic text & <b>bold</b>.' },
    generated_at: null,
  };
  const NOTE = `Correction added 1 Dec 2026. This edition contained false statements. On 8 Sep 2026 we wrote “x <script>y</script>”.`;

  it('marks only the archive cards the server marks', async () => {
    const root = await renderArchive([
      { date: '2026-09-09', subject: 'Plain', preview: 'p' },
      { date: '2026-09-08', subject: 'Corrected one', preview: 'p', correctedOn: '2026-12-01' },
      { date: '2026-09-07', subject: 'Bad marker', preview: 'p', correctedOn: '<b>soon</b>' },
    ]);
    const marks = [...root.querySelectorAll('.dossier-card')].map(
      (c) => c.querySelector('.dossier-card-corrected')?.textContent ?? null,
    );
    expect(marks).toEqual([null, 'Correction added 1 Dec 2026.', null]);
  });

  it('shows no block for a brief the server sends without a correction', async () => {
    const root = await renderOne(ROW);
    expect(root.querySelector('.dossier-correction')).toBeNull();
    expect(root.textContent).not.toMatch(/Correction|All corrections/);
  });

  it('shows the note above the brief, escaped, linking to the corrections page', async () => {
    const root = await renderOne({
      ...ROW,
      correction: { correctedOn: '2026-12-01', classification: 'false', note: NOTE },
    });
    const block = root.querySelector('.dossier-correction');
    expect(block).not.toBeNull();
    expect(root.querySelectorAll('.dossier-correction')).toHaveLength(1);
    expect(block?.querySelector('.dossier-kicker')?.textContent).toBe('Correction');
    expect(block?.querySelector('p')?.textContent).toBe(NOTE);
    expect(block?.querySelector('script')).toBeNull();
    const link = block?.querySelector('a');
    expect([link?.getAttribute('href'), link?.textContent]).toEqual(['/corrections', 'All corrections']);
    const body = root.querySelector('.dossier-body');
    expect(block && body && block.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block?.hasAttribute('style')).toBe(false);
  });

  it('the byline under a note claims no checking: past editions were not checked against their data', async () => {
    for (const response of [
      ROW,
      { ...ROW, correction: { correctedOn: '2026-12-01', classification: 'false', note: NOTE } },
    ]) {
      document.body.textContent = '';
      const root = await renderOne(response);
      const byline = root.querySelector('.dossier-byline');
      expect(byline?.textContent?.trim().split('\n')[0].trim()).toBe(
        "Written by a model from the day's collected data.",
      );
      expect(root.textContent).not.toMatch(/checked against/i);
    }
  });

  it('leaves the brief body exactly as it renders without a note', async () => {
    const plain = (await renderOne(ROW)).querySelector('.dossier-body')?.innerHTML;
    document.body.textContent = '';
    const corrected = (
      await renderOne({ ...ROW, correction: { correctedOn: '2026-12-01', classification: 'false', note: NOTE } })
    ).querySelector('.dossier-body')?.innerHTML;
    expect(plain).toBeTruthy();
    expect(corrected).toBe(plain);
  });

  it('fails closed on a malformed correction', async () => {
    for (const correction of [
      { correctedOn: 'yesterday', note: NOTE },
      { correctedOn: '2026-12-01', note: '' },
      { correctedOn: '2026-12-01' },
      'Correction added',
    ]) {
      document.body.textContent = '';
      const root = await renderOne({ ...ROW, correction });
      expect(root.querySelector('.dossier-correction')).toBeNull();
    }
  });
});

/**
 * The record-only (mechanical) edition on the SPA's single-brief page (plan R1).
 * Its byline cannot say a model wrote it, and its own-site links render as
 * links. A model edition is exactly as before. Synthetic rows; fetch is stubbed.
 */
describe('a mechanical edition in the SPA', () => {
  async function renderOne(response: Record<string, unknown>): Promise<HTMLElement> {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(response), { status: 200 }))),
    );
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderBrief(root, String(response.brief_date));
    await vi.waitFor(() => {
      if (!root.querySelector('.dossier-body')) throw new Error('brief not rendered yet');
    });
    return root;
  }

  const TEXT =
    '## 🏁 What resolved today\n\n- UG (UG): MISS — we said 40%. [Call #7001](https://nexuswatch.dev/call/7001)\n\n' +
    '## 📝 About this edition\n\nCorrections are listed on [the corrections page](https://nexuswatch.dev/corrections).\n';
  const row = (edition?: string) => ({
    brief_date: '2026-11-27',
    summary: null,
    content: { briefText: TEXT, ...(edition ? { edition } : {}) },
    generated_at: null,
  });

  it('says no model wrote it, and names no source it did not use', async () => {
    const root = await renderOne(row('mechanical'));
    const byline = root.querySelector('.dossier-byline')?.textContent ?? '';
    expect(byline).toContain("Mechanical edition: assembled by code from the ledger's own entries. No model wrote it.");
    expect(byline).not.toMatch(/Written by a model|USGS|Wikipedia/);
    expect(root.querySelector('.dossier-byline a')?.getAttribute('href')).toBe('#/methodology');
  });

  it('renders its own-site links as links', async () => {
    const root = await renderOne(row('mechanical'));
    const links = [...root.querySelectorAll('.dossier-body a')].map((a) => [a.getAttribute('href'), a.textContent]);
    expect(links).toEqual([
      ['https://nexuswatch.dev/call/7001', 'Call #7001'],
      ['https://nexuswatch.dev/corrections', 'the corrections page'],
    ]);
    expect(root.querySelector('.dossier-body')?.textContent).not.toContain('](');
  });

  it('a model edition (or a row with no edition) keeps its byline and renders no links', async () => {
    for (const edition of [undefined, 'model', 'MECHANICAL']) {
      document.body.textContent = '';
      const root = await renderOne(row(edition));
      expect(root.querySelector('.dossier-byline')?.textContent).toContain(
        "Written by a model from the day's collected data.",
      );
      expect(root.querySelectorAll('.dossier-body a')).toHaveLength(0);
    }
  });
});
