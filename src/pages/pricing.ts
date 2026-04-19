/**
 * Pricing Page — 3-tier comparison (D-14, D-6).
 *
 * Explorer (Free) / Analyst ($29) / Pro ($99).
 * Founding ($19/mo lifetime) shown as overlay inside Analyst card.
 * Enterprise as text link below grid.
 */

import '../styles/pricing.css';
import { createElement } from '../utils/dom.ts';

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
      <p>Trust is free. Depth is paid.</p>
    </header>

    <section class="pricing-grid">
      <div class="pricing-card">
        <div class="pricing-tier">Explorer</div>
        <div class="pricing-amount">$0</div>
        <div class="pricing-desc">Everything you need to start</div>
        <ul class="pricing-features">
          <li>Full 3D globe with 45+ live layers</li>
          <li>CII scores for 150+ countries</li>
          <li>Confidence badges + verification shields</li>
          <li>Intelligence Brief (3x/week)</li>
          <li>3 AI analyst queries/day</li>
          <li>2 composite alert rules</li>
          <li>48-hour timeline</li>
          <li>Prediction ledger (public)</li>
        </ul>
        <a href="#/intel" class="pricing-cta">Open the Map</a>
      </div>

      <div class="pricing-card pricing-analyst" id="analyst-card">
        <div class="pricing-founding-overlay" id="founding-overlay" hidden>
          <div class="pricing-founding-badge">FOUNDING RATE</div>
          <div class="pricing-founding-price">$19/mo <span>locked for life</span></div>
          <div class="pricing-founding-remaining" id="founding-remaining"></div>
          <button type="button" class="pricing-cta pricing-cta-founding" id="founding-btn">Claim Founding Seat</button>
        </div>
        <div class="pricing-tier">Analyst</div>
        <div class="pricing-amount" id="analyst-price">$29<span>/mo</span></div>
        <div class="pricing-desc">Full evidence chains + daily briefs</div>
        <ul class="pricing-features">
          <li class="pricing-features-header">Everything in Explorer, plus:</li>
          <li>Daily intelligence brief (every morning)</li>
          <li>Full evidence chains (all 150+ countries)</li>
          <li>Unlimited AI analyst queries w/ citations</li>
          <li>5 composite alert rules</li>
          <li>Deep-dive country analysis command</li>
          <li>1 scenario simulation/day</li>
          <li>30-day time-travel intelligence</li>
          <li>Push notifications for crisis alerts</li>
        </ul>
        <button type="button" class="pricing-cta pricing-cta-primary" id="analyst-cta">Start 14-Day Trial</button>
      </div>

      <div class="pricing-card pricing-featured">
        <div class="pricing-badge">RECOMMENDED</div>
        <div class="pricing-tier">Pro</div>
        <div class="pricing-amount">$99<span>/mo</span></div>
        <div class="pricing-desc">Portfolio exposure + unlimited everything</div>
        <ul class="pricing-features">
          <li class="pricing-features-header">Everything in Analyst, plus:</li>
          <li><strong>Portfolio Geopolitical Exposure</strong></li>
          <li>Unlimited scenario simulations</li>
          <li>90-day full history + time-travel</li>
          <li>Crisis playbooks (auto-trigger)</li>
          <li>Priority email briefings</li>
          <li>CSV/JSON data export</li>
          <li>Early access to new features</li>
        </ul>
        <button type="button" class="pricing-cta pricing-cta-primary" id="pro-cta">Start 14-Day Trial</button>
      </div>
    </section>

    <p class="pricing-enterprise">
      Enterprise API from $299/mo — REST API, webhooks, historical export, custom SLA.
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
          <p>Yes — 50% off for students, journalists, academics, and non-profits. Email hello@nexuswatch.dev with proof.</p>
        </div>
        <div class="pricing-faq-item">
          <h3>Is my portfolio data private?</h3>
          <p>Portfolio holdings never leave your browser. Exposure is computed client-side against public CII scores. We literally cannot see your portfolio.</p>
        </div>
        <div class="pricing-faq-item">
          <h3>Can I try before committing?</h3>
          <p>Every paid tier has a 14-day full refund policy. Use everything, cancel if it's not pulling its weight.</p>
        </div>
        <div class="pricing-faq-item">
          <h3>Why is this cheaper than Stratfor or Dataminr?</h3>
          <p>They charge for analyst headcount. We charge for software. Our CII scores, evidence chains, and AI analysis are automated — so we can offer institutional-grade intelligence at consumer prices.</p>
        </div>
      </div>
    </section>
  `;

  container.appendChild(page);

  // === Checkout wiring ===
  const checkoutStatus = document.getElementById('checkout-status');
  const setStatus = (msg: string, color: string) => {
    if (checkoutStatus) {
      checkoutStatus.textContent = msg;
      checkoutStatus.style.color = color;
    }
  };

  async function startCheckout(tier: 'analyst' | 'pro' | 'founding', button: HTMLButtonElement | HTMLAnchorElement) {
    const originalText = button.textContent || '';
    if (button instanceof HTMLButtonElement) button.disabled = true;
    button.textContent = '…';
    if (checkoutStatus) checkoutStatus.textContent = '';

    try {
      const abVariant = localStorage.getItem('nw:ab-analyst') || 'a';
      const variantParam = tier === 'analyst' ? `&variant=${abVariant}` : '';
      const res = await fetch(`/api/stripe/checkout?tier=${tier}${variantParam}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; maxSeats?: number };

      if (res.status === 401) {
        sessionStorage.setItem('nw:pending-checkout', tier);
        setStatus('Redirecting to sign in…', 'var(--nw-text-muted)');
        window.location.href = `/api/auth/google?return=${encodeURIComponent('/#/pricing?resume=' + tier)}`;
        return;
      }

      if (res.status === 403 && tier === 'founding') {
        button.textContent = 'SOLD OUT';
        setStatus(`Founding tier is fully subscribed. Analyst tier is still open at $29/mo.`, 'var(--nw-error)');
        document.getElementById('founding-overlay')?.setAttribute('hidden', '');
        return;
      }

      if (!res.ok || !data.url) throw new Error(data.error || `Checkout failed (${res.status})`);

      setStatus('Redirecting to Stripe…', 'var(--nw-text-muted)');
      window.location.href = data.url;
    } catch (err) {
      if (button instanceof HTMLButtonElement) button.disabled = false;
      button.textContent = originalText;
      setStatus(err instanceof Error ? err.message : 'Checkout failed — try again', 'var(--nw-error)');
    }
  }

  // Wire CTAs
  const analystCta = document.getElementById('analyst-cta') as HTMLButtonElement | null;
  const proCta = document.getElementById('pro-cta') as HTMLButtonElement | null;
  const foundingBtn = document.getElementById('founding-btn') as HTMLButtonElement | null;

  analystCta?.addEventListener('click', () => startCheckout('analyst', analystCta));
  proCta?.addEventListener('click', () => startCheckout('pro', proCta));
  foundingBtn?.addEventListener('click', () => startCheckout('founding', foundingBtn));

  // Resume checkout after OAuth bounce
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const resumeTier = params.get('resume') || sessionStorage.getItem('nw:pending-checkout');
  if (resumeTier === 'analyst' || resumeTier === 'pro' || resumeTier === 'founding') {
    sessionStorage.removeItem('nw:pending-checkout');
    const btn = resumeTier === 'pro' ? proCta : resumeTier === 'founding' ? foundingBtn : analystCta;
    if (btn) void startCheckout(resumeTier, btn);
  }

  // === Founding stock ===
  const foundingOverlay = document.getElementById('founding-overlay');
  const foundingRemaining = document.getElementById('founding-remaining');
  if (foundingOverlay) {
    fetch('/api/stripe/founding-stock')
      .then((r) => r.json())
      .then((data: { remaining?: number; max?: number; soldOut?: boolean }) => {
        if (data.soldOut || !data.remaining || data.remaining <= 0) {
          foundingOverlay.setAttribute('hidden', '');
          return;
        }
        foundingOverlay.removeAttribute('hidden');
        if (foundingRemaining) {
          foundingRemaining.textContent = `${data.remaining} of ${data.max || 100} seats remaining`;
        }
      })
      .catch(() => foundingOverlay.setAttribute('hidden', ''));
  }

  // A/B test
  const abVariant = localStorage.getItem('nw:ab-analyst') || (Math.random() < 0.5 ? 'a' : 'b');
  localStorage.setItem('nw:ab-analyst', abVariant);
  if (abVariant === 'b') {
    const priceEl = document.getElementById('analyst-price');
    if (priceEl) priceEl.innerHTML = '$19<span>/mo</span>';
  }
}
