/**
 * Public Audit Viewer (/#/audit/:country).
 *
 * The radical transparency page. Anyone can drill into any country's
 * CII computation history — every rule applied, every source cited,
 * every delta between cycles, the rule version in effect at the time.
 *
 * This is the page that turns "trust us" into "check our work."
 */

import { createElement } from '../utils/dom.ts';

interface AuditEntry {
  id: string;
  country_code: string;
  computed_at_ms: number;
  rule_version: string;
  input_lineage_ids: string[];
  score: number;
  previous_score: number | null;
  components: {
    conflict: number;
    disasters: number;
    sentiment: number;
    infrastructure: number;
    governance: number;
    marketExposure: number;
  };
  confidence: string;
  applied_rules: string[];
  gaps: string[];
}

export async function renderAuditPage(root: HTMLElement, country?: string): Promise<void> {
  root.innerHTML = '';
  root.className = 'nw-audit-page';

  const header = createElement('header', { className: 'nw-audit-header' });
  header.innerHTML = `
    <a href="#/intel" class="nw-audit-back">← Back to Intel Map</a>
    <h1>CII Audit Trail</h1>
    <p class="nw-audit-subtitle">
      Every NexusWatch CII computation logged and traceable. Enter an ISO country code
      below to see the full history of how that country's instability score was produced.
    </p>
  `;
  root.appendChild(header);

  // Country picker
  const picker = createElement('div', { className: 'nw-audit-picker' });
  picker.innerHTML = `
    <input type="text" class="nw-audit-input" placeholder="Country code (e.g., UA, SD, IR)" value="${country || ''}">
    <button class="nw-audit-submit">Load Audit Trail</button>
    <span class="nw-audit-hint">Showing last 30 days, up to 100 entries</span>
  `;
  root.appendChild(picker);

  const content = createElement('div', { className: 'nw-audit-content' });
  root.appendChild(content);

  const input = picker.querySelector('.nw-audit-input') as HTMLInputElement;
  const submit = picker.querySelector('.nw-audit-submit') as HTMLButtonElement;

  const load = async () => {
    const code = input.value.trim().toUpperCase();
    if (!code) return;

    window.history.replaceState(null, '', `#/audit/${code}`);
    content.innerHTML = '<div class="nw-audit-loading">Loading audit trail...</div>';

    try {
      const res = await fetch(`/api/v2/audit?country=${code}&days=30&limit=100`);
      if (!res.ok) throw new Error('audit fetch failed');
      const data = (await res.json()) as { country: string; count: number; entries: AuditEntry[] };
      renderAuditContent(content, code, data.entries);
    } catch {
      content.innerHTML =
        '<div class="nw-audit-empty">Audit trail unavailable. The audit log table may not be populated yet.</div>';
    }
  };

  submit.addEventListener('click', load);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') load();
  });

  if (country) void load();
  else {
    content.innerHTML = `
      <div class="nw-audit-empty">
        <p>Enter a country code above to see its CII computation history.</p>
        <p style="margin-top:14px;font-size:12px;">
          Popular: <a href="#/audit/UA">Ukraine</a> · <a href="#/audit/SD">Sudan</a> ·
          <a href="#/audit/IR">Iran</a> · <a href="#/audit/IL">Israel</a> ·
          <a href="#/audit/CN">China</a> · <a href="#/audit/TW">Taiwan</a>
        </p>
      </div>
    `;
  }

  // Methodology footer
  const footer = createElement('footer', { className: 'nw-audit-footer' });
  footer.innerHTML = `
    <h3>How to read this trail</h3>
    <ul>
      <li><strong>Rule version</strong> — Which version of the CII rules was in effect. See <a href="#/methodology">methodology</a> for the changelog.</li>
      <li><strong>Input lineage IDs</strong> — IDs of the data fetches that fed this computation. Query <code>/api/v2/lineage?id=XXX</code> for full hop trace.</li>
      <li><strong>Applied rules</strong> — Which baseline/live rules fired (e.g., "Baseline conflict 18", "ACLED: 14 events").</li>
      <li><strong>Gaps</strong> — Explicit disclosure of what data was missing at computation time.</li>
      <li><strong>Δ from previous</strong> — Score change from prior cycle. Large deltas deserve scrutiny.</li>
    </ul>
  `;
  root.appendChild(footer);
}

function renderAuditContent(container: HTMLElement, code: string, entries: AuditEntry[]): void {
  container.innerHTML = '';

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="nw-audit-empty">
        <p>No audit entries yet for ${code}.</p>
        <p style="margin-top:10px;font-size:12px;">
          The audit log populates once the CII computation cron runs and persists entries to the database.
          Data from 2026-04-14 onward.
        </p>
      </div>
    `;
    return;
  }

  const stats = createElement('div', { className: 'nw-audit-stats' });
  const latest = entries[0];
  const avgScore = Math.round(entries.reduce((s, e) => s + e.score, 0) / entries.length);
  const maxScore = Math.max(...entries.map((e) => e.score));
  const minScore = Math.min(...entries.map((e) => e.score));

  stats.innerHTML = `
    <div class="nw-audit-stat"><span class="nw-audit-stat-num">${latest.score}</span><span class="nw-audit-stat-label">CURRENT</span></div>
    <div class="nw-audit-stat"><span class="nw-audit-stat-num">${avgScore}</span><span class="nw-audit-stat-label">30-DAY AVG</span></div>
    <div class="nw-audit-stat"><span class="nw-audit-stat-num">${maxScore}</span><span class="nw-audit-stat-label">HIGH</span></div>
    <div class="nw-audit-stat"><span class="nw-audit-stat-num">${minScore}</span><span class="nw-audit-stat-label">LOW</span></div>
    <div class="nw-audit-stat"><span class="nw-audit-stat-num">${entries.length}</span><span class="nw-audit-stat-label">ENTRIES</span></div>
    <div class="nw-audit-stat"><span class="nw-audit-stat-num" style="font-size:12px;">${latest.rule_version}</span><span class="nw-audit-stat-label">RULE</span></div>
  `;
  container.appendChild(stats);

  const list = createElement('div', { className: 'nw-audit-list' });
  for (const e of entries.slice(0, 40)) {
    const delta = e.previous_score !== null ? e.score - e.previous_score : null;
    const deltaStr = delta === null ? '—' : delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : '=';
    const deltaColor = delta === null ? '#666' : delta > 0 ? '#dc2626' : delta < 0 ? '#22c55e' : '#888';
    const dt = new Date(e.computed_at_ms);

    const entry = createElement('div', { className: 'nw-audit-entry' });
    entry.innerHTML = `
      <div class="nw-audit-entry-header">
        <span class="nw-audit-entry-time">${dt.toLocaleString()}</span>
        <span class="nw-audit-entry-score">${e.score}</span>
        <span class="nw-audit-entry-delta" style="color:${deltaColor}">${deltaStr}</span>
        <span class="nw-audit-entry-conf nw-conf-${e.confidence}">${e.confidence.toUpperCase()}</span>
        <span class="nw-audit-entry-rule">${e.rule_version}</span>
      </div>
      <div class="nw-audit-entry-components">
        <span>C:${e.components.conflict}</span>
        <span>D:${e.components.disasters}</span>
        <span>S:${e.components.sentiment}</span>
        <span>I:${e.components.infrastructure}</span>
        <span>G:${e.components.governance}</span>
        <span>M:${e.components.marketExposure}</span>
      </div>
      ${e.applied_rules.length > 0 ? `<div class="nw-audit-entry-rules"><strong>Applied:</strong> ${e.applied_rules.slice(0, 5).join(' · ')}</div>` : ''}
      ${e.gaps.length > 0 ? `<div class="nw-audit-entry-gaps"><strong>Gaps:</strong> ${e.gaps.slice(0, 2).join(' · ')}</div>` : ''}
      ${e.input_lineage_ids.length > 0 ? `<div class="nw-audit-entry-lineage">${e.input_lineage_ids.length} source fetches → <a href="/api/v2/lineage?id=${e.input_lineage_ids[0]}" target="_blank">view lineage</a></div>` : ''}
    `;
    list.appendChild(entry);
  }
  container.appendChild(list);
}
