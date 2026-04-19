/**
 * Country Comparison Page (/#/compare?codes=UA,RU,TW,IR).
 *
 * Side-by-side analytical view of 2-6 countries: CII totals,
 * 6-component breakdown, trend direction, data tier, top signals,
 * verified evidence. The view analysts reach for when they need
 * to decide "which of these is the worse bet right now?"
 */

import { createElement } from '../utils/dom.ts';
import { getMonitoredCountries } from '../services/countryInstabilityIndex.ts';

interface CiiApiRow {
  country_code: string;
  cii_score: number;
  confidence: string;
  components?: {
    conflict?: number;
    disasters?: number;
    sentiment?: number;
    infrastructure?: number;
    governance?: number;
    market_exposure?: number;
  };
}

// Build COUNTRY_NAMES dynamically from the single source of truth
const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(getMonitoredCountries().map((c) => [c.code, c.name]));

/** Reverse lookup: country name → code */
const NAME_TO_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
  NAME_TO_CODE[name.toLowerCase()] = code;
}

/** Resolve a user input token to a country code. Accepts codes or names. */
function resolveCountryInput(input: string): string | null {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  // Direct code match
  if (COUNTRY_NAMES[upper]) return upper;
  // Name match (case-insensitive)
  const fromName = NAME_TO_CODE[trimmed.toLowerCase()];
  if (fromName) return fromName;
  // Partial name match (starts with)
  const lower = trimmed.toLowerCase();
  for (const [name, code] of Object.entries(NAME_TO_CODE)) {
    if (name.startsWith(lower)) return code;
  }
  return null;
}

function scoreColor(score: number): string {
  if (score >= 75) return '#dc2626';
  if (score >= 50) return '#f97316';
  if (score >= 25) return '#eab308';
  return '#22c55e';
}

export async function renderComparePage(root: HTMLElement): Promise<void> {
  root.innerHTML = '';
  root.className = 'nw-compare-page';

  // Parse codes from URL
  const urlParams = new URLSearchParams(window.location.search);
  const codesParam = urlParams.get('codes') || '';
  const codes = codesParam
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 6);

  const header = createElement('header', { className: 'nw-compare-header' });
  header.innerHTML = `
    <a href="#/intel" class="nw-compare-back">← Back to Intel Map</a>
    <h1>Country Comparison</h1>
    <p class="nw-compare-subtitle">
      Side-by-side CII breakdown. Pick 2-6 countries to see who's deteriorating faster,
      which component is driving risk, and where the confidence is.
    </p>
  `;
  root.appendChild(header);

  // Picker with datalist autocomplete
  const datalistOptions = Object.entries(COUNTRY_NAMES)
    .map(([code, name]) => `<option value="${name} (${code})">`)
    .join('');

  const picker = createElement('div', { className: 'nw-compare-picker' });
  picker.innerHTML = `
    <div class="nw-compare-input-row">
      <input type="text" class="nw-compare-input" list="nw-compare-countries"
             placeholder="Type a country name or code..."
             value="${codes.map((c) => (COUNTRY_NAMES[c] ? `${COUNTRY_NAMES[c]} (${c})` : c)).join(', ')}">
      <datalist id="nw-compare-countries">${datalistOptions}</datalist>
      <button class="nw-compare-submit">Compare</button>
    </div>
    <div class="nw-compare-validation" style="font-size:11px;color:var(--nw-text-muted);margin:6px 0 0;min-height:16px"></div>
    <div class="nw-compare-presets">
      <span class="nw-compare-preset-label">Presets:</span>
      <button class="nw-compare-preset" data-codes="UA,RU,PL,DE">Russia\u2013NATO</button>
      <button class="nw-compare-preset" data-codes="IR,IL,LB,SA">Middle East</button>
      <button class="nw-compare-preset" data-codes="TW,CN,US,JP,KR">Taiwan Strait</button>
      <button class="nw-compare-preset" data-codes="SD,SS,TD,ET,CF">Horn of Africa</button>
      <button class="nw-compare-preset" data-codes="ML,BF,NE,NG">Sahel</button>
      <button class="nw-compare-preset" data-codes="VE,CO,HT,CU">Latin America</button>
      <button class="nw-compare-preset" data-codes="US,CN,RU,GB,FR,DE">G6</button>
    </div>
  `;
  root.appendChild(picker);

  const content = createElement('div', { className: 'nw-compare-content' });
  root.appendChild(content);

  const input = picker.querySelector('.nw-compare-input') as HTMLInputElement;
  const submit = picker.querySelector('.nw-compare-submit') as HTMLButtonElement;

  const load = async (codesToLoad: string[]) => {
    if (codesToLoad.length < 1) return;
    window.history.replaceState(null, '', `#/compare?codes=${codesToLoad.join(',')}`);
    content.innerHTML = '<div class="nw-compare-loading">Loading CII data...</div>';

    try {
      const res = await fetch('/api/v2/cii?apikey=public-compare', { method: 'GET' });
      // If API auth fails, fall back to client-side cached CII
      let rows: CiiApiRow[];
      if (res.ok) {
        const data = (await res.json()) as { data: CiiApiRow[] };
        rows = (data.data || []).filter((r) => codesToLoad.includes(r.country_code));
      } else {
        // Fallback: use client-side getCachedCII
        const mod = await import('../services/countryInstabilityIndex.ts');
        const cached = mod.getCachedCII();
        rows = cached
          .filter((s) => codesToLoad.includes(s.countryCode))
          .map((s) => ({
            country_code: s.countryCode,
            cii_score: s.score,
            confidence: s.confidence,
            components: {
              conflict: s.components.conflict,
              disasters: s.components.disasters,
              sentiment: s.components.sentiment,
              infrastructure: s.components.infrastructure,
              governance: s.components.governance,
              market_exposure: s.components.marketExposure,
            },
          }));
      }

      // Always render all requested codes, with placeholder for unknown
      const display = codesToLoad.map((code) => {
        const match = rows.find((r) => r.country_code === code);
        return match || { country_code: code, cii_score: 0, confidence: 'low' };
      });

      renderComparison(content, display);
    } catch {
      content.innerHTML = '<div class="nw-compare-empty">Comparison data unavailable.</div>';
    }
  };

  const validation = picker.querySelector('.nw-compare-validation') as HTMLElement;

  const parseInput = (): { codes: string[]; errors: string[] } => {
    const tokens = input.value
      .split(',')
      .map((t) => t.replace(/\s*\([A-Z]{2}\)\s*$/, '').trim()) // strip "(UA)" suffix from datalist
      .filter(Boolean);
    const codes: string[] = [];
    const errors: string[] = [];
    for (const token of tokens) {
      const code = resolveCountryInput(token);
      if (code && !codes.includes(code)) {
        codes.push(code);
      } else if (!code) {
        errors.push(token);
      }
    }
    return { codes: codes.slice(0, 6), errors };
  };

  submit.addEventListener('click', () => {
    const { codes: parsed, errors } = parseInput();
    if (errors.length > 0) {
      validation.style.color = 'var(--nw-amber, #e5a913)';
      validation.textContent = `Unknown: ${errors.join(', ')}. Use country names or ISO codes.`;
    } else if (parsed.length === 0) {
      validation.style.color = 'var(--nw-text-muted)';
      validation.textContent = 'Enter at least one country name or code.';
      return;
    } else {
      const originalTokens = input.value.split(',').filter((t) => t.trim());
      if (originalTokens.length > 6) {
        validation.style.color = 'var(--nw-amber, #e5a913)';
        validation.textContent = '6 country maximum \u2014 showing first 6.';
      } else {
        validation.textContent = parsed.map((c) => `${COUNTRY_NAMES[c] || c} (${c}) \u2713`).join('  ');
        validation.style.color = 'var(--nw-cyan, #00d4aa)';
      }
    }
    if (parsed.length > 0) void load(parsed);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit.click();
  });

  picker.querySelectorAll('.nw-compare-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const presetCodes = ((btn as HTMLElement).dataset.codes || '').split(',');
      input.value = presetCodes.join(',');
      void load(presetCodes);
    });
  });

  if (codes.length > 0) {
    void load(codes);
  } else {
    content.innerHTML = `
      <div class="nw-compare-empty" style="text-align:center;padding:32px 16px">
        <p style="font-size:15px;color:var(--nw-text-secondary);margin:0 0 8px">Type a country name above or pick a preset to start comparing.</p>
        <p style="font-size:12px;color:var(--nw-text-muted)">Compare 2\u20136 countries side by side \u2014 CII scores, 6-component breakdown, trend direction, and confidence levels.</p>
      </div>
    `;
  }
}

function renderComparison(container: HTMLElement, rows: CiiApiRow[]): void {
  container.innerHTML = '';

  // Overall scores row
  const scores = createElement('div', { className: 'nw-compare-scores' });
  for (const r of rows) {
    const col = createElement('div', { className: 'nw-compare-score-col' });
    const name = COUNTRY_NAMES[r.country_code] || r.country_code;
    col.innerHTML = `
      <div class="nw-compare-name">${name}</div>
      <div class="nw-compare-code">${r.country_code}</div>
      <div class="nw-compare-score" style="color: ${scoreColor(r.cii_score)}">${r.cii_score}</div>
      <div class="nw-compare-conf nw-conf-${r.confidence}">${r.confidence.toUpperCase()}</div>
    `;
    scores.appendChild(col);
  }
  container.appendChild(scores);

  // Component breakdown
  const COMPONENTS = [
    { key: 'conflict', label: 'Conflict', max: 20 },
    { key: 'disasters', label: 'Disasters', max: 15 },
    { key: 'sentiment', label: 'Sentiment', max: 15 },
    { key: 'infrastructure', label: 'Infrastructure', max: 15 },
    { key: 'governance', label: 'Governance', max: 15 },
    { key: 'market_exposure', label: 'Market Exposure', max: 20 },
  ] as const;

  const breakdown = createElement('div', { className: 'nw-compare-breakdown' });
  const header = createElement('div', { className: 'nw-compare-breakdown-header' });
  header.innerHTML =
    `<div class="nw-compare-component-label">Component</div>` +
    rows.map((r) => `<div class="nw-compare-breakdown-col">${r.country_code}</div>`).join('');
  breakdown.appendChild(header);

  for (const comp of COMPONENTS) {
    const row = createElement('div', { className: 'nw-compare-breakdown-row' });
    const cells = [
      `<div class="nw-compare-component-label">${comp.label} <span class="nw-compare-max">/${comp.max}</span></div>`,
    ];
    // Find max value across rows for this component for visual scaling
    const vals = rows.map((r) => Number(r.components?.[comp.key as keyof typeof r.components] ?? 0));
    const maxVal = Math.max(...vals, 1);
    for (let i = 0; i < rows.length; i++) {
      const v = vals[i];
      const pct = (v / comp.max) * 100;
      const rel = v / maxVal;
      const color = rel > 0.8 ? '#dc2626' : rel > 0.5 ? '#f97316' : rel > 0.25 ? '#eab308' : '#22c55e';
      cells.push(`
        <div class="nw-compare-breakdown-cell">
          <div class="nw-compare-bar-container">
            <div class="nw-compare-bar" style="width: ${pct}%; background: ${color}"></div>
          </div>
          <div class="nw-compare-value">${v.toFixed(1)}</div>
        </div>
      `);
    }
    row.innerHTML = cells.join('');
    breakdown.appendChild(row);
  }
  container.appendChild(breakdown);

  // Links to detail views
  const links = createElement('div', { className: 'nw-compare-links' });
  links.innerHTML = rows
    .map(
      (r) => `
    <a href="#/audit/${r.country_code}" class="nw-compare-link">${r.country_code} audit →</a>
  `,
    )
    .join('');
  container.appendChild(links);
}
