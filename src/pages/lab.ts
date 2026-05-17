/**
 * /lab — NexusWatch Data Lab.
 *
 * Public SQL playground over the nightly Parquet exports. Loads DuckDB-WASM
 * lazily on first run (7 MB), registers parquet views (`cii`, `acled`,
 * `crisis`, `signals`) from the manifest, then lets the visitor run any
 * SQL they want. One-click chart rendering + share button.
 *
 * 2026-05 tier-up Phase 1.
 */

import { createElement } from '../utils/dom.ts';
import { setPageSeo, PAGE_SEO } from '../utils/seo.ts';
import { NOTEBOOKS, type NotebookTemplate } from '../lab/notebooks.ts';
import type { QueryRowsResult } from '../lab/duckdb.ts';

interface ManifestExport {
  name: string;
  url: string;
  bytes: number;
  rows: number;
  exported_at: string;
}

interface Manifest {
  exports: ManifestExport[];
  generated_at: string;
  note?: string;
}

const VIEW_MAP: Record<string, string> = {
  cii_daily_snapshots: 'cii',
  acled_events_90d: 'acled',
  crisis_triggers: 'crisis',
  verified_signals: 'signals',
};

export async function renderLabPage(root: HTMLElement): Promise<void> {
  setPageSeo(PAGE_SEO.lab);
  root.innerHTML = '';
  root.className = 'nw-lab-page';
  injectStyles();

  const wrap = createElement('div', { className: 'nw-lab-wrap' });

  // Nav
  const nav = createElement('nav', { className: 'nw-lab-nav' });
  nav.setAttribute('aria-label', 'Primary');
  nav.innerHTML = `
    <a href="#/intel" class="nw-lab-back">← Intel Map</a>
    <div class="nw-lab-nav-links">
      <a href="#/api">API</a>
      <a href="#/mcp">MCP</a>
      <a href="#/accuracy">Accuracy</a>
      <a href="#/methodology">Methodology</a>
    </div>
  `;
  wrap.appendChild(nav);

  // Hero
  const hero = createElement('header', { className: 'nw-lab-hero' });
  hero.innerHTML = `
    <div class="nw-lab-eyebrow">Data Lab</div>
    <h1 class="nw-lab-title">Query NexusWatch in your browser.</h1>
    <p class="nw-lab-blurb">
      Run SQL against the public parquet exports — daily CII snapshots, the last 90 days
      of ACLED events, every crisis trigger, every verified signal. DuckDB-WASM does the
      heavy lifting in your browser. No server. No login. Share any query as a URL.
    </p>
    <div class="nw-lab-status" data-status>Manifest: loading…</div>
  `;
  wrap.appendChild(hero);

  // Notebook strip
  const tplStrip = createElement('div', { className: 'nw-lab-templates' });
  tplStrip.innerHTML = `<div class="nw-lab-section-label">Starter notebooks</div>`;
  const tplRow = createElement('div', { className: 'nw-lab-template-row' });
  for (const tpl of NOTEBOOKS) {
    const btn = createElement('button', { className: 'nw-lab-template-btn' });
    btn.innerHTML = `<strong>${escapeHtml(tpl.title)}</strong><span>${escapeHtml(tpl.description)}</span>`;
    btn.addEventListener('click', () => {
      loadTemplate(tpl);
    });
    tplRow.appendChild(btn);
  }
  tplStrip.appendChild(tplRow);
  wrap.appendChild(tplStrip);

  // Editor + actions
  const editor = createElement('section', { className: 'nw-lab-editor' });
  editor.innerHTML = `
    <div class="nw-lab-section-label">Query</div>
    <textarea
      class="nw-lab-sql"
      spellcheck="false"
      aria-label="SQL query"
      placeholder="SELECT date, cii_score FROM cii WHERE country_code = 'UA' ORDER BY date"
    >SELECT date, cii_score FROM cii WHERE country_code = 'UA' ORDER BY date LIMIT 365</textarea>
    <div class="nw-lab-actions">
      <button class="nw-lab-btn nw-lab-btn-primary" data-action="run">▸ Run query</button>
      <button class="nw-lab-btn" data-action="chart" disabled>↳ Render as chart</button>
      <button class="nw-lab-btn" data-action="copy">⎘ Copy SQL</button>
      <button class="nw-lab-btn" data-action="share">🔗 Copy share URL</button>
      <span class="nw-lab-action-note" data-note></span>
    </div>
    <kbd class="nw-lab-hotkey">⌘ Enter to run · ⌘ K to share</kbd>
  `;
  wrap.appendChild(editor);

  // Results mount
  const results = createElement('section', { className: 'nw-lab-results' });
  results.innerHTML = `<div class="nw-lab-results-empty">Run a query to see results here.</div>`;
  wrap.appendChild(results);

  root.appendChild(wrap);

  // ---- Wire it up ----
  const sqlEl = editor.querySelector<HTMLTextAreaElement>('.nw-lab-sql')!;
  const runBtn = editor.querySelector<HTMLButtonElement>('[data-action="run"]')!;
  const chartBtn = editor.querySelector<HTMLButtonElement>('[data-action="chart"]')!;
  const copyBtn = editor.querySelector<HTMLButtonElement>('[data-action="copy"]')!;
  const shareBtn = editor.querySelector<HTMLButtonElement>('[data-action="share"]')!;
  const noteEl = editor.querySelector<HTMLElement>('[data-note]')!;
  const statusEl = hero.querySelector<HTMLElement>('[data-status]')!;

  let lastResult: QueryRowsResult | null = null;
  let activeTemplate: NotebookTemplate | null = null;

  function loadTemplate(tpl: NotebookTemplate): void {
    sqlEl.value = tpl.sql;
    activeTemplate = tpl;
    chartBtn.disabled = true;
    lastResult = null;
    noteEl.textContent = `Loaded "${tpl.title}". Hit Run to execute.`;
  }

  // Hydrate from URL fragment (#sql=...)
  const urlSql = readShared();
  if (urlSql) {
    sqlEl.value = urlSql;
    noteEl.textContent = 'Loaded query from share URL.';
  }

  // Fetch manifest + register views
  let manifest: Manifest | null = null;
  try {
    const res = await fetch('/api/data/manifest');
    manifest = (await res.json()) as Manifest;
    if (manifest.exports.length === 0) {
      statusEl.innerHTML = `<span style="color:#f6b04a">Manifest empty — exports haven't run yet.</span> ${escapeHtml(manifest.note ?? '')}`;
      runBtn.disabled = true;
    } else {
      statusEl.innerHTML = `Manifest: ${manifest.exports.length} datasets · ${manifest.exports.reduce((s, e) => s + e.rows, 0).toLocaleString()} rows total · refreshed ${relTime(manifest.generated_at)}`;
    }
  } catch {
    statusEl.innerHTML = `<span style="color:#dc2626">Failed to load manifest.</span>`;
    runBtn.disabled = true;
  }

  runBtn.addEventListener('click', async () => {
    if (!manifest || manifest.exports.length === 0) return;
    runBtn.disabled = true;
    chartBtn.disabled = true;
    noteEl.textContent = 'Initializing DuckDB-WASM…';
    results.innerHTML = `<div class="nw-lab-results-loading">⏳ <span data-progress>Loading…</span></div>`;
    const progressEl = results.querySelector<HTMLElement>('[data-progress]');
    const t0 = performance.now();

    try {
      // Lazy import — keeps duckdb out of main bundle
      const { getDuckDb, registerParquetView, runQuery } = await import('../lab/duckdb.ts');
      await getDuckDb((msg) => {
        if (progressEl) progressEl.textContent = msg;
      });

      // Register parquet views from manifest
      for (const exp of manifest.exports) {
        const view = VIEW_MAP[exp.name] ?? exp.name;
        await registerParquetView(view, exp.url);
      }

      if (progressEl) progressEl.textContent = 'Running query…';
      const result = await runQuery(sqlEl.value);
      lastResult = result;
      chartBtn.disabled = !canChart(result, activeTemplate);
      noteEl.textContent = `${result.rowCount.toLocaleString()} row${result.rowCount === 1 ? '' : 's'} in ${result.ms} ms (browser-side)`;
      renderTable(results, result);
    } catch (e) {
      results.innerHTML = `<div class="nw-lab-results-error">Query failed: ${escapeHtml(e instanceof Error ? e.message : String(e))}</div>`;
      noteEl.textContent = `Failed after ${Math.round(performance.now() - t0)} ms`;
    } finally {
      runBtn.disabled = false;
    }
  });

  chartBtn.addEventListener('click', async () => {
    if (!lastResult) return;
    const hint = activeTemplate?.chart;
    const kind = hint?.kind ?? 'line';
    const x = hint?.x ?? lastResult.columns[0];
    const y = hint?.y ?? lastResult.columns[1] ?? lastResult.columns[0];
    const { renderChart } = await import('../lab/chart.ts');
    results.innerHTML = '';
    const chartMount = createElement('div', { className: 'nw-lab-chart-mount' });
    results.appendChild(chartMount);
    renderChart(chartMount, { kind, columns: lastResult.columns, rows: lastResult.rows, x, y });
    // Add a "← Back to table" button
    const back = createElement('button', { className: 'nw-lab-btn' });
    back.textContent = '← Back to table';
    back.addEventListener('click', () => renderTable(results, lastResult!));
    results.appendChild(back);
  });

  shareBtn.addEventListener('click', async () => {
    const encoded = encodeShare(sqlEl.value);
    const url = `${window.location.origin}/#/lab?sql=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = '✓ Copied';
      setTimeout(() => (shareBtn.textContent = '🔗 Copy share URL'), 2000);
    } catch {
      shareBtn.textContent = url;
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(sqlEl.value);
      copyBtn.textContent = '✓ SQL copied';
      setTimeout(() => (copyBtn.textContent = '⎘ Copy SQL'), 2000);
    } catch {
      /* swallow */
    }
  });

  // Keyboard shortcuts
  sqlEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runBtn.click();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      shareBtn.click();
    }
  });
}

function canChart(result: QueryRowsResult, tpl: NotebookTemplate | null): boolean {
  if (tpl?.chart) return true;
  // Auto-detect: at least 2 columns and column 2 is numeric
  if (result.columns.length < 2) return false;
  const sample = result.rows[0]?.[1];
  return typeof sample === 'number' || (!Number.isNaN(Number(sample)) && sample != null);
}

function renderTable(mount: HTMLElement, result: QueryRowsResult): void {
  mount.innerHTML = '';
  if (result.rowCount === 0) {
    mount.innerHTML = `<div class="nw-lab-results-empty">No rows returned.</div>`;
    return;
  }
  const table = document.createElement('table');
  table.className = 'nw-lab-table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const c of result.columns) {
    const th = document.createElement('th');
    th.textContent = c;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of result.rows.slice(0, 500)) {
    const tr = document.createElement('tr');
    for (const v of r) {
      const td = document.createElement('td');
      td.textContent = v == null ? '' : typeof v === 'number' ? Number(v).toString() : String(v);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  mount.appendChild(table);
  if (result.rows.length > 500) {
    const truncated = createElement('p', { className: 'nw-lab-trunc-note' });
    truncated.textContent = `Showing first 500 of ${result.rowCount.toLocaleString()} rows. Refine your query to see more.`;
    mount.appendChild(truncated);
  }
}

function readShared(): string | null {
  const hash = window.location.hash;
  const idx = hash.indexOf('?');
  if (idx < 0) return null;
  const params = new URLSearchParams(hash.slice(idx + 1));
  const encoded = params.get('sql');
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function encodeShare(sql: string): string {
  return encodeURIComponent(sql);
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nw-lab-page {
      background: var(--color-surface, #050505);
      color: var(--color-text, #e0e0e0);
      min-height: 100vh;
    }
    .nw-lab-wrap { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; }

    .nw-lab-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      margin-bottom: 2rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      letter-spacing: 0.06em;
    }
    .nw-lab-back, .nw-lab-nav-links a { color: var(--color-text-muted, #888); text-decoration: none; }
    .nw-lab-nav-links a { margin-left: 1.25rem; }
    .nw-lab-back:hover, .nw-lab-nav-links a:hover { color: var(--color-accent, #ff6600); }

    .nw-lab-hero { margin-bottom: 2.25rem; }
    .nw-lab-eyebrow {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--color-accent, #ff6600); margin-bottom: 0.5rem;
    }
    .nw-lab-title {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: clamp(2rem, 4.5vw, 3rem); line-height: 1.05;
      margin: 0 0 0.75rem; color: var(--color-text, #f4f4f4); letter-spacing: -0.01em;
    }
    .nw-lab-blurb {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1.05rem; line-height: 1.6; max-width: 62ch;
      color: var(--color-text, #c8c8c8); margin: 0 0 1rem;
    }
    .nw-lab-status {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem; color: var(--color-text-muted, #888);
      padding: 0.45rem 0.75rem; border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 3px; display: inline-block;
    }

    .nw-lab-section-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--color-accent, #ff6600); margin: 1.75rem 0 0.5rem;
    }

    .nw-lab-templates { margin-bottom: 1.25rem; }
    .nw-lab-template-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 0.75rem;
    }
    .nw-lab-template-btn {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      border-left: 2px solid var(--color-accent, #ff6600);
      color: inherit;
      cursor: pointer;
      text-align: left;
      padding: 0.85rem 1rem;
      border-radius: 3px;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-family: inherit;
      transition: border-color 0.15s;
    }
    .nw-lab-template-btn:hover { border-color: var(--color-accent, #ff6600); }
    .nw-lab-template-btn strong {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1rem; color: var(--color-text, #f0f0f0);
    }
    .nw-lab-template-btn span {
      font-size: 0.78rem;
      color: var(--color-text-muted, #888);
    }

    .nw-lab-editor { margin-bottom: 1.5rem; }
    .nw-lab-sql {
      width: 100%; min-height: 140px;
      background: #0a0a0a;
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #2a2a2a);
      border-left: 2px solid var(--color-accent, #ff6600);
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      padding: 0.85rem 1rem;
      resize: vertical;
      box-sizing: border-box;
    }
    .nw-lab-actions {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.65rem;
      margin-top: 0.75rem;
    }
    .nw-lab-btn {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      color: var(--color-text, #e0e0e0);
      padding: 0.5rem 0.95rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      border-radius: 3px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }
    .nw-lab-btn:hover:not(:disabled) {
      border-color: var(--color-accent, #ff6600);
      color: var(--color-accent, #ff6600);
    }
    .nw-lab-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .nw-lab-btn-primary {
      background: var(--color-accent, #ff6600);
      color: #050505;
      border-color: var(--color-accent, #ff6600);
      font-weight: 700;
    }
    .nw-lab-btn-primary:hover:not(:disabled) {
      background: #ff7d22;
      color: #050505;
      border-color: #ff7d22;
    }
    .nw-lab-action-note {
      font-size: 0.72rem;
      color: var(--color-text-muted, #888);
      font-style: italic;
    }

    .nw-lab-results {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 4px;
      padding: 1rem 1.1rem;
      min-height: 240px;
      overflow-x: auto;
    }
    .nw-lab-results-empty, .nw-lab-results-loading {
      font-family: 'JetBrains Mono', monospace;
      color: var(--color-text-muted, #888);
      padding: 3rem 0;
      text-align: center;
    }
    .nw-lab-results-loading {
      animation: nw-lab-pulse 1.6s ease-in-out infinite;
    }
    @keyframes nw-lab-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.55; }
    }
    .nw-lab-hotkey {
      display: inline-block;
      margin-top: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      letter-spacing: 0.08em;
      color: var(--color-text-muted, #555);
    }
    .nw-lab-results-error {
      font-family: 'JetBrains Mono', monospace;
      color: #dc2626;
      padding: 1rem;
      white-space: pre-wrap;
    }
    .nw-lab-table {
      width: 100%;
      border-collapse: collapse;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
    }
    .nw-lab-table th {
      text-align: left;
      padding: 0.45rem 0.65rem;
      color: var(--color-accent, #ff6600);
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      font-size: 0.7rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .nw-lab-table td {
      padding: 0.45rem 0.65rem;
      border-bottom: 1px solid rgba(42, 42, 42, 0.5);
      color: var(--color-text, #ddd);
      font-variant-numeric: tabular-nums;
    }
    .nw-lab-table tbody tr:nth-child(even) td {
      background: rgba(255, 255, 255, 0.015);
    }
    .nw-lab-table tbody tr:hover td {
      background: rgba(255, 102, 0, 0.06);
    }
    .nw-lab-trunc-note {
      color: var(--color-text-muted, #888);
      font-style: italic;
      font-size: 0.75rem;
      margin-top: 0.85rem;
    }
    .nw-lab-chart-mount { margin-bottom: 1rem; }
  `;
  document.head.appendChild(style);
}
