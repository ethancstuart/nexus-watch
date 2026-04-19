import '../styles/briefs.css'; // Reuse briefs page styling
import { createElement } from '../utils/dom.ts';

/**
 * CII Methodology page — explains the Country Instability Index algorithm.
 * Route: /#/methodology
 */
export function renderMethodology(root: HTMLElement): void {
  root.textContent = '';

  const page = createElement('div', { className: 'briefs-page' });
  page.innerHTML = `
    <nav class="briefs-nav">
      <a href="#/" class="briefs-nav-logo">NexusWatch</a>
      <div class="briefs-nav-links">
        <a href="#/intel" class="briefs-nav-link">PLATFORM</a>
        <a href="#/briefs" class="briefs-nav-link">BRIEFS</a>
        <a href="https://brief.nexuswatch.dev" target="_blank" class="briefs-nav-link briefs-nav-subscribe">SUBSCRIBE</a>
      </div>
    </nav>

    <article class="brief-article" style="padding-top:48px;">
      <h1 style="font-family:'JetBrains Mono',monospace;font-size:22px;color:#ff6600;letter-spacing:2px;margin:0 0 8px;">Methodology</h1>
      <p style="color:#888;font-size:14px;margin:0 0 32px;">How NexusWatch scores global risk — data sources, trust layer, and verification methodology.</p>

      <h2 class="brief-section-header">The Trust Layer</h2>
      <p>Every NexusWatch number is <strong>auditable</strong>. Click any CII score in the platform and you'll see the exact data points that computed it — which ACLED events, which USGS quakes, which GDELT articles. Alongside, we publish:</p>
      <ul style="color:#ccc;line-height:1.8;padding-left:20px;">
        <li><strong>Confidence levels</strong> (HIGH/MEDIUM/LOW) based on source count, freshness, and data volume</li>
        <li><strong>Verification badges</strong> — events are CONFIRMED (3+ sources), CORROBORATED (2), UNVERIFIED (1), or CONTESTED</li>
        <li><strong>Explicit data gaps</strong> — we show you what we DON'T have, not just what we do</li>
        <li><strong>Source freshness</strong> — live/recent/stale/offline indicators on every feed</li>
        <li><strong>Prediction ledger</strong> — public accuracy tracking at <a href="#/accuracy" style="color:#ff6600;">/#/accuracy</a></li>
      </ul>

      <h2 class="brief-section-header">What is CII?</h2>
      <p>The Country Instability Index (CII) is a composite score from <strong>0 to 100</strong> that quantifies a country's instability across 6 risk dimensions. It's computed every 5 minutes from live data feeds and updated continuously.</p>
      <p>NexusWatch currently monitors <strong>150+ countries</strong> across three tiers (Core, Extended, Monitor) — prioritizing conflict zones, strategic chokepoints, major economies, and regions with high geopolitical volatility. Every country's tier is visible in the sidebar.</p>
      <p>CII powers the daily intelligence brief, correlation detection engine, scenario simulation, verification engine, and portfolio exposure calculations.</p>

      <h2 class="brief-section-header">Data Sources (12 primary)</h2>
      <p>Every CII component and every layer displays which sources contributed. Current primary sources:</p>
      <ul style="color:#ccc;line-height:1.8;padding-left:20px;">
        <li><strong>ACLED</strong> — armed conflict events, fatality counts (hourly refresh)</li>
        <li><strong>USGS</strong> — earthquake hazards feed (60s refresh)</li>
        <li><strong>NASA FIRMS</strong> — active fire hotspots via MODIS/VIIRS (10min)</li>
        <li><strong>GDELT</strong> — global news events with tone analysis, 65+ languages (15min)</li>
        <li><strong>WHO</strong> — disease outbreak news (hourly)</li>
        <li><strong>Open-Meteo</strong> — severe weather alerts (15min)</li>
        <li><strong>OpenSky</strong> — live aircraft positions from ADS-B (30s)</li>
        <li><strong>AIS Marine Traffic</strong> — ship positions (5min)</li>
        <li><strong>Polymarket</strong> — prediction market odds (5min)</li>
        <li><strong>Cloudflare Radar</strong> — internet traffic anomalies (5min)</li>
        <li><strong>OFAC</strong> — US sanctions list (daily)</li>
        <li><strong>UNHCR</strong> — refugee displacement data (daily)</li>
      </ul>

      <h2 class="brief-section-header">The 6 Components</h2>
      <p>Each country's CII is the sum of 6 independently scored components:</p>

      <div class="method-components">
        <div class="method-component">
          <div class="method-component-header">
            <span class="method-component-name">Conflict</span>
            <span class="method-component-range">0–20 pts</span>
          </div>
          <p>Armed conflict intensity. Combines <strong>live ACLED data</strong> (event counts + fatalities within geographic radius) with <strong>baseline conflict scores</strong> for countries with known active wars. The baseline ensures countries like Ukraine, Sudan, and Yemen never show low conflict scores even when ACLED data is delayed.</p>
          <p class="method-formula">Score = max(live_conflict, baseline) where live = (events/5 × 8) + (fatalities/50 × 12), capped at 20</p>
        </div>

        <div class="method-component">
          <div class="method-component-header">
            <span class="method-component-name">Disasters</span>
            <span class="method-component-range">0–15 pts</span>
          </div>
          <p>Natural disaster exposure. Based on <strong>USGS earthquake data</strong> — counts nearby seismic events and weights by magnitude. A single M6.0+ earthquake near a country can push this component to maximum.</p>
          <p class="method-formula">Score = (nearby_quake_count × 1.5) + (max_magnitude > 5 ? (mag - 5) × 4 : 0), capped at 15</p>
        </div>

        <div class="method-component">
          <div class="method-component-header">
            <span class="method-component-name">Sentiment</span>
            <span class="method-component-range">0–15 pts</span>
          </div>
          <p>Approximated from conflict intensity and disaster severity. Countries with high conflict and active disasters score higher on sentiment instability. Future versions will incorporate GDELT news tone analysis when available.</p>
          <p class="method-formula">Score = conflict × 0.5 + disasters × 0.3, capped at 15</p>
        </div>

        <div class="method-component">
          <div class="method-component-header">
            <span class="method-component-name">Infrastructure</span>
            <span class="method-component-range">0–15 pts</span>
          </div>
          <p>Infrastructure disruption risk. Currently sourced from <strong>IODA internet outage monitoring</strong>. Critical outages score 15, high outages score 10, moderate score 5. Countries with frequent communications blackouts during crises score persistently high.</p>
          <p class="method-formula">Score = severity-based: critical=15, high=10, moderate=5, low=1</p>
        </div>

        <div class="method-component">
          <div class="method-component-header">
            <span class="method-component-name">Governance</span>
            <span class="method-component-range">0–15 pts</span>
          </div>
          <p>Structural governance risk. Uses <strong>baseline scores</strong> reflecting authoritarianism, sanctions exposure, and institutional fragility. Also adjusts upward when conflict is elevated — countries at war have degraded governance by definition. North Korea (15), Iran (13), and Syria (13) lead this component.</p>
          <p class="method-formula">Score = max(baseline_governance, conflict_derived), capped at 15</p>
        </div>

        <div class="method-component">
          <div class="method-component-header">
            <span class="method-component-name">Market Exposure</span>
            <span class="method-component-range">0–20 pts</span>
          </div>
          <p>Economic vulnerability to instability. <strong>Static weights</strong> reflecting a country's impact on global energy markets, supply chains, and trade routes. North Korea scores 20 (maximum unpredictability), Afghanistan 19, while stable economies like the US, Germany, and UK score 2-3.</p>
          <p class="method-formula">Score = static_weight per country (0-20), reflecting global economic impact potential</p>
        </div>
      </div>

      <h2 class="brief-section-header">How Scores Are Computed</h2>
      <p><strong>CII = Conflict + Disasters + Sentiment + Infrastructure + Governance + Market Exposure</strong></p>
      <p>Maximum theoretical score: 100 (20 + 15 + 15 + 15 + 15 + 20). In practice, no country currently scores above 60.</p>

      <h2 class="brief-section-header">Threat Levels</h2>
      <div class="method-levels">
        <div class="method-level"><span style="color:#f87171;">&#x1f534; Critical</span> — CII ≥ 70. Active crisis requiring immediate attention.</div>
        <div class="method-level"><span style="color:#fb923c;">&#x1f7e0; High</span> — CII 50–69. Elevated instability across multiple domains.</div>
        <div class="method-level"><span style="color:#fbbf24;">&#x1f7e1; Elevated</span> — CII 30–49. Notable risk factors present.</div>
        <div class="method-level"><span style="color:#4ade80;">&#x1f7e2; Low</span> — CII < 30. Stable conditions with manageable risk.</div>
      </div>

      <h2 class="brief-section-header">Data Sources</h2>
      <table class="method-table">
        <tr><td>ACLED</td><td>Armed conflict events, fatalities, actor data</td><td>Real-time</td></tr>
        <tr><td>USGS</td><td>Earthquake events, magnitude, location</td><td>Every 5 min</td></tr>
        <tr><td>IODA</td><td>Internet outage monitoring by country</td><td>Hourly</td></tr>
        <tr><td>NexusWatch Baselines</td><td>Conflict, governance, market exposure weights</td><td>Updated monthly</td></tr>
      </table>

      <h2 class="brief-section-header">Update Frequency</h2>
      <p>CII scores are recomputed <strong>every 5 minutes</strong> via a Vercel cron job. Historical scores are stored in a PostgreSQL database with timestamps, enabling 7-day, 14-day, and 30-day trend analysis.</p>
      <p>The daily NexusWatch Brief includes CII trajectory analysis — identifying which countries are rising, falling, or volatile over the past week.</p>

      <h2 class="brief-section-header">Live CII Scores</h2>
      <div id="method-live-cii" class="method-live-cii">Loading live scores...</div>

      <h2 class="brief-section-header">Limitations & Future Work</h2>
      <ul class="method-list">
        <li><strong>Sentiment</strong> is currently approximated from conflict/disaster intensity. GDELT news tone analysis will provide true media sentiment when IP access is restored.</li>
        <li><strong>Infrastructure</strong> primarily covers internet outages. Future versions will incorporate power grid, water, and healthcare facility data.</li>
        <li><strong>Baseline scores</strong> for conflict, governance, and market exposure are manually curated. An automated calibration system using historical event data is planned.</li>
        <li><strong>50 countries</strong> are monitored. Coverage will expand based on user demand and data source availability.</li>
      </ul>

      <h2 class="brief-section-header">Open Source</h2>
      <p>The CII computation is fully open source. The algorithm runs in <code style="background:#1a1a1a;padding:2px 6px;border-radius:3px;font-size:13px;">api/cron/compute-cii.ts</code> and can be inspected on <a href="https://github.com/ethancstuart/nexus-watch" target="_blank" style="color:#ff6600;">GitHub</a>.</p>

      <div style="text-align:center;padding:32px 0;">
        <a href="#/intel" style="display:inline-block;padding:10px 24px;background:#ff660018;border:1px solid #ff660040;color:#ff6600;text-decoration:none;font-size:11px;letter-spacing:2px;font-family:'JetBrains Mono',monospace;border-radius:4px;">EXPLORE CII ON THE LIVE MAP →</a>
      </div>
    </article>

    <footer class="briefs-footer">
      <span>NexusWatch Intelligence Platform</span>
      <a href="#/briefs">Briefs</a>
      <a href="#/intel">Live Map</a>
    </footer>
  `;

  root.appendChild(page);

  // Load live CII scores
  const ciiEl = document.getElementById('method-live-cii');
  if (ciiEl) {
    fetch('/api/v1/cii')
      .then((r) => r.json())
      .then((data) => {
        const scores = (data.scores || []) as Array<{
          countryName: string;
          score: number;
          components: Record<string, number>;
        }>;
        if (scores.length === 0) {
          ciiEl.textContent = 'No CII data available.';
          return;
        }

        const sorted = scores.sort((a, b) => b.score - a.score);
        ciiEl.innerHTML = `
          <table class="method-table method-cii-table">
            <tr>
              <th>Country</th><th>CII</th><th>Conflict</th><th>Disasters</th>
              <th>Sentiment</th><th>Infra</th><th>Governance</th><th>Market</th>
            </tr>
            ${sorted
              .slice(0, 20)
              .map((s) => {
                const level =
                  s.score >= 70 ? '#f87171' : s.score >= 50 ? '#fb923c' : s.score >= 30 ? '#fbbf24' : '#4ade80';
                return `<tr>
                  <td>${s.countryName}</td>
                  <td style="color:${level};font-weight:700;">${s.score}</td>
                  <td>${s.components.conflict ?? 0}</td>
                  <td>${s.components.disasters ?? 0}</td>
                  <td>${s.components.sentiment ?? 0}</td>
                  <td>${s.components.infrastructure ?? 0}</td>
                  <td>${s.components.governance ?? 0}</td>
                  <td>${s.components.marketExposure ?? 0}</td>
                </tr>`;
              })
              .join('')}
          </table>
          <p style="color:#555;font-size:11px;text-align:center;margin-top:8px;">Showing top 20 of ${scores.length} monitored countries. Updated every 5 minutes.</p>
        `;
      })
      .catch(() => {
        ciiEl.textContent = 'Failed to load CII data.';
      });
  }
}
