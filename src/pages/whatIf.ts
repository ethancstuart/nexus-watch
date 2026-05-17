/**
 * /what-if and /what-if/:scenarioId — Counterfactual scenario explorer.
 *
 * Picks from 14 preset scenarios, runs the deterministic cascade engine
 * client-side, renders the affected-countries table + infrastructure +
 * historical precedents, then streams an AI agent's executive
 * interpretation via AgentTrajectory.
 *
 * No new server work — reuses the existing scenarioEngine + ai-analyst.
 */

import { createElement } from '../utils/dom.ts';
import {
  PRESET_SCENARIOS,
  simulateScenario,
  type ScenarioResult,
  type PresetScenario,
} from '../services/scenarioEngine.ts';
import { setPageSeo, PAGE_SEO } from '../utils/seo.ts';
import { AgentTrajectory, injectAgentTrajectoryStyles } from '../ui/agentTrajectory.ts';

export function renderWhatIfPage(root: HTMLElement, rawId?: string): void {
  injectStyles();
  injectAgentTrajectoryStyles();

  if (rawId) {
    renderDetail(root, rawId);
  } else {
    renderList(root);
  }
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function renderList(root: HTMLElement): void {
  setPageSeo(PAGE_SEO.whatIf);
  root.innerHTML = '';
  root.className = 'nw-whatif-page';

  const wrap = createElement('div', { className: 'nw-wi-wrap' });

  const nav = createElement('nav', { className: 'nw-wi-nav' });
  nav.setAttribute('aria-label', 'Primary');
  nav.innerHTML = `
    <a href="#/intel" class="nw-wi-back">← Intel Map</a>
    <div class="nw-wi-nav-links">
      <a href="#/briefs">Briefs</a>
      <a href="#/methodology">Methodology</a>
      <a href="#/mcp">MCP</a>
    </div>
  `;
  wrap.appendChild(nav);

  const hero = createElement('header', { className: 'nw-wi-hero' });
  hero.innerHTML = `
    <div class="nw-wi-eyebrow">Counterfactual Engine</div>
    <h1 class="nw-wi-title">What if&hellip;</h1>
    <p class="nw-wi-blurb">
      Fourteen geopolitical what-if scenarios. Each runs a deterministic cascade through
      the CII model — naming every affected country, every component shifted, every
      mechanism. After the math, an AI agent synthesizes the executive read.
    </p>
  `;
  wrap.appendChild(hero);

  const grid = createElement('div', { className: 'nw-wi-grid' });
  for (const s of PRESET_SCENARIOS) {
    const card = createElement('a', { className: 'nw-wi-card' });
    card.setAttribute('href', `#/what-if/${s.id}`);
    card.innerHTML = `
      <div class="nw-wi-card-id">${s.id}</div>
      <div class="nw-wi-card-name">${escapeHtml(s.name)}</div>
      <div class="nw-wi-card-desc">${escapeHtml(s.description)}</div>
      <div class="nw-wi-card-cta">Run simulation →</div>
    `;
    grid.appendChild(card);
  }
  wrap.appendChild(grid);

  root.appendChild(wrap);
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function renderDetail(root: HTMLElement, scenarioId: string): void {
  const preset = PRESET_SCENARIOS.find((p) => p.id === scenarioId);
  if (!preset) {
    renderList(root);
    return;
  }

  setPageSeo({
    ...PAGE_SEO.whatIf,
    title: `${preset.name} · What If`,
    description: `Counterfactual simulation: ${preset.description}. Cascade impacts across CII model + AI agent interpretation. Free.`,
    canonicalPath: `/what-if/${preset.id}`,
  });

  root.innerHTML = '';
  root.className = 'nw-whatif-page';

  const wrap = createElement('div', { className: 'nw-wi-wrap' });

  const nav = createElement('nav', { className: 'nw-wi-nav' });
  nav.setAttribute('aria-label', 'Primary');
  nav.innerHTML = `
    <a href="#/what-if" class="nw-wi-back">← All scenarios</a>
    <div class="nw-wi-nav-links">
      <a href="#/intel">Intel Map</a>
      <a href="#/methodology">Methodology</a>
    </div>
  `;
  wrap.appendChild(nav);

  // Hero
  const hero = createElement('header', { className: 'nw-wi-hero' });
  hero.innerHTML = `
    <div class="nw-wi-eyebrow">What if</div>
    <h1 class="nw-wi-title">${escapeHtml(preset.name)}</h1>
    <p class="nw-wi-blurb">${escapeHtml(preset.description)}</p>
  `;
  wrap.appendChild(hero);

  // Simulate
  const result = simulateScenario(preset.id);
  if (!result) {
    const err = createElement('p', { className: 'nw-wi-error' });
    err.textContent = 'Scenario could not be simulated. CII cache may be empty — visit /intel to warm it.';
    wrap.appendChild(err);
    root.appendChild(wrap);
    return;
  }

  // Impact summary
  const summary = createElement('div', { className: 'nw-wi-summary' });
  const top = result.affectedCountries[0];
  summary.innerHTML = `
    <div class="nw-wi-summary-stat">
      <div class="nw-wi-summary-val">${result.affectedCountries.length}</div>
      <div class="nw-wi-summary-label">Countries affected</div>
    </div>
    <div class="nw-wi-summary-stat">
      <div class="nw-wi-summary-val">+${top?.delta ?? 0}</div>
      <div class="nw-wi-summary-label">Max CII delta · ${top?.name ?? '—'}</div>
    </div>
    <div class="nw-wi-summary-stat">
      <div class="nw-wi-summary-val">${result.affectedInfrastructure.length}</div>
      <div class="nw-wi-summary-label">Infrastructure assets</div>
    </div>
    <div class="nw-wi-summary-stat">
      <div class="nw-wi-summary-val">${result.precedents.length}</div>
      <div class="nw-wi-summary-label">Historical precedents</div>
    </div>
  `;
  wrap.appendChild(summary);

  // Cascade table
  const tableSection = createElement('section', { className: 'nw-wi-section' });
  const maxDelta = Math.max(...result.affectedCountries.map((c) => c.delta), 1);
  tableSection.innerHTML = `
    <h2 class="nw-wi-section-title">Cascade Impact</h2>
    <p class="nw-wi-section-desc">
      Each affected country's CII shifts by the sum of applicable cascade rules.
      Deterministic given the latest snapshot — same inputs, same outputs.
    </p>
    <table class="nw-wi-table">
      <thead>
        <tr>
          <th>Country</th>
          <th>CII before</th>
          <th>CII after</th>
          <th>Δ</th>
          <th>Mechanism</th>
        </tr>
      </thead>
      <tbody>
        ${result.affectedCountries
          .map((c) => {
            const widthPct = Math.min(100, Math.round((c.delta / maxDelta) * 100));
            return `
              <tr>
                <td class="nw-wi-td-country">
                  <span class="nw-wi-country-code">${c.code}</span>
                  <span class="nw-wi-country-name">${escapeHtml(c.name)}</span>
                </td>
                <td class="nw-wi-mono">${c.currentCII.toFixed(1)}</td>
                <td class="nw-wi-mono"><strong>${c.estimatedCII.toFixed(1)}</strong></td>
                <td class="nw-wi-mono nw-wi-delta">
                  <span class="nw-wi-delta-bar" style="width:${widthPct}%"></span>
                  <span class="nw-wi-delta-num">+${c.delta}</span>
                </td>
                <td class="nw-wi-mechanism">${escapeHtml(c.reason)}</td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
  wrap.appendChild(tableSection);

  // Infrastructure
  if (result.affectedInfrastructure.length > 0) {
    const infraSection = createElement('section', { className: 'nw-wi-section' });
    infraSection.innerHTML = `
      <h2 class="nw-wi-section-title">Affected Infrastructure</h2>
      <div class="nw-wi-chips">
        ${result.affectedInfrastructure
          .map(
            (i) => `
              <div class="nw-wi-chip">
                <div class="nw-wi-chip-name">${escapeHtml(i.name)}</div>
                <div class="nw-wi-chip-impact">${escapeHtml(i.impact)}</div>
              </div>
            `,
          )
          .join('')}
      </div>
    `;
    wrap.appendChild(infraSection);
  }

  // Precedents
  if (result.precedents.length > 0) {
    const precSection = createElement('section', { className: 'nw-wi-section' });
    precSection.innerHTML = `
      <h2 class="nw-wi-section-title">Historical Precedents</h2>
      <ul class="nw-wi-precedents">
        ${result.precedents
          .map(
            (p) => `
              <li>
                <span class="nw-wi-precedent-date">${escapeHtml(p.date)}</span>
                <span class="nw-wi-precedent-event">${escapeHtml(p.event)}</span>
              </li>
            `,
          )
          .join('')}
      </ul>
    `;
    wrap.appendChild(precSection);
  }

  // AI agent interpretation
  const aiSection = createElement('section', { className: 'nw-wi-section' });
  aiSection.innerHTML = `
    <h2 class="nw-wi-section-title">Agent Interpretation</h2>
    <p class="nw-wi-section-desc">
      An AI analyst is reading the cascade output and surrounding live data, then writing
      the executive read in plain English. Every claim is confidence-tagged.
    </p>
  `;
  const trajectoryMount = createElement('div', { className: 'nw-wi-trajectory' });
  aiSection.appendChild(trajectoryMount);
  wrap.appendChild(aiSection);

  root.appendChild(wrap);

  // Kick off the agent run with scenario data as context
  const traj = new AgentTrajectory(trajectoryMount);
  void traj.run(buildQuery(preset), buildContext(preset, result));
}

// ---------------------------------------------------------------------------
// Agent prompt builders
// ---------------------------------------------------------------------------

function buildQuery(preset: PresetScenario): string {
  return `A counterfactual scenario has been run: "${preset.name}" — ${preset.description}.

Cascade output (deterministic, from the NexusWatch scenario engine) is provided in your context. Using your tools as needed for grounding (verified signals, country CII), write a 3-paragraph executive interpretation:

1. **Headline:** one sentence on what this scenario most likely means for global posture.
2. **Cascade read:** which countries move most, why, and what second-order moves to watch.
3. **What we don't know:** the assumptions baked into the cascade and where reality could diverge.

Tag every sentence with [H]/[M]/[L]/[A] confidence. Distinguish "the cascade says" (model output) from "the data shows" (live signals). Be honest about the limits of deterministic modeling.`;
}

function buildContext(preset: PresetScenario, result: ScenarioResult): string {
  const top10 = result.affectedCountries.slice(0, 10);
  const lines: string[] = [
    `SCENARIO: ${preset.name}`,
    `DESCRIPTION: ${preset.description}`,
    `CHOKEPOINTS: ${preset.chokepoints.join(', ') || 'none'}`,
    '',
    'TOP CASCADE IMPACTS:',
    ...top10.map(
      (c) =>
        `  ${c.name} (${c.code}): CII ${c.currentCII.toFixed(1)} → ${c.estimatedCII.toFixed(1)} (Δ +${c.delta}) · ${c.reason}`,
    ),
    '',
    `INFRASTRUCTURE AT RISK: ${result.affectedInfrastructure.map((i) => i.name).join(', ') || 'none'}`,
    `HISTORICAL PRECEDENTS: ${result.precedents.length}`,
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nw-whatif-page {
      background: var(--color-surface, #050505);
      color: var(--color-text, #e0e0e0);
      min-height: 100vh;
    }
    .nw-wi-wrap {
      max-width: 1040px;
      margin: 0 auto;
      padding: 1.5rem 1.5rem 4rem;
    }
    .nw-wi-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      margin-bottom: 2rem;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.75rem;
      letter-spacing: 0.06em;
    }
    .nw-wi-back, .nw-wi-nav-links a {
      color: var(--color-text-muted, #888);
      text-decoration: none;
    }
    .nw-wi-nav-links a { margin-left: 1.25rem; }
    .nw-wi-back:hover, .nw-wi-nav-links a:hover { color: var(--color-accent, #ff6600); }

    .nw-wi-hero { margin-bottom: 2.5rem; }
    .nw-wi-eyebrow {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.7rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--color-accent, #ff6600);
      margin-bottom: 0.5rem;
    }
    .nw-wi-title {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: clamp(2rem, 4.5vw, 3.2rem);
      line-height: 1.05;
      margin: 0 0 0.85rem;
      color: var(--color-text, #f4f4f4);
      letter-spacing: -0.01em;
    }
    .nw-wi-blurb {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1.05rem;
      line-height: 1.65;
      color: var(--color-text, #c8c8c8);
      max-width: 62ch;
      margin: 0;
    }

    .nw-wi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 0.85rem;
    }
    .nw-wi-card {
      display: block;
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      border-left: 2px solid var(--color-accent, #ff6600);
      border-radius: 4px;
      padding: 1rem 1.1rem;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s, transform 0.15s;
    }
    .nw-wi-card:hover {
      border-color: var(--color-accent, #ff6600);
      transform: translateY(-1px);
    }
    .nw-wi-card-id {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.65rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted, #666);
      margin-bottom: 0.3rem;
    }
    .nw-wi-card-name {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1.1rem;
      color: var(--color-text, #f0f0f0);
      margin-bottom: 0.4rem;
    }
    .nw-wi-card-desc {
      font-size: 0.85rem;
      color: var(--color-text-muted, #999);
      line-height: 1.5;
      margin-bottom: 0.65rem;
    }
    .nw-wi-card-cta {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.7rem;
      letter-spacing: 0.06em;
      color: var(--color-accent, #ff6600);
    }

    .nw-wi-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.85rem;
      margin-bottom: 2rem;
    }
    .nw-wi-summary-stat {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 4px;
      padding: 0.95rem 1rem;
    }
    .nw-wi-summary-val {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 1.7rem;
      font-weight: 700;
      color: var(--color-accent, #ff6600);
      line-height: 1;
      margin-bottom: 0.35rem;
    }
    .nw-wi-summary-label {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.65rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted, #888);
    }

    .nw-wi-section { margin-bottom: 2.25rem; }
    .nw-wi-section-title {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.8rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--color-accent, #ff6600);
      margin: 0 0 0.4rem;
    }
    .nw-wi-section-desc {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 0.95rem;
      color: var(--color-text-muted, #999);
      line-height: 1.6;
      margin: 0 0 1rem;
      max-width: 62ch;
    }

    .nw-wi-table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.8rem;
    }
    .nw-wi-table th {
      text-align: left;
      padding: 0.5rem 0.75rem;
      font-size: 0.65rem;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, #888);
      text-transform: uppercase;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
    }
    .nw-wi-table td {
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid rgba(42, 42, 42, 0.6);
      vertical-align: middle;
    }
    .nw-wi-td-country {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .nw-wi-country-code { color: var(--color-text-muted, #888); font-size: 0.7rem; }
    .nw-wi-country-name { color: var(--color-text, #f0f0f0); font-size: 0.85rem; }
    .nw-wi-mono { font-variant-numeric: tabular-nums; }
    .nw-wi-delta {
      position: relative;
      min-width: 120px;
    }
    .nw-wi-delta-bar {
      display: inline-block;
      height: 6px;
      background: var(--color-accent, #ff6600);
      border-radius: 1px;
      vertical-align: middle;
      margin-right: 0.5rem;
      opacity: 0.7;
    }
    .nw-wi-delta-num {
      color: var(--color-accent, #ff6600);
      font-weight: 600;
    }
    .nw-wi-mechanism {
      color: var(--color-text-muted, #aaa);
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 0.85rem;
      max-width: 380px;
    }

    .nw-wi-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
    }
    .nw-wi-chip {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 3px;
      padding: 0.55rem 0.85rem;
    }
    .nw-wi-chip-name {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.75rem;
      color: var(--color-text, #f0f0f0);
      margin-bottom: 0.15rem;
    }
    .nw-wi-chip-impact {
      font-size: 0.75rem;
      color: var(--color-text-muted, #888);
    }

    .nw-wi-precedents {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .nw-wi-precedents li {
      display: flex;
      gap: 1rem;
      padding: 0.55rem 0;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      font-size: 0.9rem;
    }
    .nw-wi-precedent-date {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.75rem;
      color: var(--color-accent, #ff6600);
      flex: 0 0 90px;
    }
    .nw-wi-precedent-event {
      color: var(--color-text, #ddd);
      font-family: 'Source Serif Pro', Georgia, serif;
    }

    .nw-wi-trajectory { margin-top: 1rem; }
    .nw-wi-error {
      padding: 2rem;
      text-align: center;
      color: var(--color-text-muted, #888);
    }

    @media (max-width: 720px) {
      .nw-wi-mechanism { max-width: none; font-size: 0.8rem; }
      .nw-wi-table { font-size: 0.75rem; }
      .nw-wi-table th, .nw-wi-table td { padding: 0.45rem 0.45rem; }
    }
  `;
  document.head.appendChild(style);
}
