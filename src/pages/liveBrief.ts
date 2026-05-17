/**
 * /live-brief/:code — Live Agent Briefing for a country.
 *
 * Streams a multi-tool agent run via /api/ai-analyst (SSE) and renders
 * the reasoning trajectory in real time. The agent gathers CII, verified
 * signals, and recent conflict events, then synthesizes a concise brief
 * with confidence tags.
 *
 * URL is shareable: anyone can paste it into a tweet or message and see
 * the agent re-run live.
 */

import { createElement } from '../utils/dom.ts';
import { getCachedCII, getMonitoredCountries } from '../services/countryInstabilityIndex.ts';
import { setPageSeo, PAGE_SEO } from '../utils/seo.ts';
import { AgentTrajectory, injectAgentTrajectoryStyles } from '../ui/agentTrajectory.ts';

export function renderLiveBriefPage(root: HTMLElement, rawCode: string): void {
  const code = (rawCode || '').toUpperCase();
  const monitored = getMonitoredCountries().find((c) => c.code === code);
  const ciiRow = getCachedCII().find((s) => s.countryCode === code);
  const name = monitored?.name ?? code;

  setPageSeo({
    ...PAGE_SEO.liveBrief,
    title: `${name} · Live Agent Brief`,
    description: `Watch a NexusWatch AI agent build a live geopolitical brief for ${name}. Visible tool calls, real data, confidence tagged. Free.`,
    canonicalPath: `/live-brief/${code}`,
  });

  root.innerHTML = '';
  root.className = 'nw-live-brief-page';

  injectStyles();
  injectAgentTrajectoryStyles();

  const wrap = createElement('div', { className: 'nw-lb-wrap' });

  // Top nav
  const nav = createElement('nav', { className: 'nw-lb-nav' });
  nav.setAttribute('aria-label', 'Primary');
  nav.innerHTML = `
    <a href="#/intel" class="nw-lb-back">← Intel Map</a>
    <div class="nw-lb-nav-links">
      <a href="#/brief-country/${code}">Static Brief</a>
      <a href="#/audit/${code}">Audit Trail</a>
      <a href="#/mcp">MCP Server</a>
    </div>
  `;
  wrap.appendChild(nav);

  // Hero
  const hero = createElement('header', { className: 'nw-lb-hero' });
  hero.innerHTML = `
    <div class="nw-lb-eyebrow">Live Agent Brief</div>
    <h1 class="nw-lb-title">${name}</h1>
    <div class="nw-lb-meta">
      <span class="nw-lb-code">${code}</span>
      ${
        ciiRow
          ? `<span class="nw-lb-cii">CII <strong>${ciiRow.score}</strong></span>
             <span class="nw-lb-cii-conf">${(ciiRow.confidence || '').toUpperCase()} confidence</span>`
          : `<span class="nw-lb-cii-missing">No cached CII</span>`
      }
      <span class="nw-lb-ts">${new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}</span>
    </div>
    <p class="nw-lb-blurb">
      An AI agent is about to gather live data for ${name} from the NexusWatch tools — CII,
      verified signals, and recent ACLED events — then synthesize a short brief. You see every
      tool call as it happens. No hidden steps.
    </p>
  `;
  wrap.appendChild(hero);

  // Trajectory mount
  const trajectoryMount = createElement('div', { className: 'nw-lb-trajectory' });
  wrap.appendChild(trajectoryMount);

  // Rerun + share row
  const actions = createElement('div', { className: 'nw-lb-actions' });
  actions.innerHTML = `
    <button class="nw-lb-action" data-action="rerun" hidden>↻ Re-run brief</button>
    <button class="nw-lb-action" data-action="share">🔗 Copy share link</button>
    <span class="nw-lb-action-note">Each run is live — re-running may produce a different brief as data changes.</span>
  `;
  wrap.appendChild(actions);

  root.appendChild(wrap);

  // Wire share
  const shareBtn = actions.querySelector<HTMLButtonElement>('[data-action="share"]');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = `https://nexuswatch.dev/#/live-brief/${code}`;
      try {
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = '✓ Link copied';
        setTimeout(() => (shareBtn.textContent = '🔗 Copy share link'), 2200);
      } catch {
        shareBtn.textContent = url;
      }
    });
  }

  // Kick off the agent run
  const rerunBtn = actions.querySelector<HTMLButtonElement>('[data-action="rerun"]');
  const query = buildQuery(name, code, ciiRow?.score);
  const context = buildContext(ciiRow);

  function start(): void {
    if (rerunBtn) rerunBtn.hidden = true;
    trajectoryMount.innerHTML = '';
    const traj = new AgentTrajectory(trajectoryMount, {
      onDone: () => {
        if (rerunBtn) rerunBtn.hidden = false;
      },
      onError: () => {
        if (rerunBtn) rerunBtn.hidden = false;
      },
    });
    void traj.run(query, context);
  }

  rerunBtn?.addEventListener('click', start);
  start();
}

function buildQuery(name: string, code: string, cii?: number): string {
  return `Generate a live geopolitical intelligence brief for ${name} (${code}).
Use the available tools to gather:
1. The current CII score and 6-component breakdown (get_country_cii)
2. Any currently active verified signals (get_verified_signals)
3. Recent conflict events in this country (search_events with country_code=${code} and event_type=conflict)

Then synthesize a 3-paragraph executive brief:
- Bottom line: one sentence on the current posture
- Evidence: what the data shows, with sources named
- Gaps: what we don't know and why

Apply per-sentence confidence tags ([H]/[M]/[L]/[A]) throughout the brief.
${cii != null ? `Cached CII for context: ${cii}.` : 'No cached CII available; rely on the tool.'}`;
}

function buildContext(ciiRow?: {
  countryCode: string;
  countryName: string;
  score: number;
  confidence: string;
}): string {
  if (!ciiRow) return '';
  return `${ciiRow.countryName} (${ciiRow.countryCode}): CII ${ciiRow.score} [${ciiRow.confidence.toUpperCase()}]`;
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .nw-live-brief-page {
      background: var(--color-surface, #050505);
      color: var(--color-text, #e0e0e0);
      min-height: 100vh;
    }
    .nw-lb-wrap {
      max-width: 880px;
      margin: 0 auto;
      padding: 1.5rem 1.5rem 4rem;
    }

    .nw-lb-nav {
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
    .nw-lb-back {
      color: var(--color-text-muted, #888);
      text-decoration: none;
    }
    .nw-lb-back:hover { color: var(--color-accent, #ff6600); }
    .nw-lb-nav-links a {
      color: var(--color-text-muted, #888);
      text-decoration: none;
      margin-left: 1.25rem;
    }
    .nw-lb-nav-links a:hover { color: var(--color-accent, #ff6600); }

    .nw-lb-hero { margin-bottom: 1.6rem; }
    .nw-lb-eyebrow {
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.7rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--color-accent, #ff6600);
      margin-bottom: 0.5rem;
    }
    .nw-lb-title {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: clamp(2rem, 4.5vw, 3rem);
      line-height: 1.1;
      margin: 0 0 0.75rem;
      color: var(--color-text, #f4f4f4);
      letter-spacing: -0.01em;
    }
    .nw-lb-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 1.1rem;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--color-text-muted, #888);
      margin-bottom: 1.1rem;
    }
    .nw-lb-cii strong { color: var(--color-accent, #ff6600); font-weight: 700; }
    .nw-lb-cii-conf, .nw-lb-cii-missing { color: var(--color-text-muted, #666); }

    .nw-lb-blurb {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1.05rem;
      line-height: 1.6;
      color: var(--color-text, #c8c8c8);
      margin: 0 0 1.75rem;
      max-width: 60ch;
    }

    .nw-lb-trajectory { margin-bottom: 1.4rem; }

    .nw-lb-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.85rem;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 0.75rem;
    }
    .nw-lb-action {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      color: var(--color-text, #e0e0e0);
      font-family: inherit;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      padding: 0.5rem 0.95rem;
      border-radius: 3px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }
    .nw-lb-action:hover {
      border-color: var(--color-accent, #ff6600);
      color: var(--color-accent, #ff6600);
    }
    .nw-lb-action-note {
      color: var(--color-text-muted, #666);
      font-style: italic;
      font-size: 0.7rem;
    }
  `;
  document.head.appendChild(style);
}
