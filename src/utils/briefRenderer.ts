/**
 * Shared markdown → Light Intel Dossier HTML renderer.
 *
 * Single source of truth for the browser-side rendering of Sonnet's
 * markdown brief output. Both the archive page (src/pages/briefs.ts)
 * and the in-map panel (src/ui/briefPanel.ts) use this so they render
 * sections, Why-it-matters callouts, numbered stories, and inline
 * emphasis identically.
 *
 * Mirror of the email-side renderer in `api/cron/daily-brief.ts`
 * (renderDossierInner / renderSectionBody). The two MUST stay
 * aesthetically locked — same sections, same callout treatment,
 * same list handling. The email uses inline styles because email
 * clients strip <style> tags; this browser variant uses CSS classes
 * consumed by src/styles/briefs-dossier.css.
 *
 * If you add a new markdown construct to the Sonnet prompt (e.g., a
 * new callout type), update BOTH renderers in the same commit, or
 * the archive/panel will drift from the email.
 */

export interface BriefSection {
  emoji: string;
  title: string;
  body: string;
}

/**
 * HTML-escape characters that would break element bodies or attributes.
 * Never call this on HTML you intend to render as markup — it's for
 * untrusted text going into element content.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] || c;
  });
}

/**
 * Inline markdown rendering — handles **bold** and *italic* runs.
 * Escapes first, then reintroduces markup, so raw text with angle
 * brackets or quotes can't escape into the DOM.
 */
export function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}

/**
 * Split brief markdown into addressable sections on `## <emoji> <title>`
 * boundaries. Each returned section has:
 *   - `emoji`: everything up to the first space on the header line
 *   - `title`: the rest of the header line
 *   - `body`:  everything between this header and the next `## `
 */
export function parseSections(markdown: string): BriefSection[] {
  const fragments = markdown.split(/\n?^## /m).filter(Boolean);
  const sections: BriefSection[] = [];
  for (const frag of fragments) {
    const nl = frag.indexOf('\n');
    const headerLine = nl === -1 ? frag : frag.slice(0, nl);
    const body = nl === -1 ? '' : frag.slice(nl + 1).trim();
    const space = headerLine.indexOf(' ');
    sections.push({
      emoji: space === -1 ? '' : headerLine.slice(0, space).trim(),
      title: (space === -1 ? headerLine : headerLine.slice(space + 1)).trim(),
      body,
    });
  }
  return sections;
}

/**
 * Render a section body from Sonnet markdown into dossier-styled HTML.
 * Handles the subset of markdown the prompt actually emits:
 *   - **Why it matters**-prefixed paragraphs → oxblood callout blocks
 *   - `1.`-prefixed paragraphs → numbered story rows
 *   - `- ` or `* ` lines → bullet lists
 *   - everything else → plain paragraphs
 *
 * Caller-supplied `classPrefix` keeps the emitted class names consistent
 * with whichever CSS consumes them (e.g., `dossier-` for the archive,
 * `nw-brief-panel-` for the map overlay).
 */
export function renderBlocks(body: string, classPrefix = 'dossier'): string {
  const blocks = body.split(/\n\s*\n/);
  const out: string[] = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    const numberedMatch = block.match(/^(\d+)\.\s+(.*)$/s);
    if (numberedMatch) {
      out.push(`<p><strong>${numberedMatch[1]}.</strong> ${renderInline(numberedMatch[2])}</p>`);
      continue;
    }

    if (/^[-*]\s/.test(block)) {
      const items = block
        .split(/\n/)
        .filter((l) => /^[-*]\s/.test(l.trim()))
        .map((l) => l.trim().replace(/^[-*]\s+/, ''));
      out.push(`<ul>${items.map((i) => `<li>${renderInline(i)}</li>`).join('')}</ul>`);
      continue;
    }

    const whyMatch = block.match(/^\*\*Why it matters[:\s*]+\*\*\s*(.*)$/is);
    if (whyMatch) {
      out.push(
        `<div class="${classPrefix}-callout">` +
          `<span class="${classPrefix}-callout-label">Why it matters</span>` +
          `<p>${renderInline(whyMatch[1])}</p>` +
          `</div>`,
      );
      continue;
    }

    out.push(`<p>${renderInline(block)}</p>`);
  }
  return out.join('\n');
}

export interface RenderBriefBodyOptions {
  /** Brief date in YYYY-MM-DD form, used to build the Map of the Day image URL. */
  dateForImage: string;
  /** CSS class prefix for callouts and inner elements. Defaults to `dossier`. */
  classPrefix?: string;
  /**
   * Optional className applied to the <img> element that renders the Map of
   * the Day screenshot. Defaults to `dossier-map-image`. Pass a different
   * class to override spacing/sizing for compact surfaces like the map
   * overlay panel.
   */
  mapImageClass?: string;
  /**
   * Whether to emit <section> wrappers. The archive page renders a full
   * document with <section>s; the in-map panel renders inside an existing
   * container and wants the sections as plain <div>s with the same classes.
   */
  wrapWithSection?: boolean;
}

/**
 * Render full brief markdown into dossier HTML. Adds a Map of the Day
 * image immediately after the Map of the Day section header so the image
 * leads the section, caption follows.
 */
export function renderBriefBody(briefText: string, opts: RenderBriefBodyOptions): string {
  const classPrefix = opts.classPrefix ?? 'dossier';
  const mapClass = opts.mapImageClass ?? 'dossier-map-image';
  const Tag = opts.wrapWithSection === false ? 'div' : 'section';

  const sections = parseSections(briefText);
  if (sections.length === 0) {
    // Non-markdown input (legacy HTML summary) — pass through unchanged.
    return briefText;
  }

  return sections
    .map((section) => {
      const isMapOfTheDay = /map of the day/i.test(section.title);
      const img = isMapOfTheDay
        ? `<img class="${mapClass}" src="/api/brief/screenshot?date=${encodeURIComponent(opts.dateForImage)}&size=email" alt="Map of the Day — ${escapeHtml(opts.dateForImage)}" loading="lazy" />`
        : '';
      const heading = `${section.emoji ? escapeHtml(section.emoji) + ' ' : ''}${escapeHtml(section.title)}`;
      return `<${Tag}>
  <h2>${heading}</h2>
  ${img}
  ${renderBlocks(section.body, classPrefix)}
</${Tag}>`;
    })
    .join('\n');
}
