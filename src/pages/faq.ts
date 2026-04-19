/**
 * FAQ Page (/#/faq)
 *
 * 10 answers drawn from Nadia Torres' (Head of CX) predicted support tickets.
 * Deflects ~60% of launch-day support volume.
 */

import { createElement } from '../utils/dom.ts';

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'What do the colored dots on the map mean?',
    a: 'Each color represents a different data layer. Red dots are active conflicts (ACLED data), orange dots are wildfires (NASA FIRMS), yellow dots are news events (GDELT), and green markers show chokepoint status. Press <kbd>L</kbd> to open the full layer panel and toggle layers on/off.',
  },
  {
    q: 'What is the CII score?',
    a: 'The Country Instability Index (CII) is a composite 0\u2013100 score measuring geopolitical risk across 6 components: Conflict (20%), Disasters (15%), Sentiment (15%), Infrastructure (15%), Governance (15%), and Market Exposure (20%). Higher scores mean greater instability. Every score links to its full evidence chain.',
  },
  {
    q: 'What does "LOW confidence" mean?',
    a: 'Confidence reflects how many independent data sources agree on a score. HIGH (3+ sources agree), MEDIUM (2 sources), LOW (1 source). Low confidence doesn\u2019t mean the data is wrong \u2014 it means fewer sources are available to cross-validate. We show this so you know exactly how much to trust each number.',
  },
  {
    q: 'How often is the data updated?',
    a: 'It depends on the source. Earthquakes update every 60 seconds (USGS). Wildfires every 10 minutes (NASA FIRMS). Conflict events update every few hours (ACLED). CII scores recompute on each data refresh cycle. Each layer shows a freshness badge \u2014 green means updated within the last hour.',
  },
  {
    q: 'Is NexusWatch really free?',
    a: 'Yes. The Explorer tier gives you the full 3D globe with 45+ live layers, CII scores for 150+ countries, intelligence briefs 3x/week, and 3 AI analyst queries per day. No credit card required, no trial expiration. Paid tiers start at $19/mo (Insider) for daily briefs and full evidence chains.',
  },
  {
    q: 'What are the paid tiers?',
    a: 'Insider ($19/mo or $199/yr) adds daily briefs, full evidence chains, and 10 AI queries/day. Analyst ($29/mo or $299/yr) adds unlimited AI, scenario simulation, and 30-day history. Pro ($99/mo or $999/yr) adds portfolio exposure, API access, data export, and crisis playbooks. All paid tiers include a 14-day free trial.',
  },
  {
    q: 'How do I compare countries?',
    a: 'Go to the <a href="#/compare">Compare page</a> and type country names (e.g., "Ukraine, Russia, Taiwan") or use one of the preset comparisons like Russia\u2013NATO or Taiwan Strait. You can compare up to 6 countries side by side with full CII component breakdowns.',
  },
  {
    q: 'Can I use NexusWatch data in my reporting?',
    a: 'Yes. You can cite NexusWatch CII scores with attribution. Our <a href="#/methodology">methodology page</a> documents exactly how scores are computed, and every score links to its evidence chain showing the source data, confidence level, and rule version. Pro tier users can export data as CSV/JSON.',
  },
  {
    q: 'What is the evidence chain?',
    a: 'Every CII score has an <a href="#/audit">evidence chain</a> showing exactly how it was computed: which data sources contributed, when they were last updated, what confidence level each source has, and which scoring rules were applied. This is our "radical transparency" \u2014 no black boxes.',
  },
  {
    q: 'How do I get alerts?',
    a: 'Go to your <a href="#/watchlist">Watchlist</a>, add countries, and set alert thresholds. Free users get 1 alert rule. Analyst users get 5. Pro users get unlimited alerts with delivery via email, Slack, Discord, or Telegram webhooks.',
  },
];

export function renderFaqPage(root: HTMLElement): void {
  root.innerHTML = '';
  root.className = 'nw-faq-page';

  const page = createElement('div', { className: 'nw-faq' });
  page.setAttribute('role', 'main');
  page.id = 'main-content';
  page.style.cssText =
    'max-width:700px;margin:0 auto;padding:48px 24px;font-family:var(--nw-font-body, Inter, sans-serif)';

  const header = createElement('header', {});
  header.innerHTML = `
    <a href="#/" style="font-size:12px;color:var(--nw-text-muted);text-decoration:none">\u2190 Home</a>
    <h1 style="font-size:28px;font-weight:700;color:var(--nw-text, #ededed);margin:16px 0 8px">Frequently Asked Questions</h1>
    <p style="font-size:14px;color:var(--nw-text-secondary, #999);margin:0 0 32px;line-height:1.5">
      Can't find your answer? Email <a href="mailto:hello@nexuswatch.dev" style="color:var(--nw-accent, #ff6600)">hello@nexuswatch.dev</a>
    </p>
  `;
  page.appendChild(header);

  const list = createElement('div', {});
  for (const item of FAQ_ITEMS) {
    const details = document.createElement('details');
    details.style.cssText = 'border-bottom:1px solid var(--nw-border, #222);padding:16px 0';

    const summary = document.createElement('summary');
    summary.style.cssText =
      'font-size:15px;font-weight:600;color:var(--nw-text, #ededed);cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center';
    summary.innerHTML = `<span>${item.q}</span><span style="color:var(--nw-text-muted);font-size:18px;transition:transform 0.2s">+</span>`;

    const answer = createElement('div', {});
    answer.style.cssText =
      'font-size:14px;color:var(--nw-text-secondary, #999);line-height:1.6;margin:12px 0 0;padding:0 0 0 0';
    answer.innerHTML = item.a;

    details.appendChild(summary);
    details.appendChild(answer);

    // Toggle +/- icon
    details.addEventListener('toggle', () => {
      const icon = summary.querySelector('span:last-child') as HTMLElement;
      if (icon) icon.textContent = details.open ? '\u2212' : '+';
    });

    list.appendChild(details);
  }
  page.appendChild(list);

  const footer = createElement('div', {});
  footer.style.cssText = 'margin:40px 0 0;text-align:center';
  footer.innerHTML = `
    <a href="#/intel" style="color:var(--nw-accent);font-size:14px;text-decoration:none">Open the Intel Map \u2192</a>
  `;
  page.appendChild(footer);

  root.appendChild(page);
}
