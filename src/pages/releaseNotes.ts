/**
 * Release Notes / What's New page.
 */

import { createElement } from '../utils/dom.ts';

export function renderReleaseNotes(container: HTMLElement): void {
  container.innerHTML = '';
  container.className = 'nw-releases-page';

  const header = createElement('header', { className: 'nw-releases-header' });
  header.innerHTML = `
    <a href="#/intel" class="nw-releases-back">← Back to Intel Map</a>
    <h1>What's New</h1>
    <p class="nw-releases-subtitle">Building in public. Shipped, not coming soon.</p>
  `;
  container.appendChild(header);

  const notes = [
    {
      date: '2026-04-14',
      version: 'v2.0',
      title: 'Verified Intelligence Platform — Launch',
      highlights: [
        '86 countries (up from 23) with 3-tier coverage system',
        'Intelligence Confidence System — every CII score decomposes to source data',
        'Verification Engine — CONFIRMED / CORROBORATED / UNVERIFIED badges',
        'Scenario Simulation Engine — 7 preset what-if scenarios',
        'AI Analyst with tool use — cited responses with confidence tags',
        'Portfolio Geopolitical Exposure (Pro) — map holdings to country risk',
        'Crisis Playbooks — auto-trigger on CII spikes and major events',
        'Time-Travel Scrubber — navigate historical CII data',
        'Prediction Ledger — public accuracy tracking over time',
        'Intelligence API v2 — REST access with attribution',
        'Risk Cascade Engine — 56 cross-border dependency rules',
        'Composite Alerts — AND/OR multi-condition rules with CII thresholds',
        '5 new layers — protest, nuclear threat, cyber, chokepoint threat, refugees',
        'Light Intel Dossier email redesign — every brief, alert, welcome',
        'Platform Data Confidence score in header',
        'Keyboard shortcuts overlay (? key)',
        'Country detail panel with full evidence chain UI',
      ],
    },
    {
      date: '2026-04-11',
      version: 'v1.5',
      title: 'Data Accuracy Autonomy',
      highlights: [
        'Self-healing data pipeline foundations (circuit breakers)',
        'Data health dashboard (admin-gated)',
        'Social autonomy queue (X, LinkedIn, Reddit drafters)',
        'CII history + sparkline visualizations',
        'Timeline bar with historical events',
      ],
    },
    {
      date: '2026-04-08',
      version: 'v1.0',
      title: 'Intelligence Engine Complete',
      highlights: [
        '30 data layers shipped',
        'Personal watchlist system',
        'AI terminal with command interface',
        'Auto-threat detection',
        'Cinema mode global tension index',
      ],
    },
  ];

  const container2 = createElement('div', { className: 'nw-releases-list' });
  for (const note of notes) {
    const entry = createElement('article', { className: 'nw-release-entry' });
    entry.innerHTML = `
      <div class="nw-release-header">
        <div class="nw-release-version">${note.version}</div>
        <div class="nw-release-date">${note.date}</div>
      </div>
      <h2>${note.title}</h2>
      <ul>
        ${note.highlights.map((h) => `<li>${h}</li>`).join('')}
      </ul>
    `;
    container2.appendChild(entry);
  }
  container.appendChild(container2);

  const footer = createElement('footer', { className: 'nw-releases-footer' });
  footer.innerHTML = `
    <p>
      Missing a feature? Want something built next? Email
      <a href="mailto:hello@nexuswatch.dev">hello@nexuswatch.dev</a>.
      We read everything.
    </p>
  `;
  container.appendChild(footer);
}
