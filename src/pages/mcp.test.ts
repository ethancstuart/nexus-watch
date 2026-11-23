import { describe, it, expect } from 'vitest';
import { TOOLS } from '../../api/mcp.ts';
import { renderMcpPage } from './mcp.ts';
import { PAGE_SEO } from '../utils/seo.ts';

/**
 * The /mcp page said "nine tools" (scenarios, portfolio exposure) for the three
 * that are left. Every statement here is compared with the TOOLS array the
 * endpoint itself returns, so a change to the tool list cannot leave the words
 * behind. The endpoint's own description is checked in api/mcp.test.ts.
 */

describe('/mcp page matches the tools the endpoint returns', () => {
  const root = document.createElement('div');
  renderMcpPage(root);
  const text = (root.textContent ?? '').replace(/\s+/g, ' ');

  it('shows exactly the endpoint tools, by name', () => {
    const shown = Array.from(root.querySelectorAll('.nw-mcp-tool-name')).map((e) => e.textContent);
    expect(shown).toEqual(TOOLS.map((t) => t.name));
  });

  it('does not state a count other than the real one', () => {
    const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const real = words[TOOLS.length - 1]!;
    for (const w of words) {
      if (w === real) continue;
      expect(text).not.toMatch(new RegExp(`\\b${w} (geopolitical )?(intelligence )?tools\\b`, 'i'));
    }
    expect(text).toMatch(new RegExp(`\\b${real} (geopolitical )?(intelligence )?tools\\b`, 'i'));
  });

  it('does not describe retired tools or give examples that need them', () => {
    expect(text).not.toMatch(/scenario|portfolio/i);
  });
});

describe('search-snippet description for /mcp', () => {
  it('does not describe retired tools', () => {
    expect(PAGE_SEO.mcp.description).not.toMatch(/scenario|portfolio|\b9\b|nine/i);
  });
});
