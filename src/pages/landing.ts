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
      <div class="landing-hero-badge">REAL-TIME GEOPOLITICAL INTELLIGENCE</div>
      <h1 class="landing-hero-title">Intelligence for<br>a volatile world.</h1>
      <p class="landing-hero-subtitle">
        For analysts, traders, and anyone who needs to understand global risk.<br>
        30 data layers. 50 countries scored. AI daily briefs. Dark vessel detection. All on a 3D globe.
      </p>

      <div class="landing-cta-group">
        <a href="#/intel" class="landing-cta-primary">LAUNCH NEXUSWATCH</a>
        <a href="#/intel?cinema=1" class="landing-cta-secondary">WATCH CINEMA MODE</a>
      </div>

      <div class="landing-stats">
        <div class="landing-stat"><span class="landing-stat-num">30</span><span class="landing-stat-label">DATA LAYERS</span></div>
        <div class="landing-stat"><span class="landing-stat-num">50</span><span class="landing-stat-label">COUNTRIES SCORED</span></div>
        <div class="landing-stat"><span class="landing-stat-num">6</span><span class="landing-stat-label">CRONS RUNNING</span></div>
        <div class="landing-stat"><span class="landing-stat-num">5 AM</span><span class="landing-stat-label">DAILY BRIEF</span></div>
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

    <section class="landing-features">
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[:::]</div>
        <h3>30 Live Data Layers</h3>
        <p>Earthquakes, conflicts, flights, ships, fires, disease outbreaks, internet outages, prediction markets — all on one 3D globe.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[///]</div>
        <h3>Country Instability Index</h3>
        <p>50 countries scored 0-100 across 6 risk components. Updated every 5 minutes. Trend trajectories over 7/14/30 days.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[>>>]</div>
        <h3>Cinema Mode</h3>
        <p>Immersive intelligence broadcast. Smart camera flies between hotspots. AI narrates with voice synthesis. 8 profiles.</p>
      </div>
      <div class="landing-feature anim-fade-up">
        <div class="landing-feature-icon">[!?!]</div>
        <h3>Natural Language Alerts</h3>
        <p>"Alert me when earthquake above 6.0 occurs near a nuclear facility." AI parses your intent into persistent monitoring rules.</p>
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
      <div class="landing-pricing-grid three-tier">
        <div class="landing-price-card">
          <div class="landing-price-tier">FREE</div>
          <div class="landing-price-amount">$0</div>
          <ul class="landing-price-features">
            <li>Full map with 30 live layers</li>
            <li>Cinema Mode (watermarked)</li>
            <li>Intelligence Brief (Mon/Wed/Fri)</li>
            <li>Country Instability Index</li>
            <li>1 natural language alert</li>
            <li>48-hour timeline preview</li>
            <li>PDF export</li>
          </ul>
          <a href="#/intel" class="landing-price-btn">GET STARTED</a>
        </div>
        <div class="landing-price-card">
          <div class="landing-price-tier">ANALYST</div>
          <div class="landing-price-amount">$29<span>/mo</span></div>
          <ul class="landing-price-features">
            <li>Everything in Free, plus:</li>
            <li>Daily intelligence brief</li>
            <li>5 natural language alerts</li>
            <li>7-day timeline playback</li>
            <li>Email alert delivery</li>
            <li>Pro Insight sections in briefs</li>
          </ul>
          <a href="#/intel" class="landing-price-btn">START ANALYST</a>
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
          <a href="#/intel" class="landing-price-btn featured">UPGRADE TO PRO</a>
        </div>
      </div>
    </section>

    <footer class="landing-footer">
      <div class="landing-footer-brand">NexusWatch Intelligence Platform</div>
      <div class="landing-footer-links">
        <a href="/api/v1/docs" target="_blank">API Docs</a>
        <a href="#/briefs">Brief Archive</a>
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
