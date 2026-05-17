/**
 * /mcp — Public MCP server landing page.
 *
 * One-line install for Claude Code / Cursor / Windsurf / Continue.
 * Lists the 9 NexusWatch tools and shows example prompts.
 * No auth required — server uses an internal pooled key for upstream.
 */

import '../styles/landing.css';
import { createElement } from '../utils/dom.ts';
import { setPageSeo, PAGE_SEO } from '../utils/seo.ts';

interface ToolRow {
  name: string;
  oneLine: string;
}

const TOOLS: ToolRow[] = [
  { name: 'get_country_risk', oneLine: 'CII score for one or all 158 countries (6-component breakdown + confidence).' },
  { name: 'get_alerts', oneLine: 'Active alerts: countries over a CII threshold, 7-day movers, live crisis triggers.' },
  {
    name: 'run_scenario',
    oneLine: 'What-if scenarios: hormuz-closure, taiwan-blockade, suez-disruption, russia-nato, +3 more.',
  },
  {
    name: 'get_portfolio_exposure',
    oneLine: 'Map a ticker portfolio to country exposure, chokepoint dependencies, CII-weighted risk.',
  },
  { name: 'get_risk_factors', oneLine: 'Quant factors: z-scores, 7d/30d momentum, realized volatility per country.' },
  {
    name: 'get_audit_trail',
    oneLine: 'Full CII computation history for a country — every rule, every source, every delta.',
  },
  { name: 'get_active_crises', oneLine: 'All currently unresolved crisis triggers across the network.' },
  {
    name: 'get_sanctions_attribution',
    oneLine: 'OFAC/UN sanctions cross-referenced with ACLED conflict + crisis events.',
  },
  {
    name: 'validate_predictions',
    oneLine: 'Prediction accuracy by scenario: MAE and aligned/partial/diverging status.',
  },
];

const EXAMPLE_PROMPTS: string[] = [
  'Pull the CII for Taiwan, Iran, and Ukraine and tell me which trend is worst.',
  'Run the Hormuz closure scenario and summarize the energy-price impact.',
  'My portfolio is 18% TSM, 9% XOM, 7% ASML — what is my geopolitical exposure?',
  'List every country currently above CII 70 with the dominant driver.',
  'What sanctions actions in the last 30 days correlated with new ACLED events?',
];

export function renderMcpPage(root: HTMLElement): void {
  setPageSeo(PAGE_SEO.mcp);
  root.textContent = '';

  const main = createElement('main', { className: 'marketing-surface nw-landing-surface nw-mcp-page' });
  main.id = 'main-content';
  main.setAttribute('role', 'main');

  injectStyles();

  main.innerHTML = `
    <nav class="nw-nav" aria-label="Primary">
      <a href="#/" class="nw-nav-brand"><span class="nw-nav-mark">●</span>&nbsp;NexusWatch</a>
      <div class="nw-nav-links">
        <a href="#/intel">Intel Map</a>
        <a href="#/briefs">Briefs</a>
        <a href="#/api">API</a>
        <a href="#/mcp" aria-current="page">MCP</a>
        <a href="#/about">About</a>
      </div>
    </nav>

    <article class="nw-essay">
      <p class="nw-section-eyebrow" style="margin-bottom: 32px;">MCP Server</p>
      <h1>NexusWatch for AI agents.</h1>

      <p>
        NexusWatch is also an MCP server. Connect it to Claude Code, Cursor, Windsurf, or any
        Model Context Protocol client and your agent gets live access to nine geopolitical
        intelligence tools — CII for 158 countries, scenario simulation, portfolio exposure,
        sanctions attribution, and the prediction ledger. No account, no API key, no signup.
      </p>

      <h2>Install in one line.</h2>

      <div class="nw-mcp-installs">
        <div class="nw-mcp-install">
          <div class="nw-mcp-install-label">Claude Code</div>
          <pre class="nw-mcp-code"><code>claude mcp add --transport http nexus-watch https://nexuswatch.dev/api/mcp</code></pre>
        </div>

        <div class="nw-mcp-install">
          <div class="nw-mcp-install-label">Cursor · Windsurf · Continue (mcp.json)</div>
          <pre class="nw-mcp-code"><code>{
  "mcpServers": {
    "nexus-watch": {
      "transport": "http",
      "url": "https://nexuswatch.dev/api/mcp"
    }
  }
}</code></pre>
        </div>
      </div>

      <p class="nw-mcp-rate">
        Shared public pool: 100 calls/hour per IP. Need more? Open an issue on GitHub.
      </p>

      <h2>Nine tools.</h2>

      <div class="nw-mcp-tools">
        ${TOOLS.map(
          (t) => `
            <div class="nw-mcp-tool">
              <code class="nw-mcp-tool-name">${t.name}</code>
              <div class="nw-mcp-tool-desc">${t.oneLine}</div>
            </div>
          `,
        ).join('')}
      </div>

      <h2>Try these prompts.</h2>

      <ul class="nw-mcp-prompts">
        ${EXAMPLE_PROMPTS.map((p) => `<li>${p}</li>`).join('')}
      </ul>

      <h2>Under the hood.</h2>
      <p>
        Streamable-HTTP transport, MCP protocol version 2024-11-05. JSON-RPC 2.0.
        Every tool call proxies to the public NexusWatch v2 API — the same data that powers
        the globe and the briefs. Data freshness, confidence labels, and evidence chains are
        identical to the web product.
      </p>

      <p>
        Server is open-source at
        <a href="https://github.com/ethancstuart/nexus-watch/blob/main/api/mcp.ts" target="_blank" rel="noopener">api/mcp.ts</a>.
        File an issue if you want a tool that doesn't exist yet.
      </p>

      <p class="nw-essay-closing">
        Questions? <a href="mailto:ethan@nexuswatch.dev">ethan@nexuswatch.dev</a>.
      </p>
    </article>

    <footer class="nw-footer">
      <div class="nw-footer-top">
        <div class="nw-footer-brand"><span>●</span> NexusWatch</div>
        <div class="nw-footer-links">
          <a href="#/intel">Intel Map</a>
          <a href="#/briefs">Briefs</a>
          <a href="#/api">API</a>
          <a href="#/mcp">MCP</a>
          <a href="#/accuracy">Accuracy</a>
          <a href="https://github.com/ethancstuart/nexus-watch" target="_blank" rel="noopener">GitHub</a>
        </div>
      </div>
      <div class="nw-footer-meta">
        © ${new Date().getFullYear()} NexusWatch · MIT License · Built in the open.
      </div>
    </footer>
  `;

  root.appendChild(main);
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .nw-mcp-page .nw-essay h2 { margin-top: 2.5rem; }

    .nw-mcp-installs {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      margin: 1.5rem 0 0.5rem;
    }
    .nw-mcp-install-label {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-text-muted, #888);
      margin-bottom: 0.4rem;
    }
    .nw-mcp-code {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      border-left: 2px solid var(--color-accent, #ff6600);
      border-radius: 4px;
      padding: 0.9rem 1.1rem;
      overflow-x: auto;
      margin: 0;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.78rem;
      line-height: 1.55;
      color: var(--color-text, #e0e0e0);
      white-space: pre;
    }
    .nw-mcp-code code { font-family: inherit; }

    .nw-mcp-rate {
      font-size: 0.85rem !important;
      color: var(--color-text-muted, #888);
      font-style: italic;
    }

    .nw-mcp-tools {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.6rem;
      margin: 1.25rem 0 0.5rem;
    }
    .nw-mcp-tool {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 4px;
      padding: 0.85rem 1rem;
      display: grid;
      grid-template-columns: minmax(200px, 240px) 1fr;
      gap: 1rem;
      align-items: baseline;
    }
    .nw-mcp-tool-name {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.8rem;
      color: var(--color-accent, #ff6600);
      background: transparent;
      padding: 0;
    }
    .nw-mcp-tool-desc {
      font-size: 0.92rem;
      color: var(--color-text, #ccc);
      line-height: 1.5;
    }
    @media (max-width: 640px) {
      .nw-mcp-tool { grid-template-columns: 1fr; gap: 0.25rem; }
    }

    .nw-mcp-prompts {
      list-style: none;
      padding: 0;
      margin: 1rem 0 0.5rem;
    }
    .nw-mcp-prompts li {
      padding: 0.55rem 0 0.55rem 1.3rem;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.85rem;
      color: var(--color-text, #ccc);
      position: relative;
    }
    .nw-mcp-prompts li:before {
      content: '>';
      position: absolute;
      left: 0;
      color: var(--color-accent, #ff6600);
      font-weight: 600;
    }
    .nw-mcp-prompts li:last-child { border-bottom: none; }
  `;
  document.head.appendChild(style);
}
