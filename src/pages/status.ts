/**
 * Public Data Health Status Page (/#/status).
 *
 * Stripe-style service health dashboard showing real-time status of
 * all NexusWatch data sources. Public transparency — no login required.
 */

import { createElement } from '../utils/dom.ts';

interface LayerStatus {
  layer: string;
  status: 'green' | 'amber' | 'red' | 'degraded';
  score: number;
  last_success: string | null;
  last_failure: string | null;
  active_source: string | null;
  circuit_state: string;
}

const LAYER_DISPLAY_NAMES: Record<string, string> = {
  earthquakes: 'USGS Earthquakes',
  fires: 'NASA FIRMS Wildfires',
  acled: 'ACLED Conflict Events',
  news: 'GDELT News Sentiment',
  'internet-outages': 'Cloudflare Radar',
  'weather-alerts': 'Open-Meteo Weather',
  flights: 'OpenSky Aircraft',
  ships: 'AIS Ship Tracking',
  'prediction-markets': 'Polymarket',
  'disease-outbreaks': 'WHO Outbreaks',
  sanctions: 'OFAC Sanctions',
  elections: 'Election Calendar',
  frontlines: 'Conflict Frontlines',
  'gps-jamming': 'GPS Jamming',
  cables: 'Undersea Cables',
  pipelines: 'Oil/Gas Pipelines',
  ports: 'Strategic Ports',
  nuclear: 'Nuclear Facilities',
  'air-quality': 'Air Quality (AQI)',
  satellites: 'Satellite Orbits',
  cyber: 'Cyber Threat Corridors',
  'military-bases': 'Military Bases',
  'conflict-zones': 'Conflict Zones',
  gdacs: 'GDACS Disasters',
  'trade-routes': 'Trade Routes',
  launches: 'Space Launches',
  energy: 'Energy Infrastructure',
  sentiment: 'Sentiment Index',
  displacement: 'Refugee Displacement',
  refugees: 'UNHCR Flows',
  'nuclear-threat': 'Nuclear Threat Composite',
  'cyber-threat': 'Cyber Threat Intel',
  protest: 'Global Protest Index',
  'chokepoint-threat': 'Chokepoint Threat',
  'chokepoint-status': 'Chokepoint Status',
  'air-quality-aqi': 'Air Quality AQI',
};

export async function renderStatusPage(container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  container.className = 'nw-status-page';

  const header = createElement('header', { className: 'nw-status-header' });
  header.innerHTML = `
    <a href="#/intel" class="nw-status-back">← Back to Intel Map</a>
    <h1>System Status</h1>
    <p class="nw-status-subtitle">
      Real-time health of every NexusWatch data source. If something's broken, you'll see it here first.
    </p>
  `;
  container.appendChild(header);

  const overall = createElement('div', { className: 'nw-status-overall' });
  overall.innerHTML = '<div class="nw-status-loading">Loading system status...</div>';
  container.appendChild(overall);

  const list = createElement('div', { className: 'nw-status-list' });
  container.appendChild(list);

  try {
    const res = await fetch('/api/public/status');
    if (!res.ok) throw new Error('status fetch failed');
    const data = (await res.json()) as { layers: LayerStatus[] };

    renderOverall(overall, data.layers);
    renderLayerList(list, data.layers);
  } catch {
    overall.innerHTML = `
      <div class="nw-status-banner nw-status-banner-amber">
        <span class="nw-status-dot"></span>
        <span>Status data unavailable — the status endpoint may be offline</span>
      </div>
    `;
  }

  const footer = createElement('footer', { className: 'nw-status-footer' });
  footer.innerHTML = `
    <p><strong>How we compute health:</strong></p>
    <ul>
      <li><strong>Green</strong> — source responding within expected interval, data fresh</li>
      <li><strong>Amber</strong> — source responding but data stale or partial</li>
      <li><strong>Red</strong> — source unreachable, fallback may be active</li>
    </ul>
    <p>
      Circuit breakers automatically activate fallback sources after 3 consecutive failures.
      Status refreshes every 5 minutes. We publish the honest numbers — broken layers count against us.
    </p>
  `;
  container.appendChild(footer);
}

function renderOverall(container: HTMLElement, layers: LayerStatus[]): void {
  const green = layers.filter((l) => l.status === 'green').length;
  const amber = layers.filter((l) => l.status === 'amber' || l.status === 'degraded').length;
  const red = layers.filter((l) => l.status === 'red').length;
  const total = layers.length;

  let banner = 'green';
  let bannerText = 'All systems operational';
  if (red > 0) {
    banner = 'red';
    bannerText = `${red} source${red === 1 ? '' : 's'} down — fallbacks may be active`;
  } else if (amber > 2) {
    banner = 'amber';
    bannerText = 'Degraded performance on some sources';
  }

  container.innerHTML = `
    <div class="nw-status-banner nw-status-banner-${banner}">
      <span class="nw-status-dot"></span>
      <span>${bannerText}</span>
    </div>
    <div class="nw-status-summary">
      <div class="nw-status-stat"><span class="nw-status-stat-num" style="color: #22c55e">${green}</span><span class="nw-status-stat-label">GREEN</span></div>
      <div class="nw-status-stat"><span class="nw-status-stat-num" style="color: #eab308">${amber}</span><span class="nw-status-stat-label">AMBER</span></div>
      <div class="nw-status-stat"><span class="nw-status-stat-num" style="color: #dc2626">${red}</span><span class="nw-status-stat-label">RED</span></div>
      <div class="nw-status-stat"><span class="nw-status-stat-num">${total}</span><span class="nw-status-stat-label">TOTAL</span></div>
    </div>
  `;
}

function renderLayerList(container: HTMLElement, layers: LayerStatus[]): void {
  // Sort: problems first
  const sorted = [...layers].sort((a, b) => {
    const rank = { red: 0, degraded: 1, amber: 2, green: 3 };
    return (rank[a.status] ?? 99) - (rank[b.status] ?? 99);
  });

  for (const layer of sorted) {
    const color =
      layer.status === 'green'
        ? '#22c55e'
        : layer.status === 'amber' || layer.status === 'degraded'
          ? '#eab308'
          : '#dc2626';

    const row = createElement('div', { className: 'nw-status-row' });
    row.innerHTML = `
      <div class="nw-status-row-dot" style="background: ${color}"></div>
      <div class="nw-status-row-name">${LAYER_DISPLAY_NAMES[layer.layer] || layer.layer}</div>
      <div class="nw-status-row-source">${layer.active_source || 'primary'}</div>
      <div class="nw-status-row-score" style="color: ${color}">${layer.score}%</div>
    `;
    container.appendChild(row);
  }
}
