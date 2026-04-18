/**
 * Pricing Page — Clearance Levels
 *
 * Dossier aesthetic: navy + gold + ivory.
 * Tiers escalate visually from Open Access to Full Clearance.
 */

import '../styles/dossier-public.css';
import { createElement } from '../utils/dom.ts';

export function renderPricingPage(container: HTMLElement): void {
  container.textContent = '';

  const page = createElement('div', { className: 'nw-dossier' });
  page.style.minHeight = '100vh';

  page.innerHTML = `
    <div class="d-container" style="padding-top: 48px; padding-bottom: 64px;">
      <a href="#/intel" class="d-link" style="font-size: 13px; color: var(--d-text-tertiary);">\u2190 Back to Intel Map</a>

      <h1 class="d-display" style="font-size: 40px; margin: 24px 0 12px;">Choose your level of intelligence</h1>
      <p class="d-body" style="max-width: 600px; margin-bottom: 48px;">
        Trust is free. Depth is paid. Every tier includes confidence badges, verification shields, and source attribution — because that's the product.
      </p>

      <div class="pr-grid">
        <div class="pr-card pr-free">
          <span class="d-badge">Open Access</span>
          <div class="pr-name">Explorer</div>
          <div class="pr-price">Free</div>
          <div class="pr-tag">No account required</div>
          <hr class="d-rule" style="margin: 16px 0;">
          <ul class="pr-features">
            <li>Interactive 3D globe with 45+ layers</li>
            <li>Country Instability Index (86 nations)</li>
            <li>Intelligence Brief (Mon/Wed/Fri)</li>
            <li>1 natural language alert</li>
            <li>48-hour timeline preview</li>
            <li>PDF export</li>
          </ul>
          <a href="#/intel" class="d-btn-secondary" style="width: 100%; text-align: center; margin-top: auto;">Open the Map</a>
        </div>

        <div class="pr-card pr-analyst">
          <span class="d-badge-navy d-badge">Analyst Clearance</span>
          <div class="pr-name">Analyst</div>
          <div class="pr-price" id="pricing-analyst-price">$29<span class="pr-period">/mo</span></div>
          <div class="pr-tag">For professionals who need verified intel</div>
          <hr class="d-rule" style="margin: 16px 0;">
          <ul class="pr-features">
            <li>Everything in Explorer, plus:</li>
            <li>Full evidence chains (all 86 countries)</li>
            <li>Unlimited AI analyst queries with citations</li>
            <li>5 composite alert rules</li>
            <li>7-day time-travel intelligence</li>
            <li>Email + Telegram + Slack delivery</li>
            <li>1 scenario simulation per day</li>
          </ul>
          <a href="/api/stripe/checkout?tier=analyst" class="d-btn-primary" style="width: 100%; text-align: center; margin-top: auto;" id="pricing-analyst-cta">Start Analyst</a>
        </div>

        <div class="pr-card pr-pro">
          <span class="d-badge" style="background: rgba(201,168,107,0.15); color: var(--d-gold); border-color: var(--d-gold);">Full Clearance</span>
          <div class="pr-name">Pro</div>
          <div class="pr-price">$99<span class="pr-period">/mo</span></div>
          <div class="pr-tag">Hedge funds, newsrooms, governments</div>
          <hr style="border: none; border-top: 1px solid rgba(248,247,244,0.15); margin: 16px 0;">
          <ul class="pr-features">
            <li>Everything in Analyst, plus:</li>
            <li>Portfolio Geopolitical Exposure</li>
            <li>Unlimited scenario simulations</li>
            <li>90-day time-travel history</li>
            <li>Crisis playbooks (auto-triggered)</li>
            <li>API access (10K calls/mo)</li>
            <li>Personalized brief sections</li>
            <li>Priority support</li>
          </ul>
          <a href="/api/stripe/checkout?tier=pro" class="d-btn-primary" style="width: 100%; text-align: center; margin-top: auto; background: var(--d-gold); color: var(--d-text);">Upgrade to Pro</a>
        </div>
      </div>

      <div class="pr-founding" id="pr-founding" hidden>
        <hr class="d-rule" style="margin: 48px 0 24px;">
        <div class="pr-founding-inner">
          <span class="d-badge">Founding Members \u00b7 First 100 Only</span>
          <h3 class="d-display" style="font-size: 24px; margin: 12px 0 8px;">$19/mo \u00b7 Locked for life</h3>
          <p class="d-body" style="max-width: 500px; margin-bottom: 16px;">
            The first 100 subscribers lock in $19/month Analyst access permanently — even as our retail price rises.
          </p>
          <a href="/api/stripe/checkout?tier=founding" class="d-btn-primary">Claim Founding Spot</a>
        </div>
      </div>

      <hr class="d-rule" style="margin: 48px 0 32px;">

      <h2 class="d-display" style="font-size: 24px; margin-bottom: 24px;">Questions</h2>
      <div class="pr-faq-grid">
        <div class="pr-faq-item">
          <h3 style="font-family: var(--d-serif); font-size: 16px; margin: 0 0 8px;">Why do you charge more than World Monitor?</h3>
          <p style="font-size: 14px; color: var(--d-text-secondary); margin: 0;">Because we do more work. Every number is traceable, every AI claim is cited, every prediction is publicly tracked against outcome.</p>
        </div>
        <div class="pr-faq-item">
          <h3 style="font-family: var(--d-serif); font-size: 16px; margin: 0 0 8px;">What if the free tier already has what I need?</h3>
          <p style="font-size: 14px; color: var(--d-text-secondary); margin: 0;">Then use it. Free is free forever, no card required.</p>
        </div>
        <div class="pr-faq-item">
          <h3 style="font-family: var(--d-serif); font-size: 16px; margin: 0 0 8px;">How do I cancel?</h3>
          <p style="font-size: 14px; color: var(--d-text-secondary); margin: 0;">One click in the billing portal. Prorated refund on unused period. 14-day full refund policy.</p>
        </div>
        <div class="pr-faq-item">
          <h3 style="font-family: var(--d-serif); font-size: 16px; margin: 0 0 8px;">Is my portfolio data private?</h3>
          <p style="font-size: 14px; color: var(--d-text-secondary); margin: 0;">Portfolio holdings never leave your browser. Computed client-side. We literally cannot see your portfolio.</p>
        </div>
      </div>
    </div>
  `;

  container.appendChild(page);

  // Inject pricing-specific styles
  if (!document.getElementById('pr-styles')) {
    const style = document.createElement('style');
    style.id = 'pr-styles';
    style.textContent = `
      .pr-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0;
        border: 1px solid var(--d-border);
        border-radius: var(--d-radius);
        overflow: hidden;
      }
      .pr-card {
        padding: 32px 28px;
        border-right: 1px solid var(--d-border);
        display: flex;
        flex-direction: column;
      }
      .pr-card:last-child { border-right: none; }
      .pr-free { background: var(--d-bg-card); }
      .pr-analyst {
        background: var(--d-bg-card);
        border-left: 3px solid var(--d-navy);
      }
      .pr-pro {
        background: var(--d-navy);
        color: var(--d-bg);
      }
      .pr-name {
        font-family: var(--d-serif);
        font-size: 22px;
        margin: 12px 0 4px;
      }
      .pr-pro .pr-name { color: var(--d-bg); }
      .pr-price {
        font-family: var(--d-mono);
        font-size: 36px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .pr-pro .pr-price { color: var(--d-bg); }
      .pr-period {
        font-size: 14px;
        font-weight: 400;
        color: var(--d-text-tertiary);
      }
      .pr-pro .pr-period { color: rgba(248,247,244,0.5); }
      .pr-tag {
        font-size: 12px;
        color: var(--d-text-tertiary);
      }
      .pr-pro .pr-tag { color: rgba(248,247,244,0.5); }
      .pr-features {
        list-style: none;
        padding: 0;
        margin: 0 0 24px;
        flex: 1;
      }
      .pr-features li {
        font-size: 14px;
        padding: 6px 0;
        color: var(--d-text-secondary);
        border-bottom: 1px solid var(--d-border);
      }
      .pr-pro .pr-features li {
        color: rgba(248,247,244,0.7);
        border-color: rgba(248,247,244,0.1);
      }
      .pr-founding-inner { text-align: center; }
      .pr-faq-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 24px;
      }
      .pr-faq-item {
        padding-bottom: 20px;
        border-bottom: 1px solid var(--d-gold-soft);
      }
      @media (max-width: 768px) {
        .pr-grid { grid-template-columns: 1fr; }
        .pr-card { border-right: none; border-bottom: 1px solid var(--d-border); }
        .pr-card:last-child { border-bottom: none; }
        .pr-faq-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  // A/B test
  const abVariant = localStorage.getItem('nw:ab-analyst') || (Math.random() < 0.5 ? 'a' : 'b');
  localStorage.setItem('nw:ab-analyst', abVariant);
  if (abVariant === 'b') {
    const priceEl = document.getElementById('pricing-analyst-price');
    if (priceEl) priceEl.innerHTML = '$19<span class="pr-period">/mo</span>';
    const ctaEl = document.getElementById('pricing-analyst-cta') as HTMLAnchorElement | null;
    if (ctaEl) ctaEl.href = `/api/stripe/checkout?tier=analyst&variant=b`;
  }
}
