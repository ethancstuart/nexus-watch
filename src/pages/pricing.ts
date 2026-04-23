/**
 * Pricing Page — 4-tier model with annual toggle.
 *
 * Explorer (Free) / Insider ($19) / Analyst ($29) / Pro ($99)
 * Annual: $199/yr, $299/yr, $999/yr
 */

import '../styles/pricing.css';
import { createElement } from '../utils/dom.ts';
import { trackEvent } from '../services/analytics.ts';

type PaidTier = 'insider' | 'analyst' | 'pro';

export function renderPricingPage(container: HTMLElement): void {
  container.innerHTML = '';
  container.className = '';

  const page = createElement('div', { className: 'nw-pricing-page nw-page' });
  page.setAttribute('role', 'main');
  page.id = 'main-content';

  page.innerHTML = `
    <a href="#/" class="nw-back-link">NexusWatch</a>

    <header class="pricing-header">
      <h1>Choose your level of intelligence</h1>
      <p>Trust is free. Depth is paid. Every tier includes a 14-day free trial.</p>
      <div class="pricing-toggle" id="billing-toggle">
        <button class="pricing-toggle-btn active" data-interval="month">Monthly</button>
        <button class="pricing-toggle-btn" data-interval="year">Annual <span class="pricing-toggle-save">save up to 16%</span></button>
      </div>
    </header>

    <section class="pricing-grid pricing-grid-4">
      <div class="pricing-card">
        <div class="pricing-tier">Explorer</div>
        <div class="pricing-amount">$0</div>
        <div class="pricing-period">&nbsp;</div>
        <div class="pricing-desc">Everything you need to start</div>
        <ul class="pricing-features">
          <li>Full 3D globe with 45+ live layers</li>
          <li>CII scores for 150+ countries</li>
          <li>Intelligence Brief (3x/week)</li>
          <li>3 AI analyst queries/day</li>
          <li>1 alert rule</li>
          <li>48-hour timeline</li>
          <li>2 saved map views</li>
          <li>Compare 2 countries</li>
        </ul>
        <a href="#/intel" class="pricing-cta">Open the Map</a>
      </div>

      <div class="pricing-card pricing-insider">
        <div class="pricing-tier">Insider</div>
        <div class="pricing-amount" data-monthly="$19" data-annual="$199">$19<span class="pricing-period">/mo</span></div>
        <div class="pricing-annual-note" data-monthly="" data-annual="$16.58/mo billed annually" style="font-size:11px;color:var(--nw-cyan);min-height:16px"></div>
        <div class="pricing-desc">Daily intelligence + full evidence</div>
        <ul class="pricing-features">
          <li class="pricing-features-header">Everything in Explorer, plus:</li>
          <li><strong>Daily intelligence brief</strong></li>
          <li><strong>Full evidence chains</strong> (all countries)</li>
          <li>10 AI analyst queries/day</li>
          <li>3 alert rules + email delivery</li>
          <li>7-day timeline history</li>
          <li>5 saved map views</li>
          <li>Compare 4 countries</li>
        </ul>
        <button type="button" class="pricing-cta pricing-cta-primary" data-tier="insider">Start 14-Day Trial</button>
      </div>

      <div class="pricing-card pricing-featured">
        <div class="pricing-badge">MOST POPULAR</div>
        <div class="pricing-tier">Analyst</div>
        <div class="pricing-amount" data-monthly="$29" data-annual="$299">$29<span class="pricing-period">/mo</span></div>
        <div class="pricing-annual-note" data-monthly="" data-annual="$24.92/mo billed annually" style="font-size:11px;color:var(--nw-cyan);min-height:16px"></div>
        <div class="pricing-desc">Unlimited AI + scenario simulation</div>
        <ul class="pricing-features">
          <li class="pricing-features-header">Everything in Insider, plus:</li>
          <li><strong>Unlimited AI analyst queries</strong></li>
          <li><strong>Scenario simulation</strong> (1/day)</li>
          <li>30-day timeline + time-travel</li>
          <li>5 alert rules</li>
          <li>Cinema mode (no watermark)</li>
          <li>10 saved map views</li>
          <li>Compare 6 countries</li>
        </ul>
        <button type="button" class="pricing-cta pricing-cta-primary" data-tier="analyst">Start 14-Day Trial</button>
      </div>

      <div class="pricing-card pricing-pro">
        <div class="pricing-tier">Pro</div>
        <div class="pricing-amount" data-monthly="$99" data-annual="$999">$99<span class="pricing-period">/mo</span></div>
        <div class="pricing-annual-note" data-monthly="" data-annual="$83.25/mo billed annually" style="font-size:11px;color:var(--nw-cyan);min-height:16px"></div>
        <div class="pricing-desc">Portfolio + API + unlimited everything</div>
        <ul class="pricing-features">
          <li class="pricing-features-header">Everything in Analyst, plus:</li>
          <li><strong>Portfolio Geopolitical Exposure</strong></li>
          <li><strong>Unlimited scenario simulations</strong></li>
          <li>90-day history + time-travel</li>
          <li>Unlimited alert rules</li>
          <li>Crisis playbooks (auto-trigger)</li>
          <li>CSV/JSON data export</li>
          <li>REST API access</li>
          <li>Personalized daily brief</li>
        </ul>
        <button type="button" class="pricing-cta pricing-cta-primary" data-tier="pro">Start 14-Day Trial</button>
      </div>
    </section>

    <p class="pricing-enterprise">
      Enterprise API from $299/mo \u2014 REST API, webhooks, historical export, custom SLA.
      <a href="mailto:hello@nexuswatch.dev?subject=Enterprise%20API">Talk to us</a>
    </p>

    <div class="pricing-checkout-status" id="checkout-status" role="status" aria-live="polite"></div>

    <section class="pricing-faq">
      <h2>Frequently asked</h2>
      <div class="pricing-faq-grid">
        <div class="pricing-faq-item">
          <h3>What if the free tier already has what I need?</h3>
          <p>Then use it. Free is free forever, no card required. The trust layer is intentionally ungated.</p>
        </div>
        <div class="pricing-faq-item">
          <h3>How do I cancel?</h3>
          <p>One click in the billing portal. Prorated refund on the unused period. We hate retention tricks.</p>
        </div>
        <div class="pricing-faq-item">
          <h3>Do you offer discounts?</h3>
          <p>Yes \u2014 50% off for students, journalists, academics, and non-profits. Email hello@nexuswatch.dev with proof. Annual plans save up to 16%.</p>
        </div>
        <div class="pricing-faq-item">
          <h3>Is my portfolio data private?</h3>
          <p>Portfolio holdings never leave your browser. Exposure is computed client-side against public CII scores. We literally cannot see your portfolio.</p>
        </div>
        <div class="pricing-faq-item">
          <h3>Can I try before committing?</h3>
          <p>Every paid tier has a 14-day free trial. Full access, card required, cancel anytime.</p>
        </div>
        <div class="pricing-faq-item">
          <h3>Why is this cheaper than Stratfor or Dataminr?</h3>
          <p>They charge for analyst headcount. We charge for software. Our CII scores, evidence chains, and AI analysis are automated \u2014 so we can offer institutional-grade intelligence at consumer prices.</p>
        </div>
      </div>
    </section>
  `;

  container.appendChild(page);

  // === Founding seats counter ===
  void (async () => {
    try {
      const statusRes = await fetch('/api/stripe/founding-status');
      if (!statusRes.ok) return;
      const status = (await statusRes.json()) as { claimed: number; remaining: number; isFull: boolean };

      const insiderCard = page.querySelector<HTMLElement>('.pricing-insider');
      if (!insiderCard) return;

      const ctaBtn = insiderCard.querySelector<HTMLButtonElement>('.pricing-cta-primary');
      if (!ctaBtn) return;

      const counterBlock = createElement('div', { className: 'pricing-founding-counter' });
      counterBlock.style.cssText = 'margin-bottom:12px;';

      // Sanitize claimed value to prevent markup injection
      const claimedNum = typeof status.claimed === 'number' ? Math.min(status.claimed, 100) : 0;

      if (status.isFull) {
        counterBlock.innerHTML = `
          <div style="font-size:12px;color:#22c55e;font-family:'JetBrains Mono',monospace;margin-bottom:6px;">
            ● Founding cohort is full
          </div>
          <div style="height:4px;background:#1a1a1a;border-radius:2px;">
            <div style="width:100%;height:100%;background:#22c55e;border-radius:2px;"></div>
          </div>`;
        ctaBtn.disabled = true;
        ctaBtn.textContent = 'Cohort Full — See Analyst Tier →';
        ctaBtn.removeAttribute('data-tier');
        ctaBtn.addEventListener('click', () => {
          const analystCard = page.querySelector('.pricing-featured');
          analystCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        const badge = insiderCard.querySelector('.pricing-tier');
        if (badge) badge.textContent = 'COHORT CLOSED';
      } else {
        const pct = Math.min(Math.round(claimedNum), 100);
        counterBlock.innerHTML = `
          <div style="font-size:12px;color:#22c55e;font-family:'JetBrains Mono',monospace;margin-bottom:6px;">
            ● ${claimedNum} of 100 founding seats claimed
          </div>
          <div style="height:4px;background:#1a1a1a;border-radius:2px;">
            <div style="width:${pct}%;height:100%;background:#22c55e;border-radius:2px;"></div>
          </div>`;
      }

      insiderCard.insertBefore(counterBlock, ctaBtn);
    } catch {
      // Fail silently — pricing page remains fully functional
    }
  })();

  // === Billing toggle (monthly ↔ annual) ===
  let currentInterval: 'month' | 'year' = 'month';
  const toggleBtns = page.querySelectorAll('.pricing-toggle-btn');
  const priceEls = page.querySelectorAll<HTMLElement>('.pricing-amount[data-monthly]');
  const noteEls = page.querySelectorAll<HTMLElement>('.pricing-annual-note');

  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentInterval = (btn as HTMLElement).dataset.interval === 'year' ? 'year' : 'month';
      toggleBtns.forEach((b) => b.classList.toggle('active', b === btn));

      priceEls.forEach((el) => {
        const monthly = el.dataset.monthly || '';
        const annual = el.dataset.annual || '';
        if (currentInterval === 'year') {
          el.innerHTML = `${annual}<span class="pricing-period">/yr</span>`;
        } else {
          el.innerHTML = `${monthly}<span class="pricing-period">/mo</span>`;
        }
      });

      noteEls.forEach((el) => {
        el.textContent = currentInterval === 'year' ? el.dataset.annual || '' : '';
      });
    });
  });

  // === Checkout wiring ===
  const checkoutStatus = document.getElementById('checkout-status');
  const setStatus = (msg: string, color: string) => {
    if (checkoutStatus) {
      checkoutStatus.textContent = msg;
      checkoutStatus.style.color = color;
    }
  };

  async function startCheckout(tier: PaidTier, button: HTMLButtonElement) {
    const originalText = button.textContent || '';
    button.disabled = true;
    button.textContent = '\u2026';
    if (checkoutStatus) checkoutStatus.textContent = '';

    trackEvent('checkout_started', { tier, interval: currentInterval });

    try {
      const referredBy = sessionStorage.getItem('nw-referral') || '';
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier, interval: currentInterval, referredBy }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

      if (res.status === 401) {
        sessionStorage.setItem('nw:pending-checkout', tier);
        sessionStorage.setItem('nw:pending-interval', currentInterval);
        setStatus('Redirecting to sign in\u2026', 'var(--nw-text-muted)');
        window.location.href = `/api/auth/google?return=${encodeURIComponent('/#/pricing?resume=' + tier)}`;
        return;
      }

      if (!res.ok || !data.url) throw new Error(data.error || `Checkout failed (${res.status})`);

      setStatus('Redirecting to Stripe\u2026', 'var(--nw-text-muted)');
      window.location.href = data.url;
    } catch (err) {
      button.disabled = false;
      button.textContent = originalText;
      setStatus(err instanceof Error ? err.message : 'Checkout failed \u2014 try again', 'var(--nw-error)');
    }
  }

  // Wire all tier CTAs
  page.querySelectorAll<HTMLButtonElement>('.pricing-cta-primary[data-tier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.tier as PaidTier;
      void startCheckout(tier, btn);
    });
  });

  // Resume checkout after OAuth bounce
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const resumeTier = params.get('resume') || sessionStorage.getItem('nw:pending-checkout');
  const resumeInterval = sessionStorage.getItem('nw:pending-interval');
  if (resumeTier === 'insider' || resumeTier === 'analyst' || resumeTier === 'pro') {
    sessionStorage.removeItem('nw:pending-checkout');
    sessionStorage.removeItem('nw:pending-interval');
    if (resumeInterval === 'year') {
      currentInterval = 'year';
      toggleBtns.forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.interval === 'year'));
    }
    const btn = page.querySelector<HTMLButtonElement>(`.pricing-cta-primary[data-tier="${resumeTier}"]`);
    if (btn) void startCheckout(resumeTier, btn);
  }
}
