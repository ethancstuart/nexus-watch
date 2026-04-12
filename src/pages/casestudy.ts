import '../styles/casestudy.css';
import { createElement } from '../utils/dom.ts';

export function renderCaseStudy(root: HTMLElement): void {
  root.textContent = '';

  const page = createElement('div', { className: 'cs' });

  // ── CLASSIFICATION HEADER ──
  const classHeader = createElement('div', { className: 'cs-class-bar' });
  classHeader.textContent = 'UNCLASSIFIED // FOR PUBLIC RELEASE // NEXUSWATCH TECHNICAL BRIEFING';
  page.appendChild(classHeader);

  // ── HERO ──
  const hero = createElement('section', { className: 'cs-hero' });
  hero.innerHTML = `
    <div class="cs-hero-grid">
      <div class="cs-hero-left">
        <div class="cs-hero-label">SYSTEM DESIGNATION</div>
        <h1 class="cs-hero-title">NEXUSWATCH</h1>
        <div class="cs-hero-subtitle">REAL-TIME GEOPOLITICAL INTELLIGENCE PLATFORM</div>
        <div class="cs-hero-desc">
          30 data layers. 4 intelligence systems. AI command center.
          Globe projection. Auto-threat detection. Personalized watchlists.
          AI terminal. Vanilla TypeScript. Zero framework dependencies.
        </div>
        <div class="cs-hero-actions">
          <a href="#/" class="cs-btn cs-btn-primary">LAUNCH PLATFORM →</a>
          <a href="https://github.com/ethancstuart/nexus-watch" target="_blank" rel="noopener" class="cs-btn cs-btn-ghost">VIEW SOURCE</a>
        </div>
      </div>
      <div class="cs-hero-right">
        <div class="cs-hero-stats">
          <div class="cs-stat">
            <div class="cs-stat-value">30</div>
            <div class="cs-stat-label">DATA LAYERS</div>
          </div>
          <div class="cs-stat">
            <div class="cs-stat-value">4</div>
            <div class="cs-stat-label">INTEL SYSTEMS</div>
          </div>
          <div class="cs-stat">
            <div class="cs-stat-value">16</div>
            <div class="cs-stat-label">EDGE FUNCTIONS</div>
          </div>
          <div class="cs-stat">
            <div class="cs-stat-value">0</div>
            <div class="cs-stat-label">FRAMEWORKS</div>
          </div>
        </div>
        <div class="cs-hero-meta">
          <div class="cs-meta-row"><span class="cs-meta-key">STATUS</span><span class="cs-meta-val cs-live">● OPERATIONAL</span></div>
          <div class="cs-meta-row"><span class="cs-meta-key">STACK</span><span class="cs-meta-val">TYPESCRIPT + VITE + MAPLIBRE GL</span></div>
          <div class="cs-meta-row"><span class="cs-meta-key">DEPLOY</span><span class="cs-meta-val">VERCEL EDGE NETWORK</span></div>
          <div class="cs-meta-row"><span class="cs-meta-key">LICENSE</span><span class="cs-meta-val">MIT OPEN SOURCE</span></div>
          <div class="cs-meta-row"><span class="cs-meta-key">BUILDER</span><span class="cs-meta-val">ETHAN STUART + CLAUDE CODE</span></div>
        </div>
      </div>
    </div>
  `;
  page.appendChild(hero);

  // ── DIVIDER ──
  page.appendChild(createDivider('SECTION 1 // INTELLIGENCE ARCHITECTURE'));

  // ── ARCHITECTURE ──
  const arch = createElement('section', { className: 'cs-section' });
  arch.innerHTML = `
    <div class="cs-arch-grid">
      <div class="cs-arch-box">
        <div class="cs-arch-header">01 // GEO-CORRELATION ENGINE</div>
        <div class="cs-arch-body">
          Multi-signal event detection across all active layers.
          Earthquake clusters, fire convergence zones, negative
          news surges, and cross-domain anomalies detected in
          real-time using geospatial proximity matching.
        </div>
      </div>
      <div class="cs-arch-box">
        <div class="cs-arch-header">02 // TENSION INDEX ALGORITHM</div>
        <div class="cs-arch-body">
          Composite 0-100 score computed from 4 weighted components:
          CONFLICT (ACLED events + fatalities), DISASTERS (earthquakes +
          fires + GDACS), SENTIMENT (GDELT tone analysis), INSTABILITY
          (cyber threats + GPS jamming + predictions). 7-day rolling history.
        </div>
      </div>
      <div class="cs-arch-box">
        <div class="cs-arch-header">03 // COUNTRY INTELLIGENCE INDEX</div>
        <div class="cs-arch-body">
          23 nations scored across events, disasters, sentiment, and
          predictions. Per-country component breakdown with historical
          trend detection. Severity classification: LOW / MODERATE /
          ELEVATED / CRITICAL.
        </div>
      </div>
      <div class="cs-arch-box">
        <div class="cs-arch-header">04 // PERSONAL INTEL ENGINE</div>
        <div class="cs-arch-body">
          User-defined watchlists scan all incoming data for keyword
          and country matches. AI-generated personalized morning briefs
          via Claude Haiku. Browser notification alerts with configurable
          thresholds.
        </div>
      </div>
      <div class="cs-arch-box">
        <div class="cs-arch-header">05 // AI COMMAND CENTER</div>
        <div class="cs-arch-body">
          AI terminal with nexuswatch> prompt for natural language
          queries against live intelligence data. Auto-threat detection
          scans all 30 layers for anomalous patterns. Contextual
          narration generates situation briefs on demand.
        </div>
      </div>
    </div>
  `;
  page.appendChild(arch);

  // ── DIVIDER ──
  page.appendChild(createDivider('SECTION 2 // TECHNICAL DECISIONS'));

  // ── TECHNICAL DECISIONS ──
  const tech = createElement('section', { className: 'cs-section' });
  tech.innerHTML = `
    <div class="cs-tech-grid">
      <div class="cs-tech-col">
        <div class="cs-tech-header">VANILLA TYPESCRIPT</div>
        <ul class="cs-tech-list">
          <li>Zero framework dependencies</li>
          <li>Direct DOM manipulation via typed abstractions</li>
          <li>MapDataLayer interface — 30 implementations</li>
          <li>TypeScript strict mode, no \`any\`</li>
          <li>~130KB gzipped app bundle</li>
          <li>Event-driven architecture (CustomEvent bus)</li>
        </ul>
      </div>
      <div class="cs-tech-col">
        <div class="cs-tech-header">MAPLIBRE GL + GLOBE</div>
        <ul class="cs-tech-list">
          <li>Globe projection with atmosphere fog</li>
          <li>CARTO dark matter vector tiles</li>
          <li>3 switchable map styles (dark/light/voyager)</li>
          <li>GeoJSON clustering with click-to-zoom</li>
          <li>Bloomberg-styled popup cards (30 types)</li>
          <li>Layer drawer with opacity + CSV/GeoJSON export</li>
        </ul>
      </div>
      <div class="cs-tech-col">
        <div class="cs-tech-header">DATA PIPELINE</div>
        <ul class="cs-tech-list">
          <li>16 Vercel Edge Functions (API proxying)</li>
          <li>Circuit breaker fetch (3 failures → 5min backoff)</li>
          <li>Staggered layer initialization (200ms spacing)</li>
          <li>Debounced sidebar re-renders (1/sec max)</li>
          <li>10+ real-time APIs + OSINT feeds + curated static datasets</li>
          <li>AbortController cleanup on route changes</li>
        </ul>
      </div>
    </div>
  `;
  page.appendChild(tech);

  // ── DIVIDER ──
  page.appendChild(createDivider('SECTION 3 // DATA LAYER CATALOG'));

  // ── LAYER CATALOG ──
  const catalog = createElement('section', { className: 'cs-section' });
  const layers = [
    {
      cat: 'CONFLICT & MILITARY',
      items: [
        'ACLED Live Conflicts',
        'Conflict Zones',
        'Military Bases (28)',
        'Cyber Threat Corridors',
        'OFAC Sanctions',
        'GPS Jamming Zones',
        'Frontlines',
      ],
    },
    {
      cat: 'NATURAL HAZARDS',
      items: [
        'USGS Earthquakes (clustered)',
        'NASA FIRMS Wildfires (heatmap)',
        'GDACS Disasters',
        'WHO Disease Outbreaks',
        'Weather Alerts (20 cities)',
      ],
    },
    {
      cat: 'INFRASTRUCTURE',
      items: [
        'Ship Tracking (26 vessels)',
        'Chokepoint Status (6)',
        'Undersea Cables (12)',
        'Oil/Gas Pipelines (10)',
        'Nuclear Facilities (22)',
        'Strategic Ports (18)',
        'Trade Routes (8)',
        'Space Launches (11)',
        'Energy Infrastructure',
      ],
    },
    {
      cat: 'INTELLIGENCE',
      items: [
        'GDELT News Events',
        'Prediction Markets',
        'Satellites (animated orbits)',
        'Internet Outages (15)',
        'Election Calendar (12)',
        'Refugee Displacement Arcs (15)',
        'Sentiment Analysis',
      ],
    },
    { cat: 'ENVIRONMENT', items: ['Air Quality AQI (30 cities)', 'Live Aircraft (OpenSky)'] },
  ];

  let catalogHtml = '<div class="cs-catalog">';
  for (const group of layers) {
    catalogHtml += `<div class="cs-catalog-group">`;
    catalogHtml += `<div class="cs-catalog-cat">${group.cat}</div>`;
    catalogHtml += `<div class="cs-catalog-items">`;
    for (const item of group.items) {
      catalogHtml += `<span class="cs-catalog-item">${item}</span>`;
    }
    catalogHtml += `</div></div>`;
  }
  catalogHtml += '</div>';
  catalog.innerHTML = catalogHtml;
  page.appendChild(catalog);

  // ── DIVIDER ──
  page.appendChild(createDivider('SECTION 4 // DATA FLOW'));

  // ── DATA PIPELINE DIAGRAM ──
  const pipeline = createElement('section', { className: 'cs-section' });
  pipeline.innerHTML = `
    <div class="cs-pipeline">
      <div class="cs-pipe-stage">
        <div class="cs-pipe-label">DATA SOURCES</div>
        <div class="cs-pipe-items">USGS · GDELT · NASA · ACLED · OpenSky · Open-Meteo · Polymarket · WHO · Cloudflare · GDACS · AIS · OpenAQ · OSINT Feeds</div>
      </div>
      <div class="cs-pipe-arrow">→</div>
      <div class="cs-pipe-stage">
        <div class="cs-pipe-label">EDGE FUNCTIONS</div>
        <div class="cs-pipe-items">16 Vercel serverless proxies. API keys server-side. CORS + caching headers. Circuit breakers.</div>
      </div>
      <div class="cs-pipe-arrow">→</div>
      <div class="cs-pipe-stage">
        <div class="cs-pipe-label">MAP LAYERS</div>
        <div class="cs-pipe-items">30 MapDataLayer classes. GeoJSON sources. Clustered, heatmapped, arc-rendered. Popup cards.</div>
      </div>
      <div class="cs-pipe-arrow">→</div>
      <div class="cs-pipe-stage">
        <div class="cs-pipe-label">INTELLIGENCE</div>
        <div class="cs-pipe-items">Tension Index. Country Scores. Geo-correlation. Alert Rules. Watchlist matching. AI Terminal. Auto-Threat Detection. Sitreps.</div>
      </div>
    </div>
  `;
  page.appendChild(pipeline);

  // ── DIVIDER ──
  page.appendChild(createDivider('SECTION 5 // AI TERMINAL'));

  // ── AI TERMINAL ──
  const terminal = createElement('section', { className: 'cs-section' });
  terminal.innerHTML = `
    <div class="cs-arch-grid">
      <div class="cs-arch-box">
        <div class="cs-arch-header">NEXUSWATCH> COMMAND LINE</div>
        <div class="cs-arch-body">
          Full AI terminal interface for querying live intelligence data.
          Natural language commands against all 30 layers. Generate situation
          reports, filter by region or threat type, inspect specific events,
          and control the map — all from a Bloomberg-style command prompt.
          Powered by Claude Haiku via Anthropic SDK.
        </div>
      </div>
      <div class="cs-arch-box">
        <div class="cs-arch-header">AUTO-THREAT DETECTION</div>
        <div class="cs-arch-body">
          Continuous background scanning across all active layers for
          anomalous patterns and multi-signal convergence. Automatic
          alert generation when thresholds are breached. Feeds into
          the Intel Bar and contextual AI narration system.
        </div>
      </div>
    </div>
  `;
  page.appendChild(terminal);

  // ── FOOTER ──
  const footer = createElement('footer', { className: 'cs-footer' });
  footer.innerHTML = `
    <div class="cs-footer-links">
      <a href="#/" class="cs-footer-link">LAUNCH PLATFORM</a>
      <a href="https://github.com/ethancstuart/nexus-watch" target="_blank" rel="noopener" class="cs-footer-link">GITHUB</a>
      <a href="https://ethancstuart.com" target="_blank" rel="noopener" class="cs-footer-link">ETHAN STUART</a>
    </div>
    <div class="cs-footer-copy">NEXUSWATCH // MIT LICENSE // BUILT WITH CLAUDE CODE</div>
  `;
  page.appendChild(footer);

  // ── CLASSIFICATION FOOTER ──
  const classFooter = createElement('div', { className: 'cs-class-bar' });
  classFooter.textContent = 'UNCLASSIFIED // FOR PUBLIC RELEASE // END OF BRIEFING';
  page.appendChild(classFooter);

  root.appendChild(page);
}

function createDivider(text: string): HTMLElement {
  const div = createElement('div', { className: 'cs-divider' });
  div.innerHTML = `<span class="cs-divider-line"></span><span class="cs-divider-text">${text}</span><span class="cs-divider-line"></span>`;
  return div;
}
