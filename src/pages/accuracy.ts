/**
 * Prediction Accuracy Dashboard — the trust marketing page.
 *
 * Public at /#/accuracy. Shows NexusWatch's prediction accuracy with
 * full numeric transparency: predicted vs actual CII scores, MAE,
 * calibration by confidence bin, weekly trend, biggest misses.
 *
 * "We publish our track record. They don't."
 */

import '../styles/dossier-public.css';
import { createElement } from '../utils/dom.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Overview {
  total_predictions: number;
  scored: number;
  pending: number;
  accurate: number;
  close: number;
  miss: number;
  accuracy_rate: number | null;
  mean_abs_error: number | null;
  median_abs_error: number | null;
  days_active: number;
}

interface CalibrationBin {
  confidence: string;
  total: number;
  mean_delta: number | null;
  accuracy_pct: number;
  within_10_pct: number;
}

interface WeeklyPoint {
  week: string;
  scored: number;
  mae: number | null;
  accuracy_pct: number;
}

interface MissEntry {
  country_code: string;
  country_name: string;
  date: string;
  predicted: number | null;
  actual: number | null;
  delta: number | null;
  rationale: string | null;
}

interface CountryEntry {
  country_code: string;
  country_name: string;
  total: number;
  scored: number;
  mae: number | null;
  accuracy_pct: number;
  avg_predicted: number | null;
  avg_actual: number | null;
}

interface AccuracyData {
  overview: Overview;
  calibration: CalibrationBin[];
  weekly_trend: WeeklyPoint[];
  biggest_misses: MissEntry[];
  countries: CountryEntry[];
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

// Dossier palette
const ORANGE = '#ff6600';
const GREEN = '#1f7a4c';
const YELLOW = '#c9a86b';
const RED = '#b8341c';
const DIM = '#9ca3af';
const TEXT = '#12161c';
const SURFACE = '#f8f7f4';
const CARD = '#ffffff';
const BORDER = '#e5e0d4';
const NAVY = '#1b2a4a';
const GOLD_SOFT = '#e5d8b6';

function maeColor(mae: number | null): string {
  if (mae == null) return DIM;
  if (mae < 3) return GREEN;
  if (mae < 5) return YELLOW;
  if (mae < 10) return ORANGE;
  return RED;
}

function accColor(pct: number | null): string {
  if (pct == null) return DIM;
  if (pct >= 75) return GREEN;
  if (pct >= 50) return YELLOW;
  return RED;
}

// ---------------------------------------------------------------------------
// Page render
// ---------------------------------------------------------------------------

export async function renderAccuracyPage(container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  container.className = 'nw-accuracy-page nw-dossier';

  // Inject scoped styles
  injectStyles();

  // Header
  const header = createElement('header', { className: 'acc-header' });
  header.innerHTML = `
    <div class="acc-header-left">
      <a href="#/intel" class="acc-back">← INTEL MAP</a>
      <h1 class="acc-title" style="font-family: 'Instrument Serif', Georgia, serif;">Prediction Accuracy Ledger</h1>
      <p class="acc-subtitle">Radical transparency — every prediction we made, including the ones we got wrong.</p>
    </div>
    <div class="acc-header-badge">
      <span class="acc-badge-label">PUBLIC</span>
      <span class="acc-badge-text">No login required</span>
    </div>
  `;
  container.appendChild(header);

  // Main content area
  const main = createElement('main', { className: 'acc-main' });
  main.innerHTML = '<div class="acc-loading"><span class="acc-spinner"></span> Loading accuracy data...</div>';
  container.appendChild(main);

  // Fetch data
  let data: AccuracyData;
  try {
    const res = await fetch('/api/accuracy/stats');
    if (!res.ok) throw new Error(`${res.status}`);
    data = await res.json();
  } catch {
    data = {
      overview: {
        total_predictions: 0,
        scored: 0,
        pending: 0,
        accurate: 0,
        close: 0,
        miss: 0,
        accuracy_rate: null,
        mean_abs_error: null,
        median_abs_error: null,
        days_active: 0,
      },
      calibration: [],
      weekly_trend: [],
      biggest_misses: [],
      countries: [],
    };
  }

  main.innerHTML = '';

  if (data.overview.total_predictions === 0) {
    renderEmptyState(main);
  } else {
    renderOverview(main, data.overview);
    renderCalibration(main, data.calibration);
    renderWeeklyTrend(main, data.weekly_trend);
    renderBiggestMisses(main, data.biggest_misses);
    renderCountries(main, data.countries);
  }

  renderMethodology(main);
  renderCommitment(container);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function renderEmptyState(main: HTMLElement): void {
  const section = createElement('section', { className: 'acc-empty' });
  section.innerHTML = `
    <div class="acc-empty-icon">◷</div>
    <h2>Prediction data accumulating</h2>
    <p>
      NexusWatch records a CII prediction for every tracked country, every day.
      After 7 days, each prediction is scored against actual outcomes.
    </p>
    <div class="acc-empty-timeline">
      <div class="acc-timeline-step">
        <span class="acc-step-num">1</span>
        <span>Daily CII snapshots recorded</span>
      </div>
      <div class="acc-timeline-arrow">→</div>
      <div class="acc-timeline-step">
        <span class="acc-step-num">2</span>
        <span>7-day predictions logged</span>
      </div>
      <div class="acc-timeline-arrow">→</div>
      <div class="acc-timeline-step">
        <span class="acc-step-num">3</span>
        <span>Outcomes scored automatically</span>
      </div>
      <div class="acc-timeline-arrow">→</div>
      <div class="acc-timeline-step acc-step-active">
        <span class="acc-step-num">4</span>
        <span>Results published here</span>
      </div>
    </div>
    <p class="acc-empty-note">
      When data is available, this page will show every prediction — including the ones we got wrong.
      That's the point.
    </p>
  `;
  main.appendChild(section);
}

function renderOverview(main: HTMLElement, o: Overview): void {
  const section = createElement('section', { className: 'acc-section' });
  const maeVal = o.mean_abs_error != null ? o.mean_abs_error.toFixed(1) : '—';
  const medVal = o.median_abs_error != null ? o.median_abs_error.toFixed(1) : '—';
  const accVal = o.accuracy_rate != null ? o.accuracy_rate.toFixed(1) + '%' : '—';

  section.innerHTML = `
    <div class="acc-stat-grid">
      <div class="acc-stat-card acc-stat-hero">
        <div class="acc-stat-value" style="color: ${accColor(o.accuracy_rate)}">${accVal}</div>
        <div class="acc-stat-label">ACCURACY RATE</div>
        <div class="acc-stat-note">Predictions within 5 CII points</div>
      </div>
      <div class="acc-stat-card">
        <div class="acc-stat-value" style="color: ${maeColor(o.mean_abs_error)}">${maeVal}</div>
        <div class="acc-stat-label">MEAN ABS ERROR</div>
        <div class="acc-stat-note">CII points (lower is better)</div>
      </div>
      <div class="acc-stat-card">
        <div class="acc-stat-value">${medVal}</div>
        <div class="acc-stat-label">MEDIAN ABS ERROR</div>
        <div class="acc-stat-note">50th percentile</div>
      </div>
      <div class="acc-stat-card">
        <div class="acc-stat-value">${o.scored.toLocaleString()}</div>
        <div class="acc-stat-label">SCORED</div>
        <div class="acc-stat-note">${o.pending} pending</div>
      </div>
      <div class="acc-stat-card">
        <div class="acc-stat-value" style="color: ${GREEN}">${o.accurate}</div>
        <div class="acc-stat-label">ACCURATE</div>
        <div class="acc-stat-note">&lt; 5 pts error</div>
      </div>
      <div class="acc-stat-card">
        <div class="acc-stat-value" style="color: ${YELLOW}">${o.close}</div>
        <div class="acc-stat-label">CLOSE</div>
        <div class="acc-stat-note">5–10 pts error</div>
      </div>
      <div class="acc-stat-card">
        <div class="acc-stat-value" style="color: ${RED}">${o.miss}</div>
        <div class="acc-stat-label">MISS</div>
        <div class="acc-stat-note">&gt; 10 pts error</div>
      </div>
      <div class="acc-stat-card">
        <div class="acc-stat-value">${o.days_active}d</div>
        <div class="acc-stat-label">DAYS ACTIVE</div>
        <div class="acc-stat-note">Since first prediction</div>
      </div>
    </div>
  `;
  main.appendChild(section);
}

function renderCalibration(main: HTMLElement, bins: CalibrationBin[]): void {
  if (bins.length === 0) return;

  const section = createElement('section', { className: 'acc-section' });
  section.innerHTML = `
    <h2 class="acc-section-title">CONFIDENCE CALIBRATION</h2>
    <p class="acc-section-desc">Are our confidence labels meaningful? High-confidence predictions should have lower error.</p>
    <div class="acc-calibration-grid">
      ${bins
        .map((b) => {
          const delta = b.mean_delta != null ? b.mean_delta.toFixed(1) : '—';
          return `
          <div class="acc-cal-card">
            <div class="acc-cal-badge acc-cal-${b.confidence || 'unknown'}">${(b.confidence || 'N/A').toUpperCase()}</div>
            <div class="acc-cal-row">
              <span class="acc-cal-label">Predictions</span>
              <span class="acc-cal-value">${b.total}</span>
            </div>
            <div class="acc-cal-row">
              <span class="acc-cal-label">Mean error</span>
              <span class="acc-cal-value" style="color: ${maeColor(b.mean_delta)}">${delta} pts</span>
            </div>
            <div class="acc-cal-row">
              <span class="acc-cal-label">Accurate (&lt;5)</span>
              <span class="acc-cal-value" style="color: ${accColor(b.accuracy_pct)}">${b.accuracy_pct}%</span>
            </div>
            <div class="acc-cal-row">
              <span class="acc-cal-label">Within 10</span>
              <span class="acc-cal-value">${b.within_10_pct}%</span>
            </div>
          </div>`;
        })
        .join('')}
    </div>
  `;
  main.appendChild(section);
}

function renderWeeklyTrend(main: HTMLElement, weeks: WeeklyPoint[]): void {
  if (weeks.length < 2) return;

  const maxMAE = Math.max(...weeks.map((w) => w.mae ?? 0), 1);
  const barHeight = 80;

  const section = createElement('section', { className: 'acc-section' });
  section.innerHTML = `
    <h2 class="acc-section-title">WEEKLY TREND</h2>
    <p class="acc-section-desc">Mean absolute error by week — lower bars mean better predictions.</p>
    <div class="acc-trend-chart">
      ${weeks
        .map((w) => {
          const mae = w.mae ?? 0;
          const h = Math.max(4, (mae / maxMAE) * barHeight);
          const weekLabel = new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return `
          <div class="acc-trend-bar-wrap">
            <div class="acc-trend-bar" style="height: ${h}px; background: ${maeColor(mae)}"></div>
            <div class="acc-trend-mae">${mae.toFixed(1)}</div>
            <div class="acc-trend-week">${weekLabel}</div>
          </div>`;
        })
        .join('')}
    </div>
  `;
  main.appendChild(section);
}

function renderBiggestMisses(main: HTMLElement, misses: MissEntry[]): void {
  if (misses.length === 0) return;

  const section = createElement('section', { className: 'acc-section' });
  section.innerHTML = `
    <h2 class="acc-section-title">BIGGEST MISSES</h2>
    <p class="acc-section-desc">Our worst predictions — transparency means showing these, not hiding them.</p>
    <table class="acc-table">
      <thead>
        <tr>
          <th>Country</th>
          <th>Date</th>
          <th>Predicted</th>
          <th>Actual</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        ${misses
          .map(
            (m) => `
          <tr>
            <td>${m.country_name}</td>
            <td class="acc-mono">${m.date || '—'}</td>
            <td class="acc-mono">${m.predicted != null ? m.predicted.toFixed(1) : '—'}</td>
            <td class="acc-mono">${m.actual != null ? m.actual.toFixed(1) : '—'}</td>
            <td class="acc-mono" style="color: ${RED}">+${m.delta != null ? m.delta.toFixed(1) : '—'}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
  main.appendChild(section);
}

function renderCountries(main: HTMLElement, countries: CountryEntry[]): void {
  if (countries.length === 0) return;

  const section = createElement('section', { className: 'acc-section' });
  section.innerHTML = `
    <h2 class="acc-section-title">COUNTRY-LEVEL ACCURACY</h2>
    <p class="acc-section-desc">Prediction performance broken down by country.</p>
    <table class="acc-table">
      <thead>
        <tr>
          <th>Country</th>
          <th>Scored</th>
          <th>MAE</th>
          <th>Accuracy</th>
          <th>Avg Predicted</th>
          <th>Avg Actual</th>
        </tr>
      </thead>
      <tbody>
        ${countries
          .map(
            (c) => `
          <tr>
            <td>${c.country_name}</td>
            <td class="acc-mono">${c.scored}</td>
            <td class="acc-mono" style="color: ${maeColor(c.mae)}">${c.mae != null ? c.mae.toFixed(1) : '—'}</td>
            <td class="acc-mono" style="color: ${accColor(c.accuracy_pct)}">${c.accuracy_pct}%</td>
            <td class="acc-mono">${c.avg_predicted != null ? c.avg_predicted.toFixed(1) : '—'}</td>
            <td class="acc-mono">${c.avg_actual != null ? c.avg_actual.toFixed(1) : '—'}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
  main.appendChild(section);
}

function renderMethodology(main: HTMLElement): void {
  const section = createElement('section', { className: 'acc-section acc-methodology' });
  section.innerHTML = `
    <h2 class="acc-section-title">METHODOLOGY</h2>
    <div class="acc-method-grid">
      <div class="acc-method-card">
        <h3>How predictions work</h3>
        <ul>
          <li>Every day, the CII engine records each country's current score</li>
          <li>A 7-day forecast is generated: 60% baseline + 40% trend continuation</li>
          <li>After 7 days, the actual CII score is compared to the prediction</li>
          <li>The absolute difference (delta) is the prediction error</li>
        </ul>
      </div>
      <div class="acc-method-card">
        <h3>Scoring thresholds</h3>
        <ul>
          <li><span style="color:${GREEN}">Accurate</span> — absolute error &lt; 5 CII points</li>
          <li><span style="color:${YELLOW}">Close</span> — error between 5 and 10 points</li>
          <li><span style="color:${RED}">Miss</span> — error &gt; 10 points</li>
          <li>Accuracy rate = (accurate + 0.5 × close) / scored</li>
        </ul>
      </div>
      <div class="acc-method-card">
        <h3>Honest limitations</h3>
        <ul>
          <li>Scoring is automated — no human cherry-picking</li>
          <li>CII moves slowly for stable countries — high accuracy on those is easy</li>
          <li>The hard test is crisis countries — watch the "Biggest Misses" section</li>
          <li>All data is queryable via the <a href="#/apidocs" style="color:${ORANGE}">public API</a></li>
        </ul>
      </div>
    </div>
  `;
  main.appendChild(section);
}

function renderCommitment(container: HTMLElement): void {
  const footer = createElement('footer', { className: 'acc-footer' });
  footer.innerHTML = `
    <p>
      <strong>Our commitment:</strong> we will never hide a missed prediction.
      If accuracy drops below 60%, we publish the analysis of why.
      If it rises above 85%, we publish the methodology that got us there.
      Trust is built through transparency, not omission.
    </p>
    <p class="acc-footer-links">
      <a href="#/methodology">CII Methodology</a>
      <span class="acc-footer-sep">·</span>
      <a href="#/apidocs">API Documentation</a>
      <span class="acc-footer-sep">·</span>
      <a href="#/intel">Intel Map</a>
    </p>
  `;
  container.appendChild(footer);
}

// ---------------------------------------------------------------------------
// Styles (injected once)
// ---------------------------------------------------------------------------

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .nw-accuracy-page {
      background: ${SURFACE};
      color: ${TEXT};
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      padding: 0;
    }

    /* Header */
    .acc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 2rem 3rem 1.5rem;
      border-bottom: 1px solid ${BORDER};
    }
    .acc-back {
      color: ${DIM};
      text-decoration: none;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .acc-back:hover { color: ${NAVY}; }
    .acc-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      margin: 0.5rem 0 0.25rem;
      color: ${TEXT};
    }
    .acc-subtitle {
      color: ${DIM};
      font-size: 0.8rem;
      margin: 0;
    }
    .acc-header-badge {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.25rem;
    }
    .acc-badge-label {
      background: ${NAVY};
      color: ${SURFACE};
      padding: 0.15rem 0.5rem;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      border-radius: 2px;
    }
    .acc-badge-text { color: ${DIM}; font-size: 0.7rem; }

    /* Main */
    .acc-main { padding: 2rem 3rem; max-width: 1200px; margin: 0 auto; }
    .acc-loading {
      text-align: center;
      padding: 4rem 0;
      color: ${DIM};
    }
    .acc-spinner {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid ${BORDER};
      border-top-color: ${NAVY};
      border-radius: 50%;
      animation: acc-spin 0.8s linear infinite;
    }
    @keyframes acc-spin { to { transform: rotate(360deg); } }

    /* Sections */
    .acc-section { margin-bottom: 3rem; }
    .acc-section-title {
      font-size: 0.8rem;
      letter-spacing: 0.15em;
      color: ${NAVY};
      margin: 0 0 0.5rem;
      font-weight: 600;
    }
    .acc-section-desc {
      color: ${DIM};
      font-size: 0.75rem;
      margin: 0 0 1.5rem;
    }

    /* Stat grid */
    .acc-stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
    }
    .acc-stat-card {
      background: ${CARD};
      border: 1px solid ${BORDER};
      border-radius: 4px;
      padding: 1.25rem 1rem;
      text-align: center;
    }
    .acc-stat-hero {
      grid-column: span 1;
      border-color: ${GOLD_SOFT};
    }
    .acc-stat-value {
      font-size: 1.8rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 0.5rem;
    }
    .acc-stat-label {
      font-size: 0.65rem;
      letter-spacing: 0.12em;
      color: ${DIM};
      text-transform: uppercase;
    }
    .acc-stat-note {
      font-size: 0.6rem;
      color: #444;
      margin-top: 0.25rem;
    }

    /* Calibration */
    .acc-calibration-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .acc-cal-card {
      background: ${CARD};
      border: 1px solid ${BORDER};
      border-radius: 4px;
      padding: 1rem;
    }
    .acc-cal-badge {
      display: inline-block;
      padding: 0.15rem 0.6rem;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      border-radius: 2px;
      margin-bottom: 0.75rem;
    }
    .acc-cal-high { background: ${GREEN}22; color: ${GREEN}; border: 1px solid ${GREEN}44; }
    .acc-cal-medium { background: ${YELLOW}22; color: ${YELLOW}; border: 1px solid ${YELLOW}44; }
    .acc-cal-low { background: ${RED}22; color: ${RED}; border: 1px solid ${RED}44; }
    .acc-cal-unknown { background: ${DIM}22; color: ${DIM}; border: 1px solid ${DIM}44; }
    .acc-cal-row {
      display: flex;
      justify-content: space-between;
      padding: 0.3rem 0;
      font-size: 0.75rem;
      border-bottom: 1px solid ${BORDER};
    }
    .acc-cal-row:last-child { border-bottom: none; }
    .acc-cal-label { color: ${DIM}; }
    .acc-cal-value { font-weight: 600; }

    /* Trend chart */
    .acc-trend-chart {
      display: flex;
      align-items: flex-end;
      gap: 1rem;
      padding: 1rem 0;
      min-height: 120px;
    }
    .acc-trend-bar-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
    }
    .acc-trend-bar {
      width: 100%;
      max-width: 60px;
      border-radius: 2px 2px 0 0;
      transition: height 0.3s;
    }
    .acc-trend-mae { font-size: 0.65rem; color: ${DIM}; }
    .acc-trend-week { font-size: 0.6rem; color: #444; }

    /* Tables */
    .acc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.75rem;
    }
    .acc-table th {
      text-align: left;
      padding: 0.5rem 0.75rem;
      font-size: 0.65rem;
      letter-spacing: 0.1em;
      color: ${DIM};
      text-transform: uppercase;
      border-bottom: 1px solid ${BORDER};
    }
    .acc-table td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid ${BORDER}88;
    }
    .acc-table tr:hover td { background: #ffffff06; }
    .acc-mono { font-variant-numeric: tabular-nums; }

    /* Methodology */
    .acc-method-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
    }
    .acc-method-card {
      background: ${CARD};
      border: 1px solid ${BORDER};
      border-radius: 4px;
      padding: 1.25rem;
    }
    .acc-method-card h3 {
      font-size: 0.8rem;
      color: ${TEXT};
      margin: 0 0 0.75rem;
      letter-spacing: 0.05em;
    }
    .acc-method-card ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .acc-method-card li {
      padding: 0.3rem 0;
      font-size: 0.75rem;
      color: ${DIM};
      border-bottom: 1px solid ${BORDER}44;
    }
    .acc-method-card li:last-child { border-bottom: none; }
    .acc-method-card a { text-decoration: none; }
    .acc-method-card a:hover { text-decoration: underline; }

    /* Empty state */
    .acc-empty {
      text-align: center;
      padding: 3rem 0;
    }
    .acc-empty-icon {
      font-size: 3rem;
      color: ${NAVY};
      margin-bottom: 1rem;
    }
    .acc-empty h2 {
      font-size: 1.1rem;
      margin: 0 0 0.75rem;
      color: ${TEXT};
    }
    .acc-empty p {
      color: ${DIM};
      font-size: 0.8rem;
      max-width: 600px;
      margin: 0 auto 1.5rem;
    }
    .acc-empty-timeline {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin: 2rem 0;
      flex-wrap: wrap;
    }
    .acc-timeline-step {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: ${CARD};
      border: 1px solid ${BORDER};
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.75rem;
      color: ${DIM};
    }
    .acc-step-active {
      border-color: ${ORANGE}66;
      color: ${NAVY};
    }
    .acc-step-num {
      background: ${BORDER};
      color: ${TEXT};
      width: 20px; height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.65rem;
      font-weight: 700;
    }
    .acc-step-active .acc-step-num {
      background: ${NAVY};
      color: ${SURFACE};
    }
    .acc-timeline-arrow { color: ${BORDER}; font-size: 1.2rem; }
    .acc-empty-note { font-style: italic; color: #555; }

    /* Footer */
    .acc-footer {
      border-top: 1px solid ${BORDER};
      padding: 2rem 3rem;
      text-align: center;
    }
    .acc-footer p {
      color: ${DIM};
      font-size: 0.75rem;
      max-width: 700px;
      margin: 0 auto 0.75rem;
    }
    .acc-footer strong { color: ${TEXT}; }
    .acc-footer-links { margin-top: 1rem !important; }
    .acc-footer-links a {
      color: ${NAVY};
      text-decoration: none;
      font-size: 0.7rem;
      letter-spacing: 0.05em;
    }
    .acc-footer-links a:hover { text-decoration: underline; }
    .acc-footer-sep { color: ${BORDER}; margin: 0 0.5rem; }

    /* Responsive */
    @media (max-width: 768px) {
      .acc-header { padding: 1.5rem 1rem 1rem; flex-direction: column; gap: 1rem; }
      .acc-main { padding: 1.5rem 1rem; }
      .acc-stat-grid { grid-template-columns: repeat(2, 1fr); }
      .acc-footer { padding: 1.5rem 1rem; }
      .acc-header-badge { align-items: flex-start; }
    }
  `;
  document.head.appendChild(style);
}
