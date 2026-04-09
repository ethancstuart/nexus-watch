import '../styles/landing.css';
import { createElement } from '../utils/dom.ts';

export function renderLanding(root: HTMLElement): void {
  root.textContent = '';

  const page = createElement('div', { className: 'nw-landing' });
  page.innerHTML = `
    <nav class="landing-nav">
      <span class="landing-logo">NexusWatch</span>
      <div class="landing-nav-links">
        <a href="#/intel" class="landing-nav-link">OPEN PLATFORM</a>
        <a href="#/about" class="landing-nav-link">ABOUT</a>
      </div>
    </nav>

    <section class="landing-hero">
      <div class="landing-hero-badge">REAL-TIME GEOPOLITICAL INTELLIGENCE</div>
      <h1 class="landing-hero-title">The world is moving.<br>Are you watching?</h1>
      <p class="landing-hero-subtitle">
        30 live data layers. 50 countries scored. Cinema mode. AI-powered daily briefs.<br>
        NexusWatch is a real-time intelligence platform for analysts, investors, and anyone who needs to understand global risk.
      </p>

      <div class="landing-cta-group">
        <a href="#/intel" class="landing-cta-primary">LAUNCH NEXUSWATCH</a>
        <a href="#/intel" class="landing-cta-secondary" onclick="setTimeout(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'c'})),2000)">WATCH CINEMA MODE</a>
      </div>

      <div class="landing-brief-signup">
        <div class="landing-brief-label">Get the free Daily Intelligence Brief — delivered every morning at 06:00 UTC</div>
        <form class="landing-subscribe-form" id="landing-subscribe">
          <input type="email" placeholder="your@email.com" required class="landing-email-input">
          <button type="submit" class="landing-subscribe-btn">SUBSCRIBE</button>
        </form>
        <div class="landing-subscribe-status" id="landing-sub-status"></div>
      </div>
    </section>

    <section class="landing-features">
      <div class="landing-feature">
        <div class="landing-feature-icon">🌍</div>
        <h3>30 Live Data Layers</h3>
        <p>Earthquakes, conflicts, flights, ships, fires, disease outbreaks, internet outages, prediction markets — all on one 3D globe.</p>
      </div>
      <div class="landing-feature">
        <div class="landing-feature-icon">📊</div>
        <h3>Country Instability Index</h3>
        <p>50 countries scored 0-100 across 6 risk components: conflict, disasters, sentiment, infrastructure, governance, market exposure.</p>
      </div>
      <div class="landing-feature">
        <div class="landing-feature-icon">🎬</div>
        <h3>Cinema Mode</h3>
        <p>Immersive intelligence broadcast with 8 profiles. Smart camera flies to hotspots. AI narrates events in real-time.</p>
      </div>
      <div class="landing-feature">
        <div class="landing-feature-icon">🔔</div>
        <h3>Natural Language Alerts</h3>
        <p>"Alert me when earthquake above 6.0 occurs near a nuclear facility." AI parses your intent into persistent monitoring rules.</p>
      </div>
      <div class="landing-feature">
        <div class="landing-feature-icon">📡</div>
        <h3>Intelligence API</h3>
        <p>RESTful API serving CII scores, event streams, correlations, and daily briefs. Build on top of NexusWatch data.</p>
      </div>
      <div class="landing-feature">
        <div class="landing-feature-icon">📧</div>
        <h3>Daily Intelligence Brief</h3>
        <p>AI-generated morning briefing: BLUF, confidence levels, regional highlights, market implications, indicators to watch.</p>
      </div>
    </section>

    <section class="landing-brief-preview">
      <h2>Today's Brief Preview</h2>
      <div class="landing-brief-content" id="landing-brief-preview">Loading today's brief...</div>
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
        <a href="#/about">About</a>
        <a href="#/roadmap">Roadmap</a>
      </div>
      <div class="landing-footer-copy">Built with Claude Code. Deployed on Vercel.</div>
    </footer>
  `;

  root.appendChild(page);

  // Subscribe form handler
  const form = document.getElementById('landing-subscribe') as HTMLFormElement;
  const status = document.getElementById('landing-sub-status')!;
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (form.querySelector('input') as HTMLInputElement).value;
    status.textContent = 'Subscribing...';
    status.style.color = '#888';
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'landing' }),
      });
      const data = await res.json();
      status.textContent = data.success
        ? '✓ Subscribed! Check your email for the welcome message.'
        : data.error || 'Failed';
      status.style.color = data.success ? '#22c55e' : '#ef4444';
    } catch {
      status.textContent = 'Network error — try again';
      status.style.color = '#ef4444';
    }
  });

  // Load today's brief preview
  const briefEl = document.getElementById('landing-brief-preview');
  if (briefEl) {
    fetch('/api/briefs?date=' + new Date().toISOString().split('T')[0])
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) {
          // Show first ~500 chars of the brief
          const preview = data.summary
            .slice(0, 600)
            .replace(/\n/g, '<br>')
            .replace(/## /g, '<br><strong>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
          briefEl.innerHTML = `<div class="brief-preview-text">${preview}...</div><a href="#/intel" class="brief-preview-link">Read full brief in NexusWatch →</a>`;
        } else {
          briefEl.textContent = 'Brief generates daily at 06:00 UTC. Check back tomorrow morning.';
        }
      })
      .catch(() => {
        briefEl.textContent = 'Brief generates daily at 06:00 UTC.';
      });
  }
}
