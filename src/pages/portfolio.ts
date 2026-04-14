/**
 * Portfolio Geopolitical Exposure Page (Pro Tier — $99/mo)
 *
 * Input holdings → see your portfolio's geopolitical risk exposure
 * mapped to country CII scores. "Your portfolio has 23% exposure to
 * countries with CII > 60."
 *
 * This is the feature that makes hedge fund PMs pay without blinking.
 */

import { createElement } from '../utils/dom.ts';
import {
  computePortfolioExposure,
  getSupportedHoldings,
  type PortfolioHolding,
  type PortfolioRiskReport,
} from '../services/portfolioExposure.ts';

const STORAGE_KEY = 'nw:portfolio-holdings';

export function renderPortfolioPage(container: HTMLElement): void {
  container.innerHTML = '';
  container.className = 'nw-portfolio-page';

  const header = createElement('header', { className: 'nw-portfolio-header' });
  header.innerHTML = `
    <div class="nw-portfolio-title">
      <h1>Portfolio Geopolitical Exposure</h1>
      <p class="nw-portfolio-subtitle">Map your holdings to country-level geopolitical risk.</p>
    </div>
    <a href="#/intel" class="nw-portfolio-back">← Back to Intel Map</a>
  `;
  container.appendChild(header);

  const intro = createElement('section', { className: 'nw-portfolio-intro' });
  intro.innerHTML = `
    <p>
      Enter your portfolio holdings (ticker + weight %). NexusWatch maps each holding to its country
      revenue exposure, then weights by live CII scores to show your <strong>geopolitical risk</strong>.
    </p>
    <p class="nw-portfolio-callout">
      <strong>Why it matters:</strong> your sector risk is visible. Your factor risk is visible.
      Your geopolitical risk is almost never quantified. If Taiwan CII hits 80, how much does your
      portfolio lose? If Iran closes Hormuz, which holdings bleed first? This page answers those questions.
    </p>
  `;
  container.appendChild(intro);

  // Main layout: input form + results
  const main = createElement('div', { className: 'nw-portfolio-main' });

  // LEFT: Input form
  const formPanel = createElement('div', { className: 'nw-portfolio-form-panel' });
  formPanel.innerHTML = '<h2>Holdings</h2>';

  const holdingsContainer = createElement('div', { className: 'nw-holdings-list' });
  formPanel.appendChild(holdingsContainer);

  // Load saved holdings from localStorage
  const saved: PortfolioHolding[] = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  })();

  const holdings: PortfolioHolding[] = saved.length > 0 ? saved : [];

  const supportedTickers = getSupportedHoldings();

  const renderHoldings = () => {
    holdingsContainer.innerHTML = '';

    if (holdings.length === 0) {
      const empty = createElement('div', { className: 'nw-holdings-empty' });
      empty.textContent = 'No holdings yet. Add a ticker below.';
      holdingsContainer.appendChild(empty);
    }

    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i];
      const row = createElement('div', { className: 'nw-holding-row' });
      row.innerHTML = `
        <span class="nw-holding-symbol">${h.symbol}</span>
        <input type="number" class="nw-holding-weight" value="${h.weight}" min="0" max="100" step="0.5" />
        <span class="nw-holding-pct">%</span>
        <button class="nw-holding-remove" data-idx="${i}">✕</button>
      `;
      const input = row.querySelector('.nw-holding-weight') as HTMLInputElement;
      input.addEventListener('input', () => {
        holdings[i].weight = parseFloat(input.value) || 0;
        persist();
        recompute();
      });
      const removeBtn = row.querySelector('.nw-holding-remove') as HTMLButtonElement;
      removeBtn.addEventListener('click', () => {
        holdings.splice(i, 1);
        persist();
        renderHoldings();
        recompute();
      });
      holdingsContainer.appendChild(row);
    }
  };

  // Add holding form
  const addForm = createElement('div', { className: 'nw-add-holding' });
  addForm.innerHTML = `
    <input type="text" class="nw-add-symbol" placeholder="Ticker (e.g., TSMC, NVDA, VWO)" list="nw-ticker-list" />
    <datalist id="nw-ticker-list">
      ${supportedTickers.map((t) => `<option value="${t}">`).join('')}
    </datalist>
    <input type="number" class="nw-add-weight" placeholder="Weight %" min="0" max="100" step="0.5" />
    <button class="nw-add-btn">Add</button>
  `;
  formPanel.appendChild(addForm);

  const symbolInput = addForm.querySelector('.nw-add-symbol') as HTMLInputElement;
  const weightInput = addForm.querySelector('.nw-add-weight') as HTMLInputElement;
  const addBtn = addForm.querySelector('.nw-add-btn') as HTMLButtonElement;

  const doAdd = () => {
    const symbol = symbolInput.value.trim().toUpperCase();
    const weight = parseFloat(weightInput.value);
    if (!symbol || isNaN(weight) || weight <= 0) return;
    if (!supportedTickers.includes(symbol)) {
      alert(`${symbol} is not yet supported. Supported tickers shown in dropdown.`);
      return;
    }
    holdings.push({ symbol, weight });
    persist();
    symbolInput.value = '';
    weightInput.value = '';
    renderHoldings();
    recompute();
  };
  addBtn.addEventListener('click', doAdd);
  weightInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAdd();
  });

  // Preset button
  const presetSection = createElement('div', { className: 'nw-portfolio-presets' });
  presetSection.innerHTML = `
    <div class="nw-preset-label">Quick presets:</div>
    <button class="nw-preset-btn" data-preset="tech">Tech-heavy</button>
    <button class="nw-preset-btn" data-preset="energy">Energy</button>
    <button class="nw-preset-btn" data-preset="em">Emerging markets</button>
    <button class="nw-preset-btn" data-preset="defense">Defense</button>
    <button class="nw-preset-btn" data-preset="diversified">Diversified</button>
  `;
  formPanel.appendChild(presetSection);

  const PRESETS: Record<string, PortfolioHolding[]> = {
    tech: [
      { symbol: 'AAPL', weight: 20 },
      { symbol: 'MSFT', weight: 20 },
      { symbol: 'NVDA', weight: 15 },
      { symbol: 'TSMC', weight: 15 },
      { symbol: 'GOOGL', weight: 15 },
      { symbol: 'META', weight: 15 },
    ],
    energy: [
      { symbol: 'XOM', weight: 25 },
      { symbol: 'CVX', weight: 20 },
      { symbol: 'BP', weight: 15 },
      { symbol: 'SHEL', weight: 15 },
      { symbol: 'XLE', weight: 15 },
      { symbol: 'USO', weight: 10 },
    ],
    em: [
      { symbol: 'VWO', weight: 30 },
      { symbol: 'EEM', weight: 25 },
      { symbol: 'EWZ', weight: 15 },
      { symbol: 'FXI', weight: 15 },
      { symbol: 'EWY', weight: 15 },
    ],
    defense: [
      { symbol: 'LMT', weight: 30 },
      { symbol: 'RTX', weight: 25 },
      { symbol: 'NOC', weight: 25 },
      { symbol: 'BA', weight: 20 },
    ],
    diversified: [
      { symbol: 'AAPL', weight: 10 },
      { symbol: 'MSFT', weight: 10 },
      { symbol: 'XOM', weight: 10 },
      { symbol: 'JPM', weight: 10 },
      { symbol: 'VWO', weight: 15 },
      { symbol: 'GLD', weight: 10 },
      { symbol: 'LMT', weight: 10 },
      { symbol: 'TSMC', weight: 15 },
      { symbol: 'HSBC', weight: 10 },
    ],
  };

  presetSection.querySelectorAll('.nw-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = (btn as HTMLElement).dataset.preset!;
      holdings.length = 0;
      holdings.push(...PRESETS[preset]);
      persist();
      renderHoldings();
      recompute();
    });
  });

  // RIGHT: Results
  const resultsPanel = createElement('div', { className: 'nw-portfolio-results' });
  resultsPanel.innerHTML = '<div class="nw-results-empty">Add holdings to see your geopolitical exposure.</div>';

  main.appendChild(formPanel);
  main.appendChild(resultsPanel);
  container.appendChild(main);

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
    } catch {
      /* quota — non-fatal */
    }
  }

  function recompute(): void {
    if (holdings.length === 0) {
      resultsPanel.innerHTML = '<div class="nw-results-empty">Add holdings to see your geopolitical exposure.</div>';
      return;
    }

    const report = computePortfolioExposure(holdings);
    renderResults(resultsPanel, report);
  }

  renderHoldings();
  recompute();

  // Footer
  const footer = createElement('footer', { className: 'nw-portfolio-footer' });
  footer.innerHTML = `
    <p>
      Holdings data stored locally in your browser. NexusWatch never sees your portfolio —
      exposure is computed client-side against our public CII scores.
    </p>
    <p class="nw-portfolio-disclaimer">
      Not investment advice. Country exposure estimates based on approximate revenue geography.
      Real-time exposure requires Bloomberg/Refinitiv-grade data. Use for directional risk awareness, not trading decisions.
    </p>
  `;
  container.appendChild(footer);
}

function renderResults(container: HTMLElement, report: PortfolioRiskReport): void {
  container.innerHTML = '';

  // Overall risk card
  const overall = createElement('div', { className: 'nw-risk-overall' });
  overall.innerHTML = `
    <div class="nw-risk-score-label">OVERALL GEOPOLITICAL RISK</div>
    <div class="nw-risk-score-value" style="color: ${report.riskColor}">${report.overallRisk}</div>
    <div class="nw-risk-score-label-value" style="color: ${report.riskColor}">${report.riskLabel}</div>
  `;
  container.appendChild(overall);

  // Top risks callouts
  if (report.topRisks.length > 0) {
    const risks = createElement('div', { className: 'nw-risk-callouts' });
    const title = createElement('div', { className: 'nw-risk-callouts-title' });
    title.textContent = 'TOP RISK CONCENTRATIONS';
    risks.appendChild(title);
    for (const risk of report.topRisks) {
      const item = createElement('div', { className: 'nw-risk-callout-item' });
      item.textContent = `⚠ ${risk}`;
      risks.appendChild(item);
    }
    container.appendChild(risks);
  }

  // Elevated exposure summary
  if (report.elevatedCountries.length > 0) {
    const elev = createElement('div', { className: 'nw-risk-elevated' });
    elev.innerHTML = `
      <div class="nw-elevated-pct">${report.elevatedExposurePct}%</div>
      <div class="nw-elevated-label">of portfolio exposed to countries with CII > 60</div>
    `;
    container.appendChild(elev);
  }

  // Country exposure table
  const tableSection = createElement('div', { className: 'nw-exposure-table-section' });
  tableSection.innerHTML = '<h3>Country Exposure Breakdown</h3>';

  const table = createElement('table', { className: 'nw-exposure-table' });
  const topCountries = report.exposures.slice(0, 15);
  table.innerHTML = `
    <thead>
      <tr>
        <th>Country</th>
        <th>Exposure</th>
        <th>CII</th>
        <th>Weighted Risk</th>
        <th>Holdings</th>
      </tr>
    </thead>
    <tbody>
      ${topCountries
        .map((c) => {
          const ciiColor =
            c.ciiScore >= 75 ? '#dc2626' : c.ciiScore >= 50 ? '#f97316' : c.ciiScore >= 25 ? '#eab308' : '#22c55e';
          return `<tr>
            <td>${c.countryName}</td>
            <td>${c.exposurePct}%</td>
            <td style="color: ${ciiColor}">${c.ciiScore}</td>
            <td>${c.weightedRisk.toFixed(1)}</td>
            <td class="nw-exposure-holdings">${c.holdings.join(', ')}</td>
          </tr>`;
        })
        .join('')}
    </tbody>
  `;
  tableSection.appendChild(table);
  container.appendChild(tableSection);
}
