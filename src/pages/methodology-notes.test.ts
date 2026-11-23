import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderMethodology, renderMethodNotes } from './methodology.ts';
import { methodologyPayload } from '../../api/_lib/call-notes.ts';
import type { ApprovedPageNote } from '../../api/_lib/call-note-words.ts';

/**
 * /methodology shows the dated method notes the server approved
 * (api/method-notes.ts), after "How the Ledger forecasts", as text. It shows
 * nothing when there are none, when the request fails, or when the page is not
 * in the document. The payload is built by the server's own function from a
 * synthetic approved note, so the two ends are tested against each other.
 */

const NOTE: ApprovedPageNote = {
  id: 'm',
  status: 'approved',
  issuedOn: '2026-11-23',
  heading: 'How a currency threshold is set, and what it does to the score',
  paragraphs: ['A first paragraph.', 'A second.'],
};

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function stubFetch(impl: () => Promise<unknown>) {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
}

async function render(): Promise<{ root: HTMLElement; text: string }> {
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderMethodology(root);
  await flush();
  return { root, text: (root.textContent ?? '').replace(/\s+/g, ' ') };
}

afterEach(() => {
  document.body.textContent = '';
  vi.unstubAllGlobals();
});

describe('/methodology dated notes', () => {
  it('renders an approved section after "How the Ledger forecasts", before "When a call cannot be resolved"', async () => {
    const f = stubFetch(async () => ({ ok: true, json: async () => ({ notes: methodologyPayload([NOTE]) }) }));
    const { root, text } = await render();
    expect(f).toHaveBeenCalledWith('/api/method-notes');
    const box = root.querySelector('#method-notes') as HTMLElement;
    expect(box.querySelector('h2')?.textContent).toBe(NOTE.heading);
    expect([...box.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'Added 23 Nov 2026. A first paragraph.',
      'A second.',
    ]);
    const at = (s: string) => text.indexOf(s);
    expect(at('How the Ledger forecasts')).toBeLessThan(at(NOTE.heading));
    expect(at(NOTE.heading)).toBeLessThan(at('When a call cannot be resolved'));
  });

  it('none approved, a failed request, or an error status: nothing', async () => {
    for (const impl of [
      async () => ({ ok: true, json: async () => ({ notes: [] }) }),
      async () => {
        throw new Error('offline');
      },
      async () => ({ ok: false, json: async () => ({ notes: methodologyPayload([NOTE]) }) }),
      async () => ({ ok: true, json: async () => ({ unexpected: true }) }),
    ]) {
      stubFetch(impl);
      const { root } = await render();
      expect((root.querySelector('#method-notes') as HTMLElement).childNodes).toHaveLength(0);
      document.body.textContent = '';
    }
  });

  it('a page rendered off the document makes no request', () => {
    const f = stubFetch(async () => ({ ok: true, json: async () => ({ notes: [] }) }));
    renderMethodology(document.createElement('div'));
    expect(f).not.toHaveBeenCalledWith('/api/method-notes');
  });

  it('renders text, never markup', () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const box = document.createElement('div');
    renderMethodNotes(box, { notes: [{ heading: hostile, added_on: '2026-11-23', paragraphs: [hostile] }] });
    expect(box.querySelector('img, script')).toBeNull();
    expect(box.querySelector('h2')?.textContent).toBe(hostile);
    expect(box.querySelector('p')?.textContent).toBe(hostile);
  });
});
