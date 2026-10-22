/**
 * In-Map Daily Brief Panel — Track B.2 (dossier migration).
 *
 * Overlay invoked via the "BRIEF" button in the map topbar. Renders
 * today's daily brief in a Light Intel Dossier reading surface
 * alongside the live map, so users can "read while they explore"
 * per the Apr 10 Decision 29 v5 plan.
 *
 * Pre-B.2 this panel showed a hardcoded "EXECUTIVE SUMMARY" block
 * with a typed `content.topRiskCountries: {countryName, score}` that
 * did not match the real BriefData shape (which uses `name`, not
 * `countryName`), so country names always rendered empty. It also
 * referenced non-existent `diseaseOutbreaks` and `internetOutages`
 * fields and always showed "—" for metrics. This rewrite:
 *
 *   1. Uses the real BriefData shape stored in `daily_briefs.content`
 *      ({ ...briefData, briefText }) — countries have real names,
 *      earthquake counts populate correctly.
 *   2. Renders Sonnet's markdown brief via the shared dossier
 *      renderer in src/utils/briefRenderer.ts, so the section
 *      layout (Good Morning → Top Stories → Why it matters callouts
 *      → Map of the Day → etc.) exactly matches the email + archive.
 *   3. Embeds the Map of the Day screenshot.
 *   4. Uses Light Intel Dossier palette (ivory bg, graphite text,
 *      oxblood accent, Tiempos headlines, Inter body) regardless of
 *      the currently active product theme — the brief is a reading
 *      surface, and its aesthetic is locked to dossier to match the
 *      email and /brief/:date archive.
 */

import { createElement } from '../utils/dom.ts';
import { fetchWithRetry } from '../utils/fetch.ts';
import { escapeHtml, renderBriefBody } from '../utils/briefRenderer.ts';
import { colors as dossierColors, fonts as dossierFonts } from '../styles/email-tokens.ts';

let overlay: HTMLElement | null = null;

interface CountryRisk {
  code?: string;
  name?: string;
  score?: number;
  prevScore?: number | null;
  components?: Record<string, number>;
}

interface BriefResponseContent {
  briefText?: string;
  topRiskCountries?: CountryRisk[];
  earthquakeCount?: number;
  diseaseCount?: number;
  totalCountries?: number;
}

interface BriefResponse {
  brief_date: string;
  summary: string | null;
  content: BriefResponseContent | string | null;
  generated_at: string | null;
}

function parseContent(raw: unknown): BriefResponseContent {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as BriefResponseContent;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as BriefResponseContent;
  return {};
}

// ---------------------------------------------------------------------------
// Panel scaffold
// ---------------------------------------------------------------------------

export function openBriefPanel(container: HTMLElement): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
    return;
  }

  overlay = createElement('div', { className: 'nw-brief-overlay briefs-dossier' });

  // Scope dossier palette to the overlay via inline CSS variables. This
  // ensures the panel uses the Light Intel Dossier look even when the
  // product is on the terminal theme (because the map behind the overlay
  // is still terminal).
  overlay.style.cssText = [
    `position: fixed`,
    `top: 0`,
    `left: 0`,
    `right: 0`,
    `bottom: 0`,
    `z-index: 9999`,
    `background: rgba(0, 0, 0, 0.55)`,
    `backdrop-filter: blur(2px)`,
    `display: flex`,
    `align-items: flex-start`,
    `justify-content: center`,
    `padding: 48px 24px`,
    `overflow-y: auto`,
    `font-family: ${dossierFonts.sans}`,
  ].join(';');

  overlay.innerHTML = `
    <div class="nw-brief-panel" style="${panelShellStyle()}">
      <div class="nw-brief-topbar" style="${topbarStyle()}">
        <div>
          <div class="nw-brief-kicker" style="${kickerStyle()}">SITUATION BRIEF</div>
          <div class="nw-brief-date" id="nw-brief-date" style="${dateStyle()}">Loading…</div>
        </div>
        <div class="nw-brief-actions" style="display: flex; gap: 8px;">
          <button type="button" class="nw-brief-export-btn" style="${buttonSecondaryStyle()}">Export PDF</button>
          <button type="button" class="nw-brief-close" aria-label="Close brief" style="${buttonCloseStyle()}">×</button>
        </div>
      </div>
      <div class="nw-brief-masthead" style="${mastheadStyle()}"></div>
      <div class="nw-brief-body" id="nw-brief-body" style="${bodyStyle()}">
        <div class="nw-brief-loading" style="${loadingStyle()}">Loading today's brief…</div>
      </div>
      <div class="nw-brief-footer-cta" style="${ctaStyle()}">
        <a href="#/briefs" style="${ctaLinkStyle()}">All briefs →</a>
        <a href="https://brief.nexuswatch.dev" target="_blank" rel="noopener" style="${ctaLinkPrimaryStyle()}">Subscribe to the Brief</a>
      </div>
    </div>
  `;

  container.appendChild(overlay);

  const panel = overlay.querySelector<HTMLElement>('.nw-brief-panel');
  const closeBtn = overlay.querySelector<HTMLButtonElement>('.nw-brief-close');
  const exportBtn = overlay.querySelector<HTMLButtonElement>('.nw-brief-export-btn');
  const body = overlay.querySelector<HTMLElement>('#nw-brief-body');
  const dateEl = overlay.querySelector<HTMLElement>('#nw-brief-date');

  closeBtn?.addEventListener('click', () => {
    overlay?.remove();
    overlay = null;
  });

  // Click outside the panel to close — the overlay has its own tinted
  // backdrop so taps there should dismiss.
  overlay.addEventListener('click', (e) => {
    if (panel && !panel.contains(e.target as Node)) {
      overlay?.remove();
      overlay = null;
    }
  });

  exportBtn?.addEventListener('click', () => {
    if (body) exportPDF(body, dateEl?.textContent ?? '');
  });

  if (body) void loadBrief(body, dateEl);
}

// ---------------------------------------------------------------------------
// Data fetch + render
// ---------------------------------------------------------------------------

async function loadBrief(body: HTMLElement, dateEl: HTMLElement | null): Promise<void> {
  try {
    const res = await fetchWithRetry('/api/v1/brief');
    if (!res.ok) {
      body.innerHTML = `<div class="nw-brief-empty" style="${emptyStyle()}">No brief available yet. The first brief publishes tomorrow at 5 AM ET.</div>`;
      if (dateEl) dateEl.textContent = '—';
      return;
    }

    const data = (await res.json()) as BriefResponse;
    const content = parseContent(data.content);

    const briefDate = (data.brief_date || '').split('T')[0];
    const [year, month, day] = briefDate.split('-').map((s) => parseInt(s, 10));
    // Use a local Date constructor so the weekday label matches the
    // subscriber's calendar day, not UTC. This matters near midnight.
    const dayLabel = Number.isFinite(year)
      ? new Date(year, (month || 1) - 1, day || 1).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : briefDate;

    if (dateEl) dateEl.textContent = dayLabel;

    // Prefer the Sonnet markdown when present — that renders the full
    // section structure via the shared briefRenderer. Fall back to the
    // stored HTML summary for pre-A.5 legacy briefs.
    if (content.briefText) {
      const rendered = renderBriefBody(content.briefText, {
        dateForImage: briefDate,
        mapImageClass: 'nw-brief-map-image',
        wrapWithSection: false,
      });
      body.innerHTML = `<div class="nw-brief-dossier-body" style="${bodyInnerStyle()}">${rendered}</div>`;
      applyDossierSectionStyles(body);
    } else if (data.summary) {
      body.innerHTML = `<div class="nw-brief-dossier-body" style="${bodyInnerStyle()}">${data.summary}</div>`;
    } else {
      body.innerHTML = `<div class="nw-brief-empty" style="${emptyStyle()}">Brief content unavailable.</div>`;
    }

    // CII summary strip at the bottom uses the REAL BriefData fields
    // (name + score, not the old incorrect countryName shape). Renders
    // as a compact mono strip reminiscent of Market Pulse so the panel
    // doesn't lose the "glanceable dashboard" feel the original had.
    if (content.topRiskCountries && content.topRiskCountries.length > 0) {
      const strip = renderCIIStrip(content.topRiskCountries, {
        earthquakeCount: content.earthquakeCount,
        diseaseCount: content.diseaseCount,
        totalCountries: content.totalCountries,
      });
      body.insertAdjacentHTML('beforeend', strip);
    }
  } catch (err) {
    console.error('[briefPanel] Failed to load brief:', err instanceof Error ? err.message : err);
    body.innerHTML = `<div class="nw-brief-empty" style="${emptyStyle()}">Failed to load the brief. Try refreshing.</div>`;
    if (dateEl) dateEl.textContent = '—';
  }
}

/**
 * Render a compact mono CII summary strip. Replaces the old panel's
 * top-risk-countries card that was silently broken due to the wrong
 * data type.
 */
function renderCIIStrip(
  countries: CountryRisk[],
  metrics: { earthquakeCount?: number; diseaseCount?: number; totalCountries?: number },
): string {
  const top = countries.slice(0, 6);
  const rows = top
    .map((c) => {
      const name = escapeHtml(c.name ?? c.code ?? 'Unknown');
      const score = typeof c.score === 'number' ? c.score : 0;
      const color = scoreColor(score);
      return `<div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid ${dossierColors.border}; font-family: ${dossierFonts.mono}; font-size: 12px;">
        <span style="flex: 1; color: ${dossierColors.textPrimary};">${name}</span>
        <span style="font-weight: 700; color: ${color}; min-width: 32px; text-align: right;">${score}</span>
        <span style="width: 120px; height: 4px; background: ${dossierColors.bgMuted}; border-radius: 2px; overflow: hidden;">
          <span style="display: block; height: 100%; width: ${Math.min(100, score)}%; background: ${color};"></span>
        </span>
      </div>`;
    })
    .join('');

  const metricPill = (label: string, value: string | number) => `
    <div style="flex: 1; padding: 12px; background: ${dossierColors.bgMuted}; border-radius: 2px; text-align: center;">
      <div style="font-family: ${dossierFonts.mono}; font-size: 22px; font-weight: 700; color: ${dossierColors.textPrimary};">${value}</div>
      <div style="font-family: ${dossierFonts.mono}; font-size: 10px; letter-spacing: 0.12em; color: ${dossierColors.textTertiary}; text-transform: uppercase; margin-top: 4px;">${label}</div>
    </div>
  `;

  return `
    <div style="margin-top: 32px; padding-top: 24px; border-top: 2px solid ${dossierColors.divider};">
      <div style="font-family: ${dossierFonts.mono}; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; color: ${dossierColors.accent}; text-transform: uppercase; margin-bottom: 16px;">Country Instability Index</div>
      ${rows}
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        ${metricPill('Countries', metrics.totalCountries ?? '—')}
        ${metricPill('Seismic (24h)', metrics.earthquakeCount ?? '—')}
        ${metricPill('Outbreaks', metrics.diseaseCount ?? '—')}
      </div>
    </div>
  `;
}

/**
 * Style the section <h2>s, callouts, and inline elements generated by
 * the shared renderer. Since the overlay uses inline styles (not a
 * dedicated stylesheet), we walk the DOM after injection and apply
 * per-element styles. Keeps the panel self-contained.
 */
function applyDossierSectionStyles(body: HTMLElement): void {
  // Section headings — oxblood-rule anchor + Tiempos serif.
  body.querySelectorAll('h2').forEach((h) => {
    h.setAttribute(
      'style',
      [
        `font-family: ${dossierFonts.serif}`,
        `font-size: 22px`,
        `font-weight: 600`,
        `color: ${dossierColors.textPrimary}`,
        `line-height: 1.25`,
        `margin: 32px 0 12px 0`,
        `padding-top: 12px`,
        `border-top: 2px solid ${dossierColors.accent}`,
      ].join(';'),
    );
  });

  // Paragraph copy.
  body.querySelectorAll('p').forEach((p) => {
    p.setAttribute(
      'style',
      [`margin: 0 0 14px 0`, `color: ${dossierColors.textPrimary}`, `line-height: 1.65`, `font-size: 16px`].join(';'),
    );
  });

  // Why it matters callouts — oxblood left rule, warm ivory bg.
  body.querySelectorAll('.dossier-callout').forEach((el) => {
    (el as HTMLElement).setAttribute(
      'style',
      [
        `margin: 16px 0 20px 0`,
        `padding: 14px 18px`,
        `background: ${dossierColors.accentBgSoft}`,
        `border-left: 3px solid ${dossierColors.accent}`,
        `border-radius: 2px`,
      ].join(';'),
    );
    const label = el.querySelector('.dossier-callout-label');
    if (label) {
      (label as HTMLElement).setAttribute(
        'style',
        [
          `display: block`,
          `font-family: ${dossierFonts.mono}`,
          `font-size: 10px`,
          `font-weight: 700`,
          `letter-spacing: 0.16em`,
          `color: ${dossierColors.accent}`,
          `text-transform: uppercase`,
          `margin-bottom: 4px`,
        ].join(';'),
      );
    }
    el.querySelectorAll('p').forEach((p) => {
      (p as HTMLElement).setAttribute(
        'style',
        `margin: 0; color: ${dossierColors.textPrimary}; font-size: 15px; line-height: 1.6;`,
      );
    });
  });

  // Bulleted lists.
  body.querySelectorAll('ul').forEach((ul) => {
    ul.setAttribute('style', `padding-left: 20px; margin: 0 0 14px 0; color: ${dossierColors.textPrimary};`);
  });
  body.querySelectorAll('li').forEach((li) => {
    li.setAttribute('style', `margin: 6px 0; line-height: 1.55;`);
  });

  // Map of the Day image emitted by the shared renderer.
  body.querySelectorAll('img.nw-brief-map-image').forEach((img) => {
    (img as HTMLElement).setAttribute(
      'style',
      [
        `display: block`,
        `width: 100%`,
        `height: auto`,
        `margin: 20px 0`,
        `border: 1px solid ${dossierColors.border}`,
        `border-radius: 2px`,
      ].join(';'),
    );
  });

  // Bold emphasis inside body copy.
  body.querySelectorAll('strong').forEach((s) => {
    s.setAttribute('style', `color: ${dossierColors.textPrimary}; font-weight: 700;`);
  });
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

function exportPDF(body: HTMLElement, dateLabel: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>NexusWatch Situation Brief · ${escapeHtml(dateLabel)}</title>
      <style>
        body {
          font-family: 'Inter', -apple-system, sans-serif;
          background: ${dossierColors.bgPage};
          color: ${dossierColors.textPrimary};
          padding: 48px;
          max-width: 720px;
          margin: 0 auto;
          line-height: 1.6;
        }
        h1 {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 32px;
          font-weight: 600;
          border-bottom: 2px solid ${dossierColors.accent};
          padding-bottom: 12px;
          margin-bottom: 24px;
        }
        h2 {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 20px;
          margin: 32px 0 12px 0;
          padding-top: 12px;
          border-top: 2px solid ${dossierColors.accent};
        }
        p { margin: 0 0 14px 0; font-size: 15px; }
        .dossier-callout {
          margin: 16px 0;
          padding: 12px 16px;
          background: ${dossierColors.accentBgSoft};
          border-left: 3px solid ${dossierColors.accent};
        }
        .dossier-callout-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          color: ${dossierColors.accent};
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        img { display: block; width: 100%; height: auto; margin: 16px 0; }
        .footer { margin-top: 40px; font-size: 10px; color: ${dossierColors.textTertiary}; border-top: 1px solid ${dossierColors.border}; padding-top: 12px; }
        @media print { body { padding: 24px; } }
      </style>
    </head>
    <body>
      <h1>NexusWatch Situation Brief</h1>
      <div style="font-family: monospace; font-size: 11px; color: ${dossierColors.textTertiary}; margin-bottom: 24px; letter-spacing: 0.12em;">
        ${escapeHtml(dateLabel.toUpperCase())}
      </div>
      ${body.innerHTML}
      <div class="footer">NexusWatch Intelligence Platform</div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

// ---------------------------------------------------------------------------
// Severity helper
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 70) return dossierColors.down; // critical
  if (score >= 50) return dossierColors.accent; // elevated
  if (score >= 30) return dossierColors.divider; // watch
  return dossierColors.up; // stable
}

// ---------------------------------------------------------------------------
// Inline style builders
// ---------------------------------------------------------------------------

function panelShellStyle(): string {
  return [
    `background: ${dossierColors.bgCard}`,
    `color: ${dossierColors.textPrimary}`,
    `max-width: 720px`,
    `width: 100%`,
    `border-radius: 4px`,
    `box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35)`,
    `border: 1px solid ${dossierColors.border}`,
    `display: flex`,
    `flex-direction: column`,
    `max-height: calc(100vh - 96px)`,
    `overflow: hidden`,
    `font-family: ${dossierFonts.sans}`,
  ].join(';');
}

function topbarStyle(): string {
  return [
    `display: flex`,
    `align-items: center`,
    `justify-content: space-between`,
    `padding: 24px 32px 16px 32px`,
    `border-bottom: 1px solid ${dossierColors.border}`,
  ].join(';');
}

function mastheadStyle(): string {
  return [
    `height: 2px`,
    `background: linear-gradient(to right, transparent, ${dossierColors.divider}, transparent)`,
    `margin: 0 32px`,
  ].join(';');
}

function kickerStyle(): string {
  return [
    `font-family: ${dossierFonts.mono}`,
    `font-size: 11px`,
    `font-weight: 700`,
    `letter-spacing: 0.16em`,
    `color: ${dossierColors.accent}`,
    `text-transform: uppercase`,
    `margin-bottom: 6px`,
  ].join(';');
}

function dateStyle(): string {
  return [
    `font-family: ${dossierFonts.serif}`,
    `font-size: 22px`,
    `font-weight: 600`,
    `color: ${dossierColors.textPrimary}`,
    `line-height: 1.25`,
  ].join(';');
}

function bodyStyle(): string {
  return [
    `overflow-y: auto`,
    `flex: 1 1 auto`,
    `padding: 24px 32px 32px 32px`,
    `font-family: ${dossierFonts.sans}`,
    `font-size: 16px`,
    `line-height: 1.65`,
    `color: ${dossierColors.textPrimary}`,
  ].join(';');
}

function bodyInnerStyle(): string {
  return [`font-family: ${dossierFonts.sans}`, `color: ${dossierColors.textPrimary}`].join(';');
}

function ctaStyle(): string {
  return [
    `display: flex`,
    `gap: 12px`,
    `padding: 16px 32px`,
    `border-top: 1px solid ${dossierColors.border}`,
    `background: ${dossierColors.bgMuted}`,
  ].join(';');
}

function ctaLinkStyle(): string {
  return [
    `flex: 0 0 auto`,
    `padding: 10px 18px`,
    `background: transparent`,
    `color: ${dossierColors.textPrimary}`,
    `border: 1px solid ${dossierColors.borderStrong}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 11px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `text-decoration: none`,
  ].join(';');
}

function ctaLinkPrimaryStyle(): string {
  return [
    `flex: 1 1 auto`,
    `padding: 10px 18px`,
    `background: ${dossierColors.accent}`,
    `color: ${dossierColors.textInverse}`,
    `border: 1px solid ${dossierColors.accent}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 11px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `text-decoration: none`,
    `text-align: center`,
  ].join(';');
}

function buttonSecondaryStyle(): string {
  return [
    `padding: 8px 14px`,
    `background: transparent`,
    `color: ${dossierColors.textPrimary}`,
    `border: 1px solid ${dossierColors.borderStrong}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 10px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `cursor: pointer`,
  ].join(';');
}

function buttonCloseStyle(): string {
  return [
    `width: 32px`,
    `height: 32px`,
    `padding: 0`,
    `background: transparent`,
    `color: ${dossierColors.textTertiary}`,
    `border: 1px solid ${dossierColors.border}`,
    `border-radius: 2px`,
    `font-size: 20px`,
    `cursor: pointer`,
    `font-family: ${dossierFonts.sans}`,
  ].join(';');
}

function loadingStyle(): string {
  return [
    `font-family: ${dossierFonts.mono}`,
    `font-size: 12px`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `color: ${dossierColors.textTertiary}`,
    `text-align: center`,
    `padding: 48px 0`,
  ].join(';');
}

function emptyStyle(): string {
  return [
    `font-family: ${dossierFonts.sans}`,
    `font-size: 15px`,
    `color: ${dossierColors.textTertiary}`,
    `text-align: center`,
    `padding: 48px 16px`,
  ].join(';');
}
