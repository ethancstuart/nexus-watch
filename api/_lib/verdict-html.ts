import { esc } from './ssr-shell.js';
import type { Verdict } from './verdict-words.js';

/**
 * The verdict as server-rendered HTML: the page's existing `.lede` paragraph,
 * its dateline in bold, and at most one link, to /corrections. Every piece is
 * escaped here, where it is rendered, whatever produced it.
 */
export function verdictHtml(v: Verdict): string {
  const corrections = v.corrections
    ? ` ${esc(v.corrections.before)}<a href="${esc(v.corrections.href)}">${esc(v.corrections.link)}</a>` +
      esc(v.corrections.after)
    : '';
  return `<p class="lede" id="verdict"><strong>${esc(v.dateline)}</strong> ${esc(v.body)}${corrections}</p>`;
}
