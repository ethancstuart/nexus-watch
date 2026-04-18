import '../styles/landing.css';
import { createElement } from '../utils/dom.ts';

export function renderLanding(root: HTMLElement): void {
  root.textContent = '';

  const page = createElement('div', { className: 'nw-landing' });
  page.innerHTML = `
    <div class="landing-newsletter-bar" id="newsletter-bar">
      <div class="landing-newsletter-bar-inner">
        <span class="landing-newsletter-bar-text">Get <strong>The NexusWatch Brief</strong> — geopolitical intelligence in 3 minutes, free every morning</span>
        <form class="landing-newsletter-bar-form" id="bar-subscribe">
          <input type="email" placeholder="your@email.com" required class="landing-newsletter-bar-input">
          <button type="submit" class="landing-newsletter-bar-btn">SUBSCRIBE</button>
        </form>
        <button class="landing-newsletter-bar-close" id="bar-close" title="Dismiss">✕</button>
      </div>
    </div>

    <nav class="landing-nav">
      <span class="landing-logo">NexusWatch</span>
      <div class="landing-nav-links">
        <a href="#/intel" class="landing-nav-link">OPEN PLATFORM</a>
        <a href="#/about" class="landing-nav-link">ABOUT</a>
        <a href="https://brief.nexuswatch.dev" target="_blank" class="landing-nav-link landing-nav-brief">THE BRIEF</a>
      </div>
    </nav>

    <section class="landing-hero anim-fade-up">
      <div class="landing-hero-badge">VERIFIED GEOPOLITICAL INTELLIGENCE</div>
      <h1 class="landing-hero-title">Intelligence<br>you can audit.</h1>
      <p class="landing-hero-subtitle">
        Every number traced to its source. Every AI claim cited. Every prediction tracked against reality.<br>
        We're the only geopolitical intelligence platform that tells you what we <em>don't</em> know.
      </p>

      <div class="landing-cta-group">
        <a href="#/intel" class="landing-cta-primary">EXPLORE FREE — NO SIGNUP</a>
        <a href="#/pricing" class="landing-cta-secondary">VIEW PRICING</a>
      </div>
      <p class="landing-cta-subtext">Full 3D globe, 35 live layers, CII scores for 86 countries. No credit card, no account.</p>

      <div class="landing-stats">
        <div class="landing-stat"><span class="landing-stat-num">35+</span><span class="landing-stat-label">DATA LAYERS</span></div>
        <div class="landing-stat"><span class="landing-stat-num">86</span><span class="landing-stat-label">COUNTRIES</span></div>
        <div class="landing-stat"><span class="landing-stat-num">12</span><span class="landing-stat-label">VERIFIED SOURCES</span></div>
        <div class="landing-stat"><span class="landing-stat-num">100%</span><span class="landing-stat-label">AUDITABLE</span></div>
      </div>

      <div class="landing-brief-signup">
        <div class="landing-brief-label">Get <strong>The NexusWatch Brief</strong> — 3-minute intelligence scan, free every morning</div>
        <form class="landing-subscribe-form" id="landing-subscribe">
          <input type="email" placeholder="your@email.com" required class="landing-email-input">
          <button type="submit" class="landing-subscribe-btn">SUBSCRIBE FREE</button>
        </form>
        <div class="landing-subscribe-status" id="landing-sub-status"></div>
      </div>
    </section>

    <section class="landing-trust">
      <span class="landing-trust-label">DATA SOURCES</span>
      <div class="landing-trust-logos">
        <span>USGS</span><span>NASA FIRMS</span><span>ACLED</span><span>WHO</span><span>GDACS</span><span>AIS</span><span>GDELT</span><span>Open-Meteo</span>
      </div>
    </section>

    <section class="landing-cii-ticker" id="cii-ticker">
      <div class="landing-ticker-header">
        <span class="landing-ticker-dot"></span>
        <span class="landing-ticker-label">LIVE COUNTRY INSTABILITY INDEX</span>
      </div>
      <div class="landing-ticker-strip" id="cii-ticker-strip">
        <span class="landing-ticker-loading">Loading live intelligence...</span>
      </div>
      <a href="#/intel" class="landing-ticker-cta">Open full map →</a>
    </section>

    <section class="landing-features">
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[◆◆◆]</div>
        <h3>Intelligence Confidence System</h3>
        <p>Every CII score decomposes to its source data. Click 72 → see the 14 ACLED events, 2 USGS quakes, and 23 GDELT articles. With confidence badges.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[🛡🛡]</div>
        <h3>Multi-Source Verification</h3>
        <p>Events tagged CONFIRMED (3+ sources), CORROBORATED (2 sources), or UNVERIFIED (single source) — how actual intel agencies work.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[?!?]</div>
        <h3>Scenario Simulation</h3>
        <p>"What happens if Iran closes the Strait of Hormuz?" Forward-looking what-if analysis with CII deltas, cascade chains, historical precedents.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[📊]</div>
        <h3>Portfolio Geopolitical Exposure</h3>
        <p>Map your holdings to country-level risk. "Your portfolio has 23% exposure to countries with CII > 60." For hedge funds and family offices.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[◷◷◷]</div>
        <h3>Time-Travel Intelligence</h3>
        <p>Scrub through history. See what the Middle East looked like 6 months ago. Track Sudan's trajectory week by week. 90 days of CII history.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[✓✗]</div>
        <h3>Prediction Ledger</h3>
        <p>We publish our accuracy. "Learning in public." Every assessment tracked against outcome. We'll never hide a wrong call.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[!⚠!]</div>
        <h3>Crisis Playbooks</h3>
        <p>Auto-activates when major events fire. Historical precedent, monitoring priorities, at-risk infrastructure — all in one modal.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[<=>]</div>
        <h3>Risk Cascade Engine</h3>
        <p>56 cross-border dependency rules. Sudan → Chad refugees. Iran → Japan oil. Taiwan → US semiconductors. See how crises propagate.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[!?!]</div>
        <h3>Natural Language Alerts</h3>
        <p>"Alert me when Sudan CII > 60 AND oil moves > 3%." Composite multi-condition alerts with AND/OR logic.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[<->]</div>
        <h3>Entity Graph</h3>
        <p>Palantir-inspired investigation. Click any country to see proxy networks, alliances, chokepoint dependencies, and conflict actors.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[---]</div>
        <h3>Dark Vessel Detection</h3>
        <p>Ships that stop broadcasting AIS near sensitive waters get flagged. Hormuz. Bab el-Mandeb. Taiwan Strait. Automatic.</p>
      </div>
    </section>

    <section class="landing-portfolio-demo anim-fade-up">
      <div class="landing-portfolio-header">
        <h2>Portfolio Geopolitical Exposure</h2>
        <span class="landing-brief-badge">LIVE DEMO</span>
      </div>
      <p class="landing-portfolio-desc">See how geopolitical risk maps to real holdings. This is a sample portfolio — <a href="#/portfolio">run your own</a> with Pro.</p>
      <div class="landing-portfolio-holdings">
        <span class="landing-holding-chip">TSM 25%</span>
        <span class="landing-holding-chip">XOM 20%</span>
        <span class="landing-holding-chip">AAPL 30%</span>
        <span class="landing-holding-chip">VWO 25%</span>
      </div>
      <div class="landing-portfolio-result" id="portfolio-demo-result">
        <span class="landing-ticker-loading">Analyzing geopolitical exposure...</span>
      </div>
    </section>

    <section class="landing-brief-preview">
      <div class="landing-brief-header">
        <h2>Today's NexusWatch Brief</h2>
        <span class="landing-brief-badge">SAMPLE</span>
      </div>
      <div class="landing-brief-content" id="landing-brief-preview">Loading today's brief...</div>
      <div class="landing-brief-fade"></div>
      <div class="landing-brief-cta">
        <p>Get the full brief delivered free every morning</p>
        <form class="landing-subscribe-form" id="brief-subscribe">
          <input type="email" placeholder="your@email.com" required class="landing-email-input">
          <button type="submit" class="landing-subscribe-btn">SUBSCRIBE TO THE BRIEF</button>
        </form>
        <div class="landing-subscribe-status" id="brief-sub-status"></div>
      </div>
    </section>

    <section class="landing-pricing">
      <h2>Pricing</h2>

      <div class="landing-founding-banner" id="founding-banner" hidden>
        <div class="landing-founding-inner">
          <div class="landing-founding-text">
            <strong>FOUNDING MEMBERS</strong> — First 100 subscribers get
            <span class="landing-founding-price">$19/mo lifetime</span>
            on the Analyst tier.
            <span class="landing-founding-remaining" id="founding-remaining"></span>
          </div>
          <button type="button" class="landing-founding-btn" id="founding-btn" data-tier="founding">
            CLAIM FOUNDING SEAT
          </button>
        </div>
      </div>

      <div class="landing-pricing-grid three-tier">
        <div class="landing-price-card landing-price-free">
          <div class="landing-price-badge-free">START HERE</div>
          <div class="landing-price-tier">FREE</div>
          <div class="landing-price-amount">$0</div>
          <ul class="landing-price-features">
            <li>Full 3D globe with 35 live layers</li>
            <li>Country Instability Index (86 nations)</li>
            <li>Intelligence Brief (Mon/Wed/Fri)</li>
            <li>1 natural language alert</li>
            <li>48-hour timeline preview</li>
            <li>PDF export</li>
            <li>Cinema Mode (watermarked)</li>
          </ul>
          <a href="#/intel" class="landing-price-btn landing-price-btn-free">OPEN THE MAP — FREE</a>
        </div>
        <div class="landing-price-card">
          <div class="landing-price-tier">ANALYST</div>
          <div class="landing-price-amount" id="analyst-price">$29<span>/mo</span></div>
          <ul class="landing-price-features">
            <li>Everything in Free, plus:</li>
            <li>Daily intelligence brief</li>
            <li>5 natural language alerts</li>
            <li>7-day timeline playback</li>
            <li>Email alert delivery</li>
            <li>Pro Insight sections in briefs</li>
          </ul>
          <button type="button" class="landing-price-btn" data-tier="analyst">START ANALYST</button>
        </div>
        <div class="landing-price-card featured">
          <div class="landing-price-tier">PRO</div>
          <div class="landing-price-amount">$99<span>/mo</span></div>
          <ul class="landing-price-features">
            <li>Everything in Analyst, plus:</li>
            <li>Unlimited alerts</li>
            <li>90-day timeline playback</li>
            <li>Cinema Mode (no watermark)</li>
            <li>API access (10K calls/mo)</li>
            <li>Personalized brief sections</li>
            <li>Priority support</li>
          </ul>
          <button type="button" class="landing-price-btn featured" data-tier="pro">UPGRADE TO PRO</button>
        </div>
      </div>
      <p class="landing-pricing-note">No credit card required for Free. No account needed. Just intelligence.</p>
      <div class="landing-checkout-status" id="checkout-status" role="status" aria-live="polite"></div>
    </section>

    <footer class="landing-footer">
      <div class="landing-footer-brand">NexusWatch Intelligence Platform</div>
      <div class="landing-footer-links">
        <a href="#/pricing">Pricing</a>
        <a href="#/methodology">Methodology</a>
        <a href="#/accuracy">Accuracy Ledger</a>
        <a href="#/audit">Audit Trail</a>
        <a href="#/status">System Status</a>
        <a href="#/api">API Docs</a>
        <a href="#/briefs">Brief Archive</a>
        <a href="#/whats-new">What's New</a>
        <a href="#/about">About</a>
        <a href="#/roadmap">Roadmap</a>
      </div>
      <div class="landing-footer-copy">Built with Claude Code. Deployed on Vercel.</div>
    </footer>
  `;

  root.appendChild(page);

  // Entrance animations via IntersectionObserver
  const animElements = page.querySelectorAll('.anim-fade-up');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('visible'), index * 100);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 },
  );
  animElements.forEach((el) => observer.observe(el));

  // Subscribe form handler (shared across all forms)
  function setupSubscribeForm(formId: string, statusId: string) {
    const form = document.getElementById(formId) as HTMLFormElement;
    const statusEl = document.getElementById(statusId);
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (form.querySelector('input') as HTMLInputElement).value;
      if (statusEl) {
        statusEl.textContent = 'Subscribing...';
        statusEl.style.color = '#888';
      }
      try {
        const res = await fetch('/api/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: formId }),
        });
        const data = await res.json();
        if (statusEl) {
          statusEl.textContent = data.success
            ? "✓ You're in! First brief arrives tomorrow morning."
            : data.error || 'Failed';
          statusEl.style.color = data.success ? '#22c55e' : '#ef4444';
        }
      } catch {
        if (statusEl) {
          statusEl.textContent = 'Network error — try again';
          statusEl.style.color = '#ef4444';
        }
      }
    });
  }

  setupSubscribeForm('landing-subscribe', 'landing-sub-status');
  setupSubscribeForm('bar-subscribe', 'landing-sub-status');
  setupSubscribeForm('brief-subscribe', 'brief-sub-status');

  // Newsletter bar dismiss
  const barClose = document.getElementById('bar-close');
  const bar = document.getElementById('newsletter-bar');
  barClose?.addEventListener('click', () => {
    bar?.remove();
    localStorage.setItem('nw:bar-dismissed', '1');
  });
  if (localStorage.getItem('nw:bar-dismissed') === '1') {
    bar?.remove();
  }

  // ── Analyst pricing A/B test ─────────────────────────────────────────────
  // Variant A = $29/mo (control), Variant B = $19/mo (test).
  // Assignment is sticky via localStorage.
  const abVariant = localStorage.getItem('nw:ab-analyst') || (Math.random() < 0.5 ? 'a' : 'b');
  localStorage.setItem('nw:ab-analyst', abVariant);

  if (abVariant === 'b') {
    const priceEl = document.getElementById('analyst-price');
    if (priceEl) priceEl.innerHTML = '$19<span>/mo</span>';
  }

  // ── Pricing checkout wiring ──────────────────────────────────────────────
  // Replaces the old dead hrefs that navigated to #/intel. Now each paid
  // tier button POSTs to /api/stripe/checkout with the tier query parameter
  // and redirects to the returned Stripe session URL.
  const checkoutStatus = document.getElementById('checkout-status');
  const setStatus = (message: string, color: string) => {
    if (!checkoutStatus) return;
    checkoutStatus.textContent = message;
    checkoutStatus.style.color = color;
  };
  const clearStatus = () => {
    if (checkoutStatus) checkoutStatus.textContent = '';
  };

  async function startCheckout(tier: 'analyst' | 'pro' | 'founding', button: HTMLButtonElement) {
    const originalText = button.textContent || '';
    button.disabled = true;
    button.textContent = '…';
    clearStatus();
    try {
      const variantParam = tier === 'analyst' ? `&variant=${abVariant}` : '';
      const res = await fetch(`/api/stripe/checkout?tier=${tier}${variantParam}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        maxSeats?: number;
      };

      if (res.status === 401) {
        // Not logged in — bounce to OAuth, then bounce back to resume checkout.
        // We store the pending tier in sessionStorage so the post-OAuth handler
        // can pick it back up and re-initiate the checkout.
        sessionStorage.setItem('nw:pending-checkout', tier);
        setStatus('Redirecting to sign in…', '#888');
        window.location.href = `/api/auth/google?return=${encodeURIComponent('/#/?resume-checkout=' + tier)}`;
        return;
      }

      if (res.status === 403 && tier === 'founding') {
        button.textContent = 'SOLD OUT';
        setStatus(
          `Founding tier is fully subscribed (${data.maxSeats || 100} seats filled). Analyst tier is still open at $29/mo.`,
          '#ef4444',
        );
        // Also hide the founding banner since it's now confirmed sold out
        document.getElementById('founding-banner')?.setAttribute('hidden', '');
        return;
      }

      if (!res.ok || !data.url) {
        throw new Error(data.error || `Checkout failed (${res.status})`);
      }

      setStatus('Redirecting to Stripe…', '#888');
      window.location.href = data.url;
    } catch (err) {
      console.error('[landing] Checkout failed:', err);
      button.disabled = false;
      button.textContent = originalText;
      setStatus(err instanceof Error ? err.message : 'Checkout failed — try again', '#ef4444');
    }
  }

  // Wire all buttons that declare a data-tier attribute.
  page.querySelectorAll<HTMLButtonElement>('button[data-tier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.tier as 'analyst' | 'pro' | 'founding' | undefined;
      if (tier === 'analyst' || tier === 'pro' || tier === 'founding') {
        void startCheckout(tier, btn);
      }
    });
  });

  // Resume a checkout that was interrupted by an OAuth bounce.
  const resumeTier = sessionStorage.getItem('nw:pending-checkout');
  if (resumeTier === 'analyst' || resumeTier === 'pro' || resumeTier === 'founding') {
    sessionStorage.removeItem('nw:pending-checkout');
    const resumeBtn = page.querySelector<HTMLButtonElement>(`button[data-tier="${resumeTier}"]`);
    if (resumeBtn) {
      void startCheckout(resumeTier, resumeBtn);
    }
  }

  // ── Founding stock fetch ─────────────────────────────────────────────────
  // The banner is hidden by default and only shown when seats remain. The
  // endpoint is short-cached (10s) so the badge stays fresh as users claim
  // seats. If the fetch fails the banner stays hidden — we'd rather
  // undersell gracefully than show a broken badge.
  const foundingBanner = document.getElementById('founding-banner');
  const foundingRemainingEl = document.getElementById('founding-remaining');
  if (foundingBanner) {
    fetch('/api/stripe/founding-stock')
      .then((r) => r.json())
      .then((data: { remaining?: number; max?: number; soldOut?: boolean }) => {
        if (data.soldOut || !data.remaining || data.remaining <= 0) {
          foundingBanner.setAttribute('hidden', '');
          return;
        }
        foundingBanner.removeAttribute('hidden');
        if (foundingRemainingEl) {
          foundingRemainingEl.textContent = `(${data.remaining} of ${data.max || 100} seats left)`;
        }
      })
      .catch(() => {
        foundingBanner.setAttribute('hidden', '');
      });
  }

  // ── Live CII ticker ────────────────────────────────────────────────────
  const tickerStrip = document.getElementById('cii-ticker-strip');
  if (tickerStrip) {
    fetch('/api/cii')
      .then((r) => r.json())
      .then((data: { scores?: Array<{ countryCode: string; score: number; trend: string }> }) => {
        const scores = data.scores || [];
        if (scores.length === 0) {
          tickerStrip.innerHTML =
            '<span class="landing-ticker-loading">Intelligence data loading — check back shortly.</span>';
          return;
        }
        // Sort by score desc, take top 12
        const top = scores.sort((a, b) => b.score - a.score).slice(0, 12);
        tickerStrip.innerHTML = top
          .map((s) => {
            const color = s.score >= 70 ? '#dc2626' : s.score >= 50 ? '#ff6600' : s.score >= 30 ? '#eab308' : '#22c55e';
            const arrow = s.trend === 'rising' ? '↑' : s.trend === 'falling' ? '↓' : '→';
            return `<a href="#/intel" class="landing-ticker-item" title="${s.countryCode}: CII ${s.score}">
              <span class="landing-ticker-code">${s.countryCode}</span>
              <span class="landing-ticker-score" style="color:${color}">${s.score}</span>
              <span class="landing-ticker-arrow" style="color:${color}">${arrow}</span>
            </a>`;
          })
          .join('');
      })
      .catch(() => {
        tickerStrip.innerHTML = '<span class="landing-ticker-loading">Live data unavailable</span>';
      });
  }

  // ── Portfolio demo ─────────────────────────────────────────────────────
  const demoResult = document.getElementById('portfolio-demo-result');
  if (demoResult) {
    fetch('/api/public/exposure-demo')
      .then((r) => r.json())
      .then(
        (data: {
          overall_risk?: number;
          risk_label?: string;
          elevated_countries?: Array<{ country_code: string; exposure_pct: number; cii_score: number | null }>;
          chokepoint_exposure?: Array<{ chokepoint_name: string; exposure_pct: number; status: string }>;
        }) => {
          if (!data.overall_risk && data.overall_risk !== 0) {
            demoResult.innerHTML =
              '<span class="landing-ticker-loading">Demo data loading — check back shortly.</span>';
            return;
          }
          const riskColor =
            (data.overall_risk ?? 0) >= 60 ? '#dc2626' : (data.overall_risk ?? 0) >= 40 ? '#ff6600' : '#22c55e';
          const elevated = data.elevated_countries || [];
          const chokepoints = data.chokepoint_exposure || [];

          demoResult.innerHTML = `
          <div class="landing-demo-grid">
            <div class="landing-demo-risk">
              <div class="landing-demo-risk-score" style="color:${riskColor}">${data.overall_risk}</div>
              <div class="landing-demo-risk-label">${data.risk_label || 'N/A'}</div>
              <div class="landing-demo-risk-note">Geopolitical Risk Score</div>
            </div>
            <div class="landing-demo-details">
              ${
                elevated.length > 0
                  ? `<div class="landing-demo-section">
                  <div class="landing-demo-section-title">ELEVATED-RISK COUNTRIES</div>
                  ${elevated
                    .slice(0, 4)
                    .map(
                      (c) =>
                        `<div class="landing-demo-row"><span>${c.country_code}</span><span>CII ${c.cii_score ?? '?'}</span><span>${c.exposure_pct?.toFixed(1) ?? '?'}% exposed</span></div>`,
                    )
                    .join('')}
                </div>`
                  : ''
              }
              ${
                chokepoints.length > 0
                  ? `<div class="landing-demo-section">
                  <div class="landing-demo-section-title">CHOKEPOINT DEPENDENCIES</div>
                  ${chokepoints
                    .slice(0, 3)
                    .map(
                      (c) =>
                        `<div class="landing-demo-row"><span>${c.chokepoint_name}</span><span>${c.status}</span><span>${c.exposure_pct?.toFixed(1) ?? '?'}%</span></div>`,
                    )
                    .join('')}
                </div>`
                  : ''
              }
            </div>
          </div>
          <a href="#/portfolio" class="landing-demo-cta">Run your own portfolio →</a>
        `;
        },
      )
      .catch(() => {
        demoResult.innerHTML = '<span class="landing-ticker-loading">Portfolio analysis unavailable</span>';
      });
  }

  // Load today's brief preview
  const briefEl = document.getElementById('landing-brief-preview');
  if (briefEl) {
    fetch('/api/v1/brief')
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) {
          // Show the brief with proper markdown rendering
          let preview = data.summary as string;
          // If it's HTML (old format), show as-is truncated
          // If it's markdown (new format), convert basics
          if (!preview.startsWith('<')) {
            preview = preview
              .replace(
                /## (.*)/g,
                '<h3 style="color:#ff6600;font-size:13px;letter-spacing:1px;margin:16px 0 8px;">$1</h3>',
              )
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/\n\n/g, '<br><br>')
              .replace(/\n/g, '<br>');
          }
          // Show first ~800 chars (the fade overlay handles the cutoff)
          briefEl.innerHTML = `<div class="brief-preview-text">${preview.slice(0, 1200)}</div>`;
        } else {
          briefEl.innerHTML =
            '<p style="color:#666;text-align:center;">The NexusWatch Brief publishes every morning at 5 AM ET.<br>Subscribe to get it in your inbox.</p>';
        }
      })
      .catch(() => {
        briefEl.innerHTML =
          '<p style="color:#666;text-align:center;">The NexusWatch Brief publishes every morning at 5 AM ET.</p>';
      });
  }
}
