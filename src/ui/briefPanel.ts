/**
 * Daily Intelligence Brief Panel
 *
 * In-app viewer for AI-generated daily briefs.
 * Shows latest brief with sections, accessible via "BRIEF" button.
 * Fetches from /api/v1/brief endpoint.
 */

import { createElement } from '../utils/dom.ts';
import { fetchWithRetry } from '../utils/fetch.ts';

let overlay: HTMLElement | null = null;

export function openBriefPanel(container: HTMLElement): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
    return;
  }

  overlay = createElement('div', { className: 'nw-brief-overlay' });
  overlay.innerHTML = `
    <div class="nw-brief-panel">
      <div class="nw-brief-header">
        <span class="nw-brief-title">DAILY INTELLIGENCE BRIEF</span>
        <div class="nw-brief-actions">
          <button class="nw-brief-export-btn">EXPORT PDF</button>
          <button class="nw-brief-close">&times;</button>
        </div>
      </div>
      <div class="nw-brief-body">
        <div class="nw-brief-loading">Loading brief...</div>
      </div>
    </div>
  `;

  container.appendChild(overlay);

  const closeBtn = overlay.querySelector('.nw-brief-close') as HTMLElement;
  const exportBtn = overlay.querySelector('.nw-brief-export-btn') as HTMLElement;
  const body = overlay.querySelector('.nw-brief-body') as HTMLElement;

  closeBtn.addEventListener('click', () => {
    overlay?.remove();
    overlay = null;
  });

  exportBtn.addEventListener('click', () => exportPDF(body));

  // Fetch and render brief
  loadBrief(body);
}

async function loadBrief(body: HTMLElement): Promise<void> {
  try {
    const res = await fetchWithRetry('/api/v1/brief');
    if (!res.ok) {
      body.innerHTML = '<div class="nw-brief-empty">No brief available yet. Briefs are generated daily at 06:00 UTC.</div>';
      return;
    }

    const data = (await res.json()) as {
      brief_date: string;
      summary: string;
      content: {
        date: string;
        topRiskCountries?: Array<{ countryName: string; score: number }>;
        earthquakeCount?: number;
        diseaseOutbreaks?: number;
        internetOutages?: number;
      };
      generated_at: string;
    };

    // Parse date from YYYY-MM-DD string directly to avoid timezone shift
    const dateStr = (data.brief_date || data.generated_at || '').split('T')[0];
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // Local date, no UTC shift
    const content = data.content || {};

    body.innerHTML = `
      <div class="nw-brief-date">${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>

      <div class="nw-brief-section">
        <div class="nw-brief-section-title">EXECUTIVE SUMMARY</div>
        <div class="nw-brief-text">${escapeHtml(data.summary || 'Brief content unavailable.')}</div>
      </div>

      ${content.topRiskCountries?.length ? `
      <div class="nw-brief-section">
        <div class="nw-brief-section-title">TOP RISK COUNTRIES</div>
        <div class="nw-brief-risk-grid">
          ${content.topRiskCountries.slice(0, 10).map((c) => `
            <div class="nw-brief-risk-row">
              <span class="nw-brief-risk-name">${escapeHtml(c.countryName)}</span>
              <span class="nw-brief-risk-score" style="color: ${scoreColor(c.score)}">${c.score}</span>
              <div class="nw-brief-risk-bar">
                <div class="nw-brief-risk-fill" style="width: ${c.score}%; background: ${scoreColor(c.score)}"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div class="nw-brief-section">
        <div class="nw-brief-section-title">KEY METRICS</div>
        <div class="nw-brief-metrics">
          <div class="nw-brief-metric">
            <span class="nw-brief-metric-value">${content.earthquakeCount ?? '—'}</span>
            <span class="nw-brief-metric-label">EARTHQUAKES</span>
          </div>
          <div class="nw-brief-metric">
            <span class="nw-brief-metric-value">${content.diseaseOutbreaks ?? '—'}</span>
            <span class="nw-brief-metric-label">OUTBREAKS</span>
          </div>
          <div class="nw-brief-metric">
            <span class="nw-brief-metric-value">${content.internetOutages ?? '—'}</span>
            <span class="nw-brief-metric-label">OUTAGES</span>
          </div>
        </div>
      </div>

      <div class="nw-brief-footer">
        Generated ${new Date(data.generated_at).toLocaleString()} UTC by NexusWatch Intelligence Engine
      </div>
    `;
  } catch {
    body.innerHTML = '<div class="nw-brief-empty">Failed to load brief. Try again later.</div>';
  }
}

function exportPDF(body: HTMLElement): void {
  // Use browser print as a clean PDF export mechanism
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>NexusWatch Daily Intelligence Brief</title>
      <style>
        body { font-family: 'Courier New', monospace; background: #fff; color: #000; padding: 40px; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 18px; letter-spacing: 3px; border-bottom: 2px solid #ff6600; padding-bottom: 8px; }
        .section { margin: 24px 0; }
        .section-title { font-size: 11px; font-weight: bold; letter-spacing: 2px; color: #ff6600; margin-bottom: 8px; }
        .text { font-size: 13px; line-height: 1.6; }
        .risk-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; border-bottom: 1px solid #eee; }
        .risk-name { flex: 1; font-size: 12px; }
        .risk-score { font-size: 14px; font-weight: bold; width: 30px; text-align: right; }
        .metrics { display: flex; gap: 40px; margin: 16px 0; }
        .metric { text-align: center; }
        .metric-value { font-size: 28px; font-weight: bold; display: block; }
        .metric-label { font-size: 9px; letter-spacing: 1px; color: #666; }
        .footer { margin-top: 40px; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <h1>NEXUSWATCH DAILY INTELLIGENCE BRIEF</h1>
      ${body.innerHTML.replace(/class="nw-brief-/g, 'class="')}
      <div class="footer">Classification: UNCLASSIFIED | NexusWatch Intelligence Platform | dashpulse.app</div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}

function scoreColor(score: number): string {
  if (score >= 75) return '#dc2626';
  if (score >= 50) return '#f97316';
  if (score >= 25) return '#eab308';
  return '#22c55e';
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
