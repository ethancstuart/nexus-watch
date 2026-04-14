/**
 * Prediction Accuracy Dashboard
 *
 * Public page at /#/accuracy showing NexusWatch's prediction accuracy
 * over time. "Learning in public" — radical transparency about what
 * we got right and wrong.
 *
 * This page IS the trust marketing. Show the accuracy, own the misses,
 * demonstrate improvement over time.
 */

import { createElement } from '../utils/dom.ts';

interface AccuracyStats {
  total_assessments: number;
  confirmed: number;
  partially_confirmed: number;
  not_confirmed: number;
  pending: number;
  accuracy_rate: number;
  days_active: number;
}

interface CountryAccuracy {
  country_code: string;
  country_name: string;
  total_predictions: number;
  avg_cii: number;
  accuracy_rate: number;
}

export async function renderAccuracyPage(container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  container.className = 'nw-accuracy-page';

  // Header
  const header = createElement('header', { className: 'nw-accuracy-header' });
  header.innerHTML = `
    <div class="nw-accuracy-title">
      <h1>Prediction Accuracy Ledger</h1>
      <p class="nw-accuracy-subtitle">Learning in public — here's what we got right and wrong.</p>
    </div>
    <a href="#/intel" class="nw-accuracy-back">← Back to Intel Map</a>
  `;
  container.appendChild(header);

  // Intro section
  const intro = createElement('section', { className: 'nw-accuracy-intro' });
  intro.innerHTML = `
    <p>
      Every daily brief records the CII score and confidence level for the top 30 risk countries.
      When outcomes become clear, we mark assessments as confirmed, partially confirmed, or not confirmed.
      This page publishes those numbers — including the ones that make us look bad.
    </p>
    <p class="nw-accuracy-callout">
      <strong>Why this exists:</strong> every geopolitical intelligence product shows you their best guesses.
      None of them show you which guesses were wrong. NexusWatch is the only one that tracks and publishes its
      accuracy over time — because if we're not willing to do that, you shouldn't trust us.
    </p>
  `;
  container.appendChild(intro);

  // Stats grid
  const statsSection = createElement('section', { className: 'nw-accuracy-stats' });
  statsSection.innerHTML = '<div class="nw-accuracy-loading">Loading accuracy data...</div>';
  container.appendChild(statsSection);

  // Try to fetch real stats
  try {
    const res = await fetch('/api/accuracy/stats');
    if (res.ok) {
      const stats = (await res.json()) as { stats: AccuracyStats; countries: CountryAccuracy[] };
      renderStats(statsSection, stats.stats);
      renderCountryBreakdown(container, stats.countries);
    } else {
      renderEmptyState(statsSection);
    }
  } catch {
    renderEmptyState(statsSection);
  }

  // Methodology
  const methodology = createElement('section', { className: 'nw-accuracy-methodology' });
  methodology.innerHTML = `
    <h2>Methodology</h2>
    <div class="nw-accuracy-method-grid">
      <div class="nw-accuracy-method-card">
        <h3>What we track</h3>
        <ul>
          <li>Daily CII score snapshots for top 30 risk countries</li>
          <li>AI-generated escalation assessments from daily briefs</li>
          <li>"Watch for X" predictions with stated timeframes</li>
          <li>Confidence levels on every prediction (HIGH/MEDIUM/LOW)</li>
        </ul>
      </div>
      <div class="nw-accuracy-method-card">
        <h3>How we score outcomes</h3>
        <ul>
          <li><strong>Confirmed</strong> — prediction materialized as described</li>
          <li><strong>Partially confirmed</strong> — directionally correct, magnitude off</li>
          <li><strong>Not confirmed</strong> — prediction did not materialize</li>
          <li><strong>Pending</strong> — insufficient time has elapsed to score</li>
        </ul>
      </div>
      <div class="nw-accuracy-method-card">
        <h3>Honest limitations</h3>
        <ul>
          <li>Scoring is done by the NexusWatch team, not an external auditor</li>
          <li>We have 86 countries but depth varies by tier (core/extended/monitor)</li>
          <li>Some outcomes take months to score — patience required</li>
          <li>We publish wrong answers alongside right ones — that's the point</li>
        </ul>
      </div>
    </div>
  `;
  container.appendChild(methodology);

  // Philosophy footer
  const footer = createElement('footer', { className: 'nw-accuracy-footer' });
  footer.innerHTML = `
    <p>
      <strong>Our commitment:</strong> we will never hide a missed prediction. If our accuracy drops below 60%,
      we will publish the analysis of why. If it rises above 85%, we will publish the methodology that got us there.
      Trust is built through transparency, not omission.
    </p>
  `;
  container.appendChild(footer);
}

function renderStats(section: HTMLElement, stats: AccuracyStats): void {
  section.innerHTML = '';

  const grid = createElement('div', { className: 'nw-accuracy-stat-grid' });

  const makeStatCard = (value: string, label: string, color = '#e0e0e0') => {
    const card = createElement('div', { className: 'nw-accuracy-stat-card' });
    card.innerHTML = `
      <div class="nw-accuracy-stat-value" style="color: ${color}">${value}</div>
      <div class="nw-accuracy-stat-label">${label}</div>
    `;
    return card;
  };

  const accuracyColor = stats.accuracy_rate >= 75 ? '#22c55e' : stats.accuracy_rate >= 50 ? '#eab308' : '#f97316';

  grid.appendChild(makeStatCard(`${stats.accuracy_rate.toFixed(1)}%`, 'OVERALL ACCURACY', accuracyColor));
  grid.appendChild(makeStatCard(String(stats.total_assessments), 'TOTAL ASSESSMENTS'));
  grid.appendChild(makeStatCard(String(stats.confirmed), 'CONFIRMED', '#22c55e'));
  grid.appendChild(makeStatCard(String(stats.not_confirmed), 'NOT CONFIRMED', '#dc2626'));
  grid.appendChild(makeStatCard(String(stats.pending), 'PENDING'));
  grid.appendChild(makeStatCard(`${stats.days_active}d`, 'DAYS ACTIVE'));

  section.appendChild(grid);
}

function renderCountryBreakdown(container: HTMLElement, countries: CountryAccuracy[]): void {
  if (!countries || countries.length === 0) return;

  const section = createElement('section', { className: 'nw-accuracy-countries' });
  section.innerHTML = '<h2>Country-Level Accuracy</h2>';

  const table = createElement('table', { className: 'nw-accuracy-table' });
  table.innerHTML = `
    <thead>
      <tr>
        <th>Country</th>
        <th>Predictions</th>
        <th>Avg CII</th>
        <th>Accuracy</th>
      </tr>
    </thead>
    <tbody>
      ${countries
        .slice(0, 20)
        .map((c) => {
          const color = c.accuracy_rate >= 75 ? '#22c55e' : c.accuracy_rate >= 50 ? '#eab308' : '#f97316';
          return `<tr>
            <td>${c.country_name}</td>
            <td>${c.total_predictions}</td>
            <td>${c.avg_cii.toFixed(0)}</td>
            <td style="color: ${color}">${c.accuracy_rate.toFixed(1)}%</td>
          </tr>`;
        })
        .join('')}
    </tbody>
  `;
  section.appendChild(table);
  container.appendChild(section);
}

function renderEmptyState(section: HTMLElement): void {
  section.innerHTML = `
    <div class="nw-accuracy-empty">
      <div class="nw-accuracy-empty-icon">◷</div>
      <h3>Accuracy data accumulating</h3>
      <p>
        NexusWatch started recording CII snapshots and predictions on 2026-04-13.
        The accuracy dashboard will populate after 30 days of recorded data when we
        have enough outcomes to score.
      </p>
      <p class="nw-accuracy-empty-note">
        When we have data, this page will show every prediction we made — including the ones we got wrong.
      </p>
    </div>
  `;
}
