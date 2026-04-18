import '../styles/dossier-public.css';
import '../styles/landing.css';
import { createElement } from '../utils/dom.ts';

export function renderLanding(root: HTMLElement): void {
  root.textContent = '';

  const page = createElement('div', { className: 'nw-landing nw-dossier' });
  page.innerHTML = `
    <nav class="ld-nav d-container">
      <a href="#/" class="ld-nav-logo">NexusWatch</a>
      <div class="ld-nav-links">
        <a href="#/intel" class="ld-nav-link d-link">Platform</a>
        <a href="#/accuracy" class="ld-nav-link d-link">Accuracy</a>
        <a href="#/pricing" class="ld-nav-link d-link">Pricing</a>
        <a href="https://brief.nexuswatch.dev" target="_blank" class="ld-nav-link d-link">The Brief</a>
      </div>
    </nav>

    <section class="ld-hero d-container">
      <span class="d-kicker">Verified Geopolitical Intelligence</span>
      <h1 class="ld-hero-title d-display">Intelligence<br>you can audit.</h1>
      <p class="ld-hero-sub d-body">
        Every number traced to its source. Every AI claim cited. Every prediction tracked against reality.
        We're the only geopolitical intelligence platform that tells you what we <em>don't</em> know.
      </p>
      <div class="ld-hero-ctas">
        <a href="#/intel" class="d-btn-primary">Explore Free</a>
        <a href="#/pricing" class="d-btn-secondary">View Pricing</a>
      </div>
      <p class="ld-hero-note">Full 3D globe, 35 live layers, CII scores for 86 countries. No credit card, no account.</p>
    </section>

    <hr class="d-rule-thick">

    <section class="ld-ticker-section d-container" id="cii-ticker">
      <div class="ld-ticker-header">
        <span class="ld-ticker-dot"></span>
        <span class="d-kicker" style="color: var(--d-text-tertiary)">Live Country Instability Index</span>
      </div>
      <div class="ld-ticker-strip" id="cii-ticker-strip">
        <span class="ld-ticker-placeholder">Loading live intelligence...</span>
      </div>
    </section>

    <hr class="d-rule">

    <section class="ld-stats d-container">
      <div class="ld-stats-grid">
        <div class="ld-stat"><span class="ld-stat-num d-data">45+</span><span class="d-label">Data Layers</span></div>
        <div class="ld-stat"><span class="ld-stat-num d-data">86</span><span class="d-label">Countries</span></div>
        <div class="ld-stat"><span class="ld-stat-num d-data">12</span><span class="d-label">Verified Sources</span></div>
        <div class="ld-stat"><span class="ld-stat-num d-data">100%</span><span class="d-label">Auditable</span></div>
      </div>
    </section>

    <hr class="d-rule">

    <section class="ld-trust d-container">
      <span class="d-kicker" style="color: var(--d-text-dim)">Data Sources</span>
      <div class="ld-trust-logos">
        <span>USGS</span><span>NASA FIRMS</span><span>ACLED</span><span>WHO</span><span>GDACS</span><span>AIS</span><span>GDELT</span><span>Open-Meteo</span><span>OFAC</span><span>V-Dem</span>
      </div>
    </section>

    <section class="ld-features d-container d-section">
      <span class="d-kicker">What You Get</span>
      <h2 class="ld-features-title d-display" style="font-size: 32px; margin: 12px 0 40px;">Every intelligence product shows you their best guesses.<br>None of them show you which guesses were wrong.</h2>

      <div class="ld-features-grid">
        <div class="ld-feature d-fade-in">
          <h3 class="ld-feature-title">Intelligence Confidence System</h3>
          <p>Every CII score decomposes to its source data. Click 72 — see the 14 ACLED events, 2 USGS quakes, and 23 GDELT articles. With confidence badges.</p>
        </div>
        <div class="ld-feature d-fade-in">
          <h3 class="ld-feature-title">Multi-Source Verification</h3>
          <p>Events tagged CONFIRMED (3+ sources), CORROBORATED (2 sources), or UNVERIFIED (single source) — how actual intel agencies work.</p>
        </div>
        <div class="ld-feature d-fade-in">
          <h3 class="ld-feature-title">Scenario Simulation</h3>
          <p>"What happens if Iran closes the Strait of Hormuz?" Forward-looking what-if analysis with CII deltas, cascade chains, and historical precedents.</p>
        </div>
        <div class="ld-feature d-fade-in">
          <h3 class="ld-feature-title">Portfolio Geopolitical Exposure</h3>
          <p>Map your holdings to country-level risk. "Your portfolio has 23% exposure to countries with CII &gt; 60." For hedge funds and family offices.</p>
        </div>
        <div class="ld-feature d-fade-in">
          <h3 class="ld-feature-title">Time-Travel Intelligence</h3>
          <p>Scrub through history. See what the Middle East looked like 6 months ago. Track Sudan's trajectory week by week.</p>
        </div>
        <div class="ld-feature d-fade-in">
          <h3 class="ld-feature-title">Prediction Ledger</h3>
          <p>We publish our accuracy. Every assessment tracked against outcome. We'll never hide a wrong call. <a href="#/accuracy" class="d-link">See our track record.</a></p>
        </div>
        <div class="ld-feature d-fade-in">
          <h3 class="ld-feature-title">Crisis Playbooks</h3>
          <p>Auto-activates when major events fire. Historical precedent, monitoring priorities, at-risk infrastructure — all in one modal.</p>
        </div>
        <div class="ld-feature d-fade-in">
          <h3 class="ld-feature-title">Risk Cascade Engine</h3>
          <p>56 cross-border dependency rules. Sudan → Chad refugees. Iran → Japan oil. Taiwan → US semiconductors. See how crises propagate.</p>
        </div>
        <div class="ld-feature d-fade-in">
          <h3 class="ld-feature-title">Natural Language Alerts</h3>
          <p>"Alert me when Sudan CII &gt; 60 AND oil moves &gt; 3%." Composite multi-condition alerts with AND/OR logic. Delivered via email, Telegram, or Slack.</p>
        </div>
      </div>
    </section>

    <section class="ld-portfolio-demo d-container d-section d-fade-in">
      <span class="d-kicker">Live Demo</span>
      <h2 class="d-display" style="font-size: 28px; margin: 12px 0 8px;">Portfolio Geopolitical Exposure</h2>
      <p class="d-body" style="margin-bottom: 20px;">See how geopolitical risk maps to real holdings. <a href="#/portfolio" class="d-link">Run your own portfolio</a> with Pro.</p>
      <div class="ld-demo-holdings">
        <span class="ld-demo-chip">TSM 25%</span>
        <span class="ld-demo-chip">XOM 20%</span>
        <span class="ld-demo-chip">AAPL 30%</span>
        <span class="ld-demo-chip">VWO 25%</span>
      </div>
      <div class="ld-demo-result" id="portfolio-demo-result">
        <span class="ld-ticker-placeholder">Analyzing geopolitical exposure...</span>
      </div>
    </section>

    <section class="ld-brief-section d-container d-section d-fade-in">
      <span class="d-kicker">The NexusWatch Brief</span>
      <h2 class="d-display" style="font-size: 28px; margin: 12px 0 8px;">Geopolitical intelligence in 3 minutes</h2>
      <p class="d-body" style="margin-bottom: 24px;">Free every morning. CII scores, risk signals, and analyst assessments — delivered before your first meeting.</p>
      <div class="ld-brief-content" id="landing-brief-preview">Loading today's brief...</div>
      <div class="ld-brief-fade"></div>
      <form class="ld-subscribe-form" id="landing-subscribe">
        <input type="email" placeholder="your@email.com" required class="ld-subscribe-input">
        <button type="submit" class="d-btn-primary" style="padding: 10px 24px;">Subscribe Free</button>
      </form>
      <div class="ld-subscribe-status" id="landing-sub-status"></div>
    </section>

    <section class="ld-pricing d-container d-section">
      <span class="d-kicker">Pricing</span>
      <h2 class="d-display" style="font-size: 32px; margin: 12px 0 8px;">Trust is free. Depth is paid.</h2>
      <p class="d-body" style="margin-bottom: 40px;">Every tier includes confidence badges, verification shields, and source attribution — because that's the product.</p>

      <div class="ld-founding-banner" id="founding-banner" hidden>
        <div class="ld-founding-inner">
          <span class="d-badge">Founding Members</span>
          <span class="ld-founding-text">First 100 subscribers get <strong>$19/mo lifetime</strong> on the Analyst tier. <span id="founding-remaining"></span></span>
          <button type="button" class="d-btn-primary" id="founding-btn" data-tier="founding" style="padding: 8px 20px; font-size: 12px;">Claim Seat</button>
        </div>
      </div>

      <div class="ld-pricing-grid">
        <div class="ld-price-card ld-price-free">
          <span class="d-badge">Open Access</span>
          <div class="ld-price-name">Explorer</div>
          <div class="ld-price-amount">$0</div>
          <ul class="ld-price-features">
            <li>Full 3D globe with 45 live layers</li>
            <li>Country Instability Index (86 nations)</li>
            <li>Intelligence Brief (Mon/Wed/Fri)</li>
            <li>1 natural language alert</li>
            <li>48-hour timeline preview</li>
          </ul>
          <a href="#/intel" class="d-btn-secondary" style="width: 100%; text-align: center;">Open the Map</a>
        </div>
        <div class="ld-price-card ld-price-analyst">
          <span class="d-badge-navy d-badge">Analyst Clearance</span>
          <div class="ld-price-name">Analyst</div>
          <div class="ld-price-amount" id="analyst-price">$29<span>/mo</span></div>
          <ul class="ld-price-features">
            <li>Everything in Explorer, plus:</li>
            <li>Daily intelligence brief</li>
            <li>5 natural language alerts</li>
            <li>7-day timeline playback</li>
            <li>Email + Telegram + Slack alerts</li>
          </ul>
          <button type="button" class="d-btn-primary" data-tier="analyst" style="width: 100%;">Start Analyst</button>
        </div>
        <div class="ld-price-card ld-price-pro">
          <span class="d-badge" style="background: var(--d-navy); color: var(--d-bg); border-color: var(--d-navy);">Full Clearance</span>
          <div class="ld-price-name" style="color: var(--d-bg);">Pro</div>
          <div class="ld-price-amount" style="color: var(--d-bg);">$99<span>/mo</span></div>
          <ul class="ld-price-features" style="color: rgba(248,247,244,0.7);">
            <li>Everything in Analyst, plus:</li>
            <li>Unlimited alerts</li>
            <li>90-day timeline playback</li>
            <li>API access (10K calls/mo)</li>
            <li>Portfolio exposure analysis</li>
            <li>Personalized brief sections</li>
          </ul>
          <button type="button" class="d-btn-primary" data-tier="pro" style="width: 100%; background: var(--d-gold); color: var(--d-text);">Upgrade to Pro</button>
        </div>
      </div>
      <p class="ld-pricing-note">No credit card required for Free. No account needed. Just intelligence.</p>
      <div class="ld-checkout-status" id="checkout-status" role="status" aria-live="polite"></div>
    </section>

    <footer class="ld-footer d-container">
      <hr class="d-rule" style="margin-bottom: 32px;">
      <div class="ld-footer-brand">NexusWatch</div>
      <div class="ld-footer-links">
        <a href="#/pricing" class="d-link">Pricing</a>
        <a href="#/methodology" class="d-link">Methodology</a>
        <a href="#/accuracy" class="d-link">Accuracy Ledger</a>
        <a href="#/status" class="d-link">System Status</a>
        <a href="#/apidocs" class="d-link">API Docs</a>
        <a href="#/briefs" class="d-link">Brief Archive</a>
        <a href="#/roadmap" class="d-link">Roadmap</a>
      </div>
      <div class="ld-footer-copy">Built with Claude Code. Deployed on Vercel.</div>
    </footer>
  `;

  root.appendChild(page);

  // ── Entrance animations ──
  const animElements = page.querySelectorAll('.d-fade-in');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('visible'), index * 80);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 },
  );
  animElements.forEach((el) => observer.observe(el));

  // ── Subscribe form handler ──
  function setupSubscribeForm(formId: string, statusId: string) {
    const form = document.getElementById(formId) as HTMLFormElement;
    const statusEl = document.getElementById(statusId);
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (form.querySelector('input') as HTMLInputElement).value;
      if (statusEl) {
        statusEl.textContent = 'Subscribing...';
        statusEl.style.color = 'var(--d-text-dim)';
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
            ? "You're in. First brief arrives tomorrow morning."
            : data.error || 'Failed';
          statusEl.style.color = data.success ? 'var(--d-green)' : 'var(--d-red)';
        }
      } catch {
        if (statusEl) {
          statusEl.textContent = 'Network error — try again';
          statusEl.style.color = 'var(--d-red)';
        }
      }
    });
  }

  setupSubscribeForm('landing-subscribe', 'landing-sub-status');

  // ── Analyst pricing A/B test ──
  const abVariant = localStorage.getItem('nw:ab-analyst') || (Math.random() < 0.5 ? 'a' : 'b');
  localStorage.setItem('nw:ab-analyst', abVariant);
  if (abVariant === 'b') {
    const priceEl = document.getElementById('analyst-price');
    if (priceEl) priceEl.innerHTML = '$19<span>/mo</span>';
  }

  // ── Pricing checkout wiring ──
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
    button.textContent = '...';
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
        sessionStorage.setItem('nw:pending-checkout', tier);
        setStatus('Redirecting to sign in...', 'var(--d-text-dim)');
        window.location.href = `/api/auth/google?return=${encodeURIComponent('/#/?resume-checkout=' + tier)}`;
        return;
      }

      if (res.status === 403 && tier === 'founding') {
        button.textContent = 'SOLD OUT';
        setStatus('Founding tier is fully subscribed.', 'var(--d-red)');
        document.getElementById('founding-banner')?.setAttribute('hidden', '');
        return;
      }

      if (!res.ok || !data.url) {
        throw new Error(data.error || `Checkout failed (${res.status})`);
      }

      setStatus('Redirecting to Stripe...', 'var(--d-text-dim)');
      window.location.href = data.url;
    } catch (err) {
      button.disabled = false;
      button.textContent = originalText;
      setStatus(err instanceof Error ? err.message : 'Checkout failed', 'var(--d-red)');
    }
  }

  page.querySelectorAll<HTMLButtonElement>('button[data-tier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.tier as 'analyst' | 'pro' | 'founding' | undefined;
      if (tier === 'analyst' || tier === 'pro' || tier === 'founding') {
        void startCheckout(tier, btn);
      }
    });
  });

  // Resume checkout after OAuth
  const resumeTier = sessionStorage.getItem('nw:pending-checkout');
  if (resumeTier === 'analyst' || resumeTier === 'pro' || resumeTier === 'founding') {
    sessionStorage.removeItem('nw:pending-checkout');
    const resumeBtn = page.querySelector<HTMLButtonElement>(`button[data-tier="${resumeTier}"]`);
    if (resumeBtn) void startCheckout(resumeTier, resumeBtn);
  }

  // ── Founding stock ──
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
      .catch(() => foundingBanner.setAttribute('hidden', ''));
  }

  // ── Live CII ticker ──
  const tickerStrip = document.getElementById('cii-ticker-strip');
  if (tickerStrip) {
    fetch('/api/cii')
      .then((r) => r.json())
      .then((data: { scores?: Array<{ countryCode: string; score: number; trend: string }> }) => {
        const scores = data.scores || [];
        if (scores.length === 0) {
          tickerStrip.innerHTML = '<span class="ld-ticker-placeholder">Intelligence data loading.</span>';
          return;
        }
        const top = scores.sort((a, b) => b.score - a.score).slice(0, 12);
        tickerStrip.innerHTML = top
          .map((s) => {
            const color =
              s.score >= 70
                ? 'var(--d-oxblood)'
                : s.score >= 50
                  ? 'var(--d-orange)'
                  : s.score >= 30
                    ? 'var(--d-gold)'
                    : 'var(--d-green)';
            const arrow = s.trend === 'rising' ? '\u2191' : s.trend === 'falling' ? '\u2193' : '\u2192';
            return `<a href="#/intel" class="ld-ticker-item" title="${s.countryCode}: CII ${s.score}">
              <span class="ld-ticker-code">${s.countryCode}</span>
              <span class="ld-ticker-score" style="color:${color}">${s.score}</span>
              <span class="ld-ticker-arrow" style="color:${color}">${arrow}</span>
            </a>`;
          })
          .join('');
      })
      .catch(() => {
        tickerStrip.innerHTML = '<span class="ld-ticker-placeholder">Live data unavailable</span>';
      });
  }

  // ── Portfolio demo ──
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
            demoResult.innerHTML = '<span class="ld-ticker-placeholder">Demo loading.</span>';
            return;
          }
          const riskColor =
            (data.overall_risk ?? 0) >= 60
              ? 'var(--d-oxblood)'
              : (data.overall_risk ?? 0) >= 40
                ? 'var(--d-orange)'
                : 'var(--d-green)';
          const elevated = data.elevated_countries || [];
          const chokepoints = data.chokepoint_exposure || [];

          demoResult.innerHTML = `
          <div class="ld-demo-grid">
            <div class="ld-demo-risk">
              <div class="ld-demo-risk-score" style="color:${riskColor}">${data.overall_risk}</div>
              <div class="ld-demo-risk-label d-label">${data.risk_label || 'N/A'}</div>
              <div class="ld-demo-risk-note">Geopolitical Risk Score</div>
            </div>
            <div class="ld-demo-details">
              ${
                elevated.length > 0
                  ? `<div class="ld-demo-section">
                  <div class="d-label" style="margin-bottom: 8px;">Elevated-Risk Countries</div>
                  ${elevated
                    .slice(0, 4)
                    .map(
                      (c) =>
                        `<div class="ld-demo-row"><span>${c.country_code}</span><span class="d-data">CII ${c.cii_score ?? '?'}</span><span class="d-data">${c.exposure_pct?.toFixed(1) ?? '?'}%</span></div>`,
                    )
                    .join('')}
                </div>`
                  : ''
              }
              ${
                chokepoints.length > 0
                  ? `<div class="ld-demo-section">
                  <div class="d-label" style="margin-bottom: 8px;">Chokepoint Dependencies</div>
                  ${chokepoints
                    .slice(0, 3)
                    .map(
                      (c) =>
                        `<div class="ld-demo-row"><span>${c.chokepoint_name}</span><span class="d-data">${c.status}</span><span class="d-data">${c.exposure_pct?.toFixed(1) ?? '?'}%</span></div>`,
                    )
                    .join('')}
                </div>`
                  : ''
              }
            </div>
          </div>
          <a href="#/portfolio" class="d-link" style="font-size: 13px; margin-top: 16px; display: inline-block;">Run your own portfolio \u2192</a>
        `;
        },
      )
      .catch(() => {
        demoResult.innerHTML = '<span class="ld-ticker-placeholder">Portfolio analysis unavailable</span>';
      });
  }

  // ── Brief preview ──
  const briefEl = document.getElementById('landing-brief-preview');
  if (briefEl) {
    fetch('/api/v1/brief')
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) {
          let preview = data.summary as string;
          if (!preview.startsWith('<')) {
            preview = preview
              .replace(
                /## (.*)/g,
                '<h3 style="font-family:var(--d-serif);font-size:18px;color:var(--d-text);margin:20px 0 8px;">$1</h3>',
              )
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/\n\n/g, '<br><br>')
              .replace(/\n/g, '<br>');
          }
          briefEl.innerHTML = `<div class="ld-brief-text">${preview.slice(0, 1200)}</div>`;
        } else {
          briefEl.innerHTML =
            '<p style="color:var(--d-text-tertiary);text-align:center;">The NexusWatch Brief publishes every morning at 5 AM ET.</p>';
        }
      })
      .catch(() => {
        briefEl.innerHTML =
          '<p style="color:var(--d-text-tertiary);text-align:center;">The NexusWatch Brief publishes every morning at 5 AM ET.</p>';
      });
  }
}
