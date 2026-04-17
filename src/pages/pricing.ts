/**
 * Pricing Page — 4-tier comparison.
 *
 * Free / $29 Analyst / $99 Pro / Enterprise API.
 * The trust layer is free — depth is paid.
 */

import { createElement } from '../utils/dom.ts';

export function renderPricingPage(container: HTMLElement): void {
  container.innerHTML = '';
  container.className = 'nw-pricing-page';

  const header = createElement('header', { className: 'nw-pricing-header' });
  header.innerHTML = `
    <a href="#/intel" class="nw-pricing-back">← Back to Intel Map</a>
    <h1>Choose your level of intelligence</h1>
    <p class="nw-pricing-subtitle">
      Trust is free. Depth is paid. Every tier includes confidence badges, verification
      shields, and source attribution — because that's the product.
    </p>
  `;
  container.appendChild(header);

  const tiers = createElement('section', { className: 'nw-pricing-tiers' });
  tiers.innerHTML = `
    <div class="nw-tier nw-tier-free">
      <div class="nw-tier-name">Explorer</div>
      <div class="nw-tier-price">Free</div>
      <div class="nw-tier-tag">Forever</div>
      <ul class="nw-tier-features">
        <li>✓ Interactive 3D globe + 35+ data layers</li>
        <li>✓ CII scores for 86 countries</li>
        <li>✓ Confidence badges + verification shields</li>
        <li>✓ Daily Intel Dossier brief (email)</li>
        <li>✓ Freshness indicators on every source</li>
        <li>✓ Prediction ledger (public)</li>
        <li>✓ Top 3 country detail panels</li>
        <li>✓ 3 AI analyst queries/day</li>
        <li>✓ 2 composite alert rules</li>
      </ul>
      <a href="#/intel" class="nw-tier-cta">Open the Map →</a>
    </div>

    <div class="nw-tier nw-tier-analyst nw-tier-popular">
      <div class="nw-tier-badge">MOST POPULAR</div>
      <div class="nw-tier-name">Analyst</div>
      <div class="nw-tier-price" id="pricing-analyst-price">$29<span class="nw-tier-period">/mo</span></div>
      <div class="nw-tier-tag">For professionals who need verified intel</div>
      <ul class="nw-tier-features">
        <li>✓ Everything in Explorer, plus:</li>
        <li>✓ Full evidence chains (all 86 countries)</li>
        <li>✓ Unlimited AI analyst queries w/ citations</li>
        <li>✓ Unlimited composite alert rules</li>
        <li>✓ Deep-dive command (country analysis)</li>
        <li>✓ 1 scenario simulation/day</li>
        <li>✓ 30-day time-travel intelligence</li>
        <li>✓ Push notifications for crisis alerts</li>
      </ul>
      <a href="/api/stripe/checkout?tier=analyst" class="nw-tier-cta nw-tier-cta-primary" id="pricing-analyst-cta">Start Analyst →</a>
    </div>

    <div class="nw-tier nw-tier-pro">
      <div class="nw-tier-name">Pro</div>
      <div class="nw-tier-price">$99<span class="nw-tier-period">/mo</span></div>
      <div class="nw-tier-tag">For hedge funds, newsrooms, governments</div>
      <ul class="nw-tier-features">
        <li>✓ Everything in Analyst, plus:</li>
        <li>✓ <strong>Portfolio Geopolitical Exposure</strong></li>
        <li>✓ Unlimited scenario simulations</li>
        <li>✓ Full history time-travel (all data)</li>
        <li>✓ Crisis playbooks (auto-trigger)</li>
        <li>✓ Priority email briefings</li>
        <li>✓ Export data (CSV/JSON)</li>
        <li>✓ Early access to new features</li>
      </ul>
      <a href="/api/stripe/checkout?tier=pro" class="nw-tier-cta nw-tier-cta-primary">Start Pro →</a>
    </div>

    <div class="nw-tier nw-tier-enterprise">
      <div class="nw-tier-name">Enterprise API</div>
      <div class="nw-tier-price">Custom</div>
      <div class="nw-tier-tag">From $299/mo</div>
      <ul class="nw-tier-features">
        <li>✓ REST API access to all CII data</li>
        <li>✓ Webhooks for threshold alerts</li>
        <li>✓ Historical data export</li>
        <li>✓ Scenario simulation endpoints</li>
        <li>✓ Custom SLA & support</li>
        <li>✓ White-label options</li>
        <li>✓ Dedicated key management</li>
      </ul>
      <a href="mailto:hello@nexuswatch.dev?subject=Enterprise%20API" class="nw-tier-cta">Contact Sales →</a>
    </div>
  `;
  container.appendChild(tiers);

  // Founding member offer
  const founding = createElement('section', { className: 'nw-pricing-founding' });
  founding.innerHTML = `
    <div class="nw-founding-badge">FOUNDING MEMBERS · FIRST 100 ONLY</div>
    <h2>$19/mo · Locked for life</h2>
    <p>
      The first 100 subscribers lock in $19/month Analyst access permanently —
      even as our retail price rises. It's how we say thanks to the people who
      bet on us early.
    </p>
    <a href="/api/stripe/checkout?tier=founding" class="nw-tier-cta nw-tier-cta-primary">Claim Founding Spot →</a>
  `;
  container.appendChild(founding);

  // FAQ
  const faq = createElement('section', { className: 'nw-pricing-faq' });
  faq.innerHTML = `
    <h2>Frequently asked</h2>
    <div class="nw-faq-grid">
      <div class="nw-faq-item">
        <h3>Why do you charge more than World Monitor?</h3>
        <p>
          Because we do more work. Every NexusWatch number is traceable to its source,
          every AI claim is cited, every prediction is publicly tracked against reality.
          That costs us more to build and maintain. We think it's worth it — and so do our customers.
        </p>
      </div>
      <div class="nw-faq-item">
        <h3>What if the free tier already has what I need?</h3>
        <p>Then use it. Free is free forever, no card required. The trust layer is intentionally ungated.</p>
      </div>
      <div class="nw-faq-item">
        <h3>How do I cancel?</h3>
        <p>One click in the billing portal. We hate retention tricks. Prorated refund on the unused period.</p>
      </div>
      <div class="nw-faq-item">
        <h3>Do you offer discounts?</h3>
        <p>
          Yes — for students, journalists, academics, and non-profits (50% off).
          Email hello@nexuswatch.dev with proof.
        </p>
      </div>
      <div class="nw-faq-item">
        <h3>Is my portfolio data private?</h3>
        <p>
          Portfolio holdings never leave your browser. Exposure is computed client-side
          against public CII scores. We literally cannot see your portfolio.
        </p>
      </div>
      <div class="nw-faq-item">
        <h3>Can I try Pro before committing?</h3>
        <p>
          Every tier has a 14-day full refund policy. Use everything, cancel if it's not
          pulling its weight.
        </p>
      </div>
    </div>
  `;
  container.appendChild(faq);

  // A/B test: variant B shows $19 Analyst instead of $29
  const abVariant = localStorage.getItem('nw:ab-analyst') || (Math.random() < 0.5 ? 'a' : 'b');
  localStorage.setItem('nw:ab-analyst', abVariant);
  if (abVariant === 'b') {
    const priceEl = document.getElementById('pricing-analyst-price');
    if (priceEl) priceEl.innerHTML = '$19<span class="nw-tier-period">/mo</span>';
    const ctaEl = document.getElementById('pricing-analyst-cta') as HTMLAnchorElement | null;
    if (ctaEl) ctaEl.href = `/api/stripe/checkout?tier=analyst&variant=b`;
  }
}
