import { createElement } from '../utils/dom.ts';
import { fetchWithRetry } from '../utils/fetch.ts';
import type { MapView } from '../map/MapView.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';
import { simulateScenario, matchScenarioQuery, PRESET_SCENARIOS } from '../services/scenarioEngine.ts';

interface TerminalConfig {
  mapView: MapView;
  layerManager: MapLayerManager;
  getLayerData: () => Map<string, unknown>;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Known locations for instant lookup (no API call)
const LOCATIONS: Record<string, [number, number, number]> = {
  // Countries
  ukraine: [31.2, 48.4, 5],
  russia: [37.6, 55.8, 4],
  china: [104.2, 35.9, 4],
  taiwan: [121.5, 25.0, 7],
  israel: [34.9, 31.0, 7],
  iran: [53.7, 32.4, 5],
  sudan: [32.5, 15.5, 5],
  myanmar: [96.1, 19.8, 5],
  syria: [38.9, 34.8, 6],
  afghanistan: [67.7, 33.9, 5],
  iraq: [43.7, 33.2, 5],
  yemen: [48.5, 15.6, 5],
  pakistan: [69.3, 30.4, 5],
  india: [78.9, 20.6, 4],
  japan: [138.3, 36.2, 5],
  'south korea': [127.8, 35.9, 6],
  'north korea': [125.8, 39.0, 6],
  germany: [10.4, 51.2, 5],
  france: [2.2, 46.2, 5],
  uk: [-2.0, 54.0, 5],
  brazil: [-51.9, -14.2, 4],
  mexico: [-102.6, 23.6, 5],
  nigeria: [8.7, 9.1, 5],
  egypt: [30.8, 26.8, 5],
  turkey: [35.2, 38.9, 5],
  saudi: [45.1, 23.9, 5],
  australia: [133.8, -25.3, 4],
  canada: [-106.3, 56.1, 4],
  colombia: [-74.3, 4.6, 5],
  venezuela: [-66.0, 8.0, 5],
  ethiopia: [40.5, 9.1, 5],
  somalia: [46.2, 5.2, 5],
  libya: [17.2, 26.3, 5],
  cuba: [-80.0, 21.5, 6],
  // Cities
  kyiv: [30.5, 50.4, 8],
  moscow: [37.6, 55.8, 8],
  beijing: [116.4, 39.9, 8],
  tokyo: [139.7, 35.7, 8],
  london: [-0.1, 51.5, 8],
  paris: [2.3, 48.9, 8],
  'new york': [-74.0, 40.7, 8],
  washington: [-77.0, 38.9, 8],
  tehran: [51.4, 35.7, 8],
  riyadh: [46.7, 24.7, 8],
  cairo: [31.2, 30.0, 8],
  istanbul: [29.0, 41.0, 8],
  berlin: [13.4, 52.5, 8],
  singapore: [103.8, 1.3, 10],
  dubai: [55.3, 25.3, 8],
  mumbai: [72.9, 19.1, 8],
  shanghai: [121.5, 31.2, 8],
  'tel aviv': [34.8, 32.1, 10],
  kabul: [69.2, 34.5, 8],
  baghdad: [44.4, 33.3, 8],
  khartoum: [32.5, 15.6, 8],
  lagos: [3.4, 6.5, 8],
  nairobi: [36.8, -1.3, 8],
  // Strategic locations
  gaza: [34.4, 31.4, 10],
  'taiwan strait': [119.5, 24.5, 7],
  'red sea': [39.0, 18.0, 5],
  hormuz: [56.3, 26.6, 8],
  'strait of hormuz': [56.3, 26.6, 8],
  suez: [32.3, 30.5, 8],
  'suez canal': [32.3, 30.5, 8],
  malacca: [101.8, 2.5, 6],
  'south china sea': [114.0, 12.0, 5],
  'persian gulf': [51.0, 27.0, 6],
  'bab el-mandeb': [43.3, 12.6, 8],
  panama: [-79.7, 9.1, 8],
  'panama canal': [-79.7, 9.1, 8],
  'black sea': [34.0, 43.0, 5],
  // Regions
  europe: [10.0, 50.0, 4],
  'middle east': [45.0, 30.0, 4],
  africa: [20.0, 5.0, 3],
  'south america': [-55.0, -15.0, 3],
  'north america': [-100.0, 40.0, 3],
  'southeast asia': [110.0, 5.0, 4],
  'central asia': [65.0, 40.0, 4],
  caribbean: [-70.0, 18.0, 5],
  baltic: [20.0, 57.0, 5],
  arctic: [0.0, 75.0, 3],
  sahel: [0.0, 14.0, 4],
  'horn of africa': [45.0, 8.0, 5],
  'gulf of mexico': [-90.0, 26.0, 5],
  'north sea': [2.0, 57.0, 5],
  'indian ocean': [75.0, -10.0, 3],
  pacific: [-160.0, 0.0, 3],
  atlantic: [-35.0, 30.0, 3],
  mediterranean: [18.0, 36.0, 5],
};

// Layer keywords for toggle commands
const LAYER_KEYWORDS: Record<string, string[]> = {
  conflicts: ['conflict', 'war', 'battle', 'fighting', 'combat'],
  acled: ['acled', 'violence', 'casualties', 'fatalities'],
  military: ['military', 'bases', 'nato', 'army', 'navy'],
  flights: ['flight', 'aircraft', 'planes', 'aviation'],
  ships: ['ship', 'vessel', 'maritime', 'naval'],
  fires: ['fire', 'wildfire', 'burning'],
  earthquakes: ['earthquake', 'quake', 'seismic'],
  energy: ['energy', 'oil', 'rig', 'refinery', 'lng', 'pipeline'],
  cyber: ['cyber', 'hack', 'attack', 'threat'],
  sanctions: ['sanction', 'ofac', 'embargo'],
  nuclear: ['nuclear', 'nuke', 'reactor'],
  diseases: ['disease', 'outbreak', 'pandemic', 'health'],
  frontlines: ['frontline', 'front line', 'contact line'],
  displacement: ['refugee', 'displacement', 'displaced', 'migration'],
  elections: ['election', 'vote', 'voting'],
  'internet-outages': ['internet', 'outage', 'censorship', 'shutdown'],
  'gps-jamming': ['gps', 'jamming', 'spoofing'],
  satellites: ['satellite', 'orbit', 'space'],
  launches: ['launch', 'rocket', 'spacex'],
  'trade-routes': ['trade', 'shipping', 'commerce'],
  sentiment: ['sentiment', 'tone', 'mood'],
  'air-quality': ['air quality', 'aqi', 'pollution', 'pm2.5'],
};

export function createAiTerminal(config: TerminalConfig): HTMLElement {
  const wrapper = createElement('div', { className: 'nw-terminal' });

  const prompt = createElement('span', { className: 'nw-terminal-prompt', textContent: 'nexuswatch>' });
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'nw-terminal-input';
  input.placeholder = 'Type a command... (try "show ukraine" or "enable conflicts")';
  input.spellcheck = false;
  input.autocomplete = 'off';

  const output = createElement('div', { className: 'nw-terminal-output' });
  output.style.display = 'none';

  // Typeahead suggestions dropdown
  const suggestions = createElement('div', { className: 'nw-terminal-suggestions' });
  suggestions.style.cssText =
    'display:none;position:absolute;bottom:100%;left:0;right:0;background:var(--nw-bg,#0a0a0a);border:1px solid var(--nw-border,#222);border-bottom:none;border-radius:4px 4px 0 0;max-height:160px;overflow-y:auto;z-index:10';

  const COMMANDS = [
    { cmd: '/sitrep', desc: 'Generate situation report' },
    { cmd: '/compare', desc: 'Compare countries (e.g., /compare UA,RU,TW)' },
    { cmd: '/alert-me', desc: 'Set natural language alert' },
    { cmd: '/scenario', desc: 'Run scenario simulation' },
    { cmd: 'show', desc: 'Fly to a country or location' },
    { cmd: 'enable', desc: 'Enable a data layer' },
    { cmd: 'disable', desc: 'Disable a data layer' },
    { cmd: 'help', desc: 'Show all commands' },
  ];

  let selectedSuggestion = -1;

  function updateSuggestions(query: string) {
    suggestions.innerHTML = '';
    selectedSuggestion = -1;
    if (query.length < 1) {
      suggestions.style.display = 'none';
      return;
    }

    const q = query.toLowerCase();
    const matches: { label: string; desc: string }[] = [];

    // Match commands
    for (const c of COMMANDS) {
      if (c.cmd.includes(q) || c.desc.toLowerCase().includes(q)) {
        matches.push({ label: c.cmd, desc: c.desc });
      }
    }

    // Match country names from LOCATIONS
    const locationKeys = Object.keys(LOCATIONS);
    for (const loc of locationKeys) {
      if (loc.includes(q) && matches.length < 8) {
        matches.push({ label: `show ${loc}`, desc: `Fly to ${loc}` });
      }
    }

    if (matches.length === 0) {
      suggestions.style.display = 'none';
      return;
    }

    suggestions.style.display = '';
    for (let i = 0; i < Math.min(matches.length, 6); i++) {
      const row = createElement('div', {});
      row.style.cssText =
        'padding:4px 10px;font-size:11px;cursor:pointer;display:flex;justify-content:space-between;gap:8px';
      row.innerHTML = `<span style="color:var(--nw-accent);font-family:var(--nw-font-mono)">${matches[i].label}</span><span style="color:var(--nw-text-muted);font-size:10px">${matches[i].desc}</span>`;
      row.dataset.index = String(i);
      row.addEventListener('click', () => {
        input.value = matches[i].label + ' ';
        suggestions.style.display = 'none';
        input.focus();
      });
      row.addEventListener('mouseenter', () => {
        highlightSuggestion(i);
      });
      suggestions.appendChild(row);
    }
  }

  function highlightSuggestion(index: number) {
    const rows = suggestions.children;
    for (let i = 0; i < rows.length; i++) {
      (rows[i] as HTMLElement).style.background = i === index ? 'var(--nw-surface,#111)' : '';
    }
    selectedSuggestion = index;
  }

  input.addEventListener('input', () => {
    updateSuggestions(input.value.trim());
  });

  wrapper.appendChild(prompt);
  wrapper.appendChild(input);
  wrapper.appendChild(suggestions);
  wrapper.appendChild(output);

  // Show welcome help on first terminal focus
  input.addEventListener(
    'focus',
    () => {
      if (localStorage.getItem('nw:terminal-intro-seen')) return;
      localStorage.setItem('nw:terminal-intro-seen', '1');
      output.style.display = '';
      output.innerHTML = `<div style="color:var(--nw-text-muted,#666);font-size:11px;line-height:1.6;padding:8px 0;">
<strong style="color:var(--nw-accent,#ff6600);">NexusWatch Terminal</strong>

Commands:
  <span style="color:var(--nw-text-secondary,#999);">show ukraine</span>       — Fly to country + enable layers
  <span style="color:var(--nw-text-secondary,#999);">enable conflicts</span>   — Toggle conflict data layers
  <span style="color:var(--nw-text-secondary,#999);">scenario hormuz</span>    — Simulate chokepoint closure
  <span style="color:var(--nw-text-secondary,#999);">compare UA,RU,TW</span>   — Side-by-side CII comparison
  <span style="color:var(--nw-text-secondary,#999);">help</span>               — Show all commands

Type a command or ask about any country.</div>`;
    },
    { once: true },
  );

  // Command history (Up/Down arrows) — power user expectation
  const history: string[] = JSON.parse(localStorage.getItem('nw:terminal-history') || '[]');
  let historyIndex = -1;

  input.addEventListener('keydown', (e) => {
    // Suggestion navigation
    if (suggestions.style.display !== 'none' && suggestions.children.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightSuggestion(Math.min(selectedSuggestion + 1, suggestions.children.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedSuggestion > 0) highlightSuggestion(selectedSuggestion - 1);
        return;
      }
      if (e.key === 'Tab' && selectedSuggestion >= 0) {
        e.preventDefault();
        const row = suggestions.children[selectedSuggestion] as HTMLElement;
        const label = row.querySelector('span')?.textContent || '';
        input.value = label + ' ';
        suggestions.style.display = 'none';
        return;
      }
    }

    // History navigation (only when suggestions are hidden)
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIndex < history.length - 1) {
        historyIndex++;
        input.value = history[history.length - 1 - historyIndex];
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = history[history.length - 1 - historyIndex];
      } else {
        historyIndex = -1;
        input.value = '';
      }
      return;
    }
    if (e.key === 'Enter') {
      suggestions.style.display = 'none';
      const cmd = input.value.trim();
      if (cmd) {
        // Add to history (max 50, dedup last entry)
        if (history[history.length - 1] !== cmd) {
          history.push(cmd);
          if (history.length > 50) history.shift();
          localStorage.setItem('nw:terminal-history', JSON.stringify(history));
        }
        historyIndex = -1;
        processCommand(cmd, config, output);
        input.value = '';
      }
    }
    if (e.key === 'Escape') {
      input.value = '';
      historyIndex = -1;
      input.blur();
      output.style.display = 'none';
    }
  });

  return wrapper;
}

function processCommand(cmd: string, config: TerminalConfig, output: HTMLElement): void {
  const lower = cmd.toLowerCase();

  // ── 1. QUESTIONS — detect and answer from layer data ──
  const isQuestion =
    lower.startsWith('what') ||
    lower.startsWith('how') ||
    lower.startsWith('where') ||
    lower.startsWith('which') ||
    lower.startsWith('is there') ||
    lower.startsWith('are there') ||
    lower.startsWith('tell me') ||
    lower.includes('?');

  if (isQuestion) {
    answerQuestion(lower, config, output);
    return;
  }

  // ── 2. SHOW ALL / SHOW ME — data queries, not locations ──
  if (lower.startsWith('show me all') || lower.startsWith('show all') || lower.startsWith('list')) {
    answerQuestion(lower, config, output);
    return;
  }

  // ── 3. Enable/disable layers ──
  if (lower.startsWith('enable') || lower.startsWith('show layer') || lower.startsWith('turn on')) {
    for (const [layerId, keywords] of Object.entries(LAYER_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        config.layerManager.enable(layerId);
        showOutput(output, `Layer enabled: ${layerId.toUpperCase()}`, 'success');
        return;
      }
    }
  }

  if (lower.startsWith('disable') || lower.startsWith('hide') || lower.startsWith('turn off')) {
    for (const [layerId, keywords] of Object.entries(LAYER_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        config.layerManager.disable(layerId);
        showOutput(output, `Layer disabled: ${layerId.toUpperCase()}`, 'success');
        return;
      }
    }
  }

  // ── 4. Utility commands ──
  if (lower === 'status' || lower === 'layers') {
    const enabled = config.layerManager.getEnabledLayers();
    const names = enabled.map((l) => l.name).join(', ');
    showOutput(output, `${enabled.length} layers active: ${names}`, 'info');
    return;
  }

  if (lower === 'help' || lower === '?') {
    showOutput(
      output,
      'Commands:\n• Ask questions: "what conflicts are near Iran?"\n• Fly to locations: "ukraine", "tokyo", "strait of hormuz"\n• Toggle layers: "enable sanctions", "disable flights"\n• Queries: "show me all earthquakes", "flights status"\n• Reports: "sitrep", "brief"\n• AI analyst: "analyst [question]" — cited intelligence with confidence\n• Deep dive: "deep-dive [country]" — comprehensive country analysis\n• Scenarios: "scenario hormuz-closure" — what-if simulation\n• System: "status", "help"',
      'info',
    );
    return;
  }

  // ── 5. Location fly-to (non-question commands) ──
  const stripped = lower
    .replace(/^(show|go|fly|zoom|navigate|find|search|take me to|go to)\s+(me\s+)?(to\s+)?/i, '')
    .trim();

  for (const [name, coords] of Object.entries(LOCATIONS)) {
    if (stripped === name || lower === name || stripped.includes(name) || name.includes(stripped)) {
      config.mapView.flyTo(coords[0], coords[1], coords[2]);
      showOutput(output, `Flying to ${name.toUpperCase()}`, 'success');
      return;
    }
  }

  // Sitrep
  if (lower === 'sitrep' || lower === 'brief' || lower === 'report') {
    showOutput(output, 'Generating sitrep...', 'info');
    void generateTerminalSitrep(config, output);
    return;
  }

  // Scenario simulation
  if (lower.startsWith('scenario')) {
    const query = cmd.replace(/^scenario\s*/i, '').trim();
    void runScenarioCommand(query, output);
    return;
  }

  // Deep-dive (country analysis via AI analyst)
  if (lower.startsWith('deep-dive') || lower.startsWith('deepdive') || lower.startsWith('analyze')) {
    const target = cmd.replace(/^(deep-?dive|analyze)\s*/i, '').trim();
    void runAnalystQuery(
      `Give me a comprehensive deep-dive analysis of ${target}. Include all 6 CII components with evidence, historical trend, active alerts, news sentiment, upcoming events, and data gaps.`,
      config,
      output,
    );
    return;
  }

  // AI analyst (freeform query with citations)
  if (lower.startsWith('analyst') || lower.startsWith('intel')) {
    const query = cmd.replace(/^(analyst|intel)\s*/i, '').trim();
    void runAnalystQuery(query, config, output);
    return;
  }

  // Geocoding fallback: try to find the location via Nominatim
  showOutput(output, `Searching for "${cmd}"...`, 'info');
  void geocodeAndFly(cmd, config, output);
}

function answerQuestion(query: string, config: TerminalConfig, output: HTMLElement): void {
  const data = config.getLayerData();
  const lines: string[] = [];

  // ── Conflict queries ──
  if (query.includes('conflict') || query.includes('war') || query.includes('fighting') || query.includes('battle')) {
    const acled =
      (data.get('acled') as { country: string; actor1: string; fatalities: number; type: string; date: string }[]) ||
      [];

    // Check for specific location in the query
    const locationMatch = findLocationInQuery(query);
    if (locationMatch && acled.length > 0) {
      const filtered = acled.filter(
        (e) => e.country.toLowerCase().includes(locationMatch) || query.includes(e.country.toLowerCase()),
      );
      if (filtered.length > 0) {
        lines.push(`CONFLICT DATA — ${filtered.length} events found:`);
        for (const e of filtered.slice(0, 8)) {
          lines.push(`• [${e.date}] ${e.type}: ${e.actor1} — ${e.country} (${e.fatalities} casualties)`);
        }
      } else {
        lines.push(`No ACLED conflict events found matching "${locationMatch}".`);
        lines.push(`Active conflict data covers ${new Set(acled.map((e) => e.country)).size} countries.`);
      }
    } else if (acled.length > 0) {
      const countries = new Set(acled.map((e) => e.country));
      const totalFatalities = acled.reduce((s, e) => s + (e.fatalities || 0), 0);
      lines.push(`GLOBAL CONFLICT SUMMARY — ${acled.length} events across ${countries.size} countries`);
      lines.push(`Total casualties (7-day): ${totalFatalities}`);
      lines.push(`Top theaters: ${[...countries].slice(0, 10).join(', ')}`);
    } else {
      lines.push('ACLED conflict data not loaded. Enable the "Live Conflicts" layer.');
    }
  }

  // ── Flight queries ──
  else if (
    query.includes('flight') ||
    query.includes('aircraft') ||
    query.includes('plane') ||
    query.includes('aviation')
  ) {
    const flights =
      (data.get('flights') as { callsign: string; country: string; altitude: number; military?: boolean }[]) || [];
    if (flights.length > 0) {
      const military = flights.filter((f) => f.military);
      const civilian = flights.filter((f) => !f.military);
      const countries = new Set(flights.map((f) => f.country));
      lines.push(`AIRCRAFT STATUS — ${flights.length} tracked`);
      lines.push(`• Civilian: ${civilian.length}`);
      lines.push(`• Military: ${military.length}`);
      lines.push(`• Countries: ${countries.size}`);
      if (military.length > 0) {
        lines.push(`\nMilitary aircraft:`);
        for (const f of military.slice(0, 10)) {
          lines.push(`• ${f.callsign || 'Unknown'} (${f.country}) — ${Math.round((f.altitude || 0) * 3.281)}ft`);
        }
      }
    } else {
      lines.push('Flight data not loaded. Enable the "Live Aircraft" layer.');
    }
  }

  // ── Ship queries ──
  else if (
    query.includes('ship') ||
    query.includes('vessel') ||
    query.includes('maritime') ||
    query.includes('naval')
  ) {
    const ships = (data.get('ships') as { name: string; type: string; flag: string; speed: number }[]) || [];
    if (ships.length > 0) {
      const military = ships.filter((s) => s.type === 'military');
      lines.push(`VESSEL STATUS — ${ships.length} tracked`);
      lines.push(`• Military: ${military.length}`);
      lines.push(`• Cargo/Tanker: ${ships.filter((s) => s.type === 'cargo' || s.type === 'tanker').length}`);
      for (const s of ships.slice(0, 10)) {
        lines.push(`• ${s.name} (${s.flag}) — ${s.type}, ${s.speed}kts`);
      }
    } else {
      lines.push('Ship data not loaded. Enable the "Ship Tracking" layer.');
    }
  }

  // ── Earthquake queries ──
  else if (query.includes('earthquake') || query.includes('quake') || query.includes('seismic')) {
    const quakes =
      (data.get('earthquakes') as { magnitude: number; place: string; time: number; depth: number }[]) || [];
    if (quakes.length > 0) {
      const major = quakes.filter((q) => q.magnitude >= 5.0);
      lines.push(`SEISMIC STATUS — ${quakes.length} earthquakes (last 24h)`);
      lines.push(`• M5.0+: ${major.length}`);
      lines.push(`• Strongest: M${Math.max(...quakes.map((q) => q.magnitude)).toFixed(1)}`);
      lines.push('');
      for (const q of quakes.slice(0, 8)) {
        const ago = Math.round((Date.now() - q.time) / 60000);
        lines.push(`• M${q.magnitude.toFixed(1)} — ${q.place} (${ago}m ago, ${q.depth.toFixed(0)}km deep)`);
      }
    } else {
      lines.push('Earthquake data not loaded. Enable the "Earthquakes" layer.');
    }
  }

  // ── Weather queries ──
  else if (query.includes('weather') || query.includes('forecast') || query.includes('temperature')) {
    const weather = (data.get('weather-alerts') as { city: string; description: string }[]) || [];
    const aqi = (data.get('air-quality') as { name: string; aqi: number; pm25: number }[]) || [];
    if (weather.length > 0 || aqi.length > 0) {
      lines.push('WEATHER & AIR QUALITY STATUS');
      if (weather.length > 0) {
        lines.push(`\n${weather.length} weather alerts active:`);
        for (const w of weather) lines.push(`• ${w.city}: ${w.description}`);
      }
      if (aqi.length > 0) {
        const worst = [...aqi].sort((a, b) => b.aqi - a.aqi).slice(0, 5);
        lines.push(`\nWorst air quality:`);
        for (const a of worst) lines.push(`• ${a.name}: AQI ${a.aqi} (PM2.5: ${a.pm25.toFixed(1)})`);
      }
    } else {
      lines.push('Weather/AQI data not loaded. Enable "Weather Alerts" and "Air Quality" layers.');
    }
    lines.push(
      '\nNote: NexusWatch tracks weather alerts and AQI, not forecasts. For forecasts, use a weather service.',
    );
  }

  // ── Energy queries ──
  else if (query.includes('energy') || query.includes('oil') || query.includes('gas') || query.includes('trading')) {
    lines.push('ENERGY INTELLIGENCE');
    lines.push('• 84 energy facilities tracked (rigs, refineries, LNG terminals)');
    lines.push('• 30 pipelines mapped (active, disputed, damaged)');
    lines.push('• 6 maritime chokepoints with status assessment');
    lines.push('• 8 major trade routes visualized');
    lines.push(
      '\nEnable "Energy Infrastructure", "Pipelines", "Chokepoints", and "Trade Routes" layers for full coverage.',
    );
    lines.push(
      '\nNote: Real-time energy prices and trading data require additional API integration (not yet implemented).',
    );
  }

  // ── Financial market queries ──
  else if (
    query.includes('market') ||
    query.includes('stock') ||
    query.includes('financial') ||
    query.includes('crypto')
  ) {
    lines.push('FINANCIAL MARKETS');
    lines.push('Switch to the MARKETS tab in the sidebar for stock quotes and crypto prices.');
    lines.push(
      '\nNote: NexusWatch focuses on geopolitical intelligence. For detailed financial data, the Markets sidebar tab shows stocks and crypto when the Finnhub API key is configured.',
    );
  }

  // ── Prediction queries ──
  else if (
    query.includes('predict') ||
    query.includes('forecast') ||
    query.includes('future') ||
    query.includes('probability')
  ) {
    const predictions = (data.get('predictions') as { question: string; probability: number }[]) || [];
    if (predictions.length > 0) {
      lines.push(`PREDICTION MARKETS — ${predictions.length} active`);
      for (const p of predictions) {
        lines.push(`• ${p.probability}% — ${p.question}`);
      }
    } else {
      lines.push('Prediction market data not loaded. Enable the "Prediction Markets" layer.');
    }
  }

  // ── Generic / fallback ──
  else {
    // Try to detect a location in the query and fly there
    const locationMatch = findLocationInQuery(query);
    if (locationMatch) {
      for (const [name, coords] of Object.entries(LOCATIONS)) {
        if (name.includes(locationMatch) || locationMatch.includes(name)) {
          config.mapView.flyTo(coords[0], coords[1], coords[2]);
          showOutput(output, `Flying to ${name.toUpperCase()}`, 'success');
          return;
        }
      }
      // Geocode fallback
      showOutput(output, `Searching for "${locationMatch}"...`, 'info');
      void geocodeAndFly(locationMatch, config, output);
      return;
    }

    // AI fallback — send query to Claude with current platform data context
    showOutput(output, 'Analyzing with AI...', 'info');
    void queryAI(query, config, output);
    return;
  }

  if (lines.length > 0) {
    showOutput(output, lines.join('\n'), 'info');
  }
}

function findLocationInQuery(query: string): string | null {
  // Check for known country/region names in the query
  const knownLocations = [
    'california',
    'united states',
    'usa',
    'america',
    'ukraine',
    'russia',
    'china',
    'taiwan',
    'iran',
    'israel',
    'gaza',
    'sudan',
    'myanmar',
    'syria',
    'iraq',
    'afghanistan',
    'pakistan',
    'india',
    'japan',
    'germany',
    'france',
    'uk',
    'brazil',
    'mexico',
    'nigeria',
    'egypt',
    'turkey',
    'saudi',
    'australia',
    'europe',
    'middle east',
    'africa',
    'asia',
    'pacific',
    'atlantic',
    'red sea',
    'hormuz',
    'suez',
    'malacca',
    'mediterranean',
    'caribbean',
  ];
  for (const loc of knownLocations) {
    if (query.includes(loc)) return loc;
  }
  return null;
}

async function geocodeAndFly(query: string, config: TerminalConfig, output: HTMLElement): Promise<void> {
  try {
    const params = new URLSearchParams({ q: query, format: 'json', limit: '1' });
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': 'NexusWatch/1.0 (geopolitical intelligence)' },
    });
    if (!res.ok) throw new Error('Geocoding failed');
    const results = (await res.json()) as { display_name: string; lat: string; lon: string }[];

    if (results.length > 0) {
      const r = results[0];
      const lat = parseFloat(r.lat);
      const lon = parseFloat(r.lon);
      config.mapView.flyTo(lon, lat, 8);
      const name = r.display_name.split(',')[0];
      showOutput(output, `Flying to ${name.toUpperCase()} (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`, 'success');
    } else {
      showOutput(output, `Location not found: "${query}". Try a city, country, or region name.`, 'error');
    }
  } catch {
    showOutput(output, `Could not search for "${query}". Type "help" for commands.`, 'error');
  }
}

async function generateTerminalSitrep(_config: TerminalConfig, output: HTMLElement): Promise<void> {
  try {
    const res = await fetchWithRetry('/api/sitrep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region: 'Global', data: {} }),
    });
    if (!res.ok) throw new Error('Sitrep failed');
    const result = (await res.json()) as { sitrep: string };
    showOutput(output, result.sitrep, 'success');
  } catch {
    showOutput(output, 'SITREP generation requires ANTHROPIC_API_KEY configuration', 'error');
  }
}

async function queryAI(query: string, config: TerminalConfig, output: HTMLElement): Promise<void> {
  try {
    // Build context from active layer data
    const data = config.getLayerData();
    const context: string[] = [];

    // Earthquakes
    const quakes = (data.get('earthquakes') as Array<{ magnitude: number; place: string }>) || [];
    if (quakes.length > 0) {
      const sig = quakes.filter((q) => q.magnitude >= 4.5);
      context.push(
        `Earthquakes: ${quakes.length} total, ${sig.length} above M4.5. Strongest: M${Math.max(...quakes.map((q) => q.magnitude)).toFixed(1)}.`,
      );
      if (sig.length > 0)
        context.push(
          `Significant: ${sig
            .slice(0, 5)
            .map((q) => `M${q.magnitude.toFixed(1)} ${q.place}`)
            .join('; ')}`,
        );
    }

    // Ships
    const ships = (data.get('ships') as Array<{ name: string; type: string; flag: string }>) || [];
    if (ships.length > 0) {
      const types = new Map<string, number>();
      ships.forEach((s) => types.set(s.type, (types.get(s.type) || 0) + 1));
      context.push(
        `Ships: ${ships.length} tracked. ${Array.from(types.entries())
          .map(([t, c]) => `${c} ${t}`)
          .join(', ')}.`,
      );
    }

    // Flights
    const flights = (data.get('flights') as Array<{ military?: boolean }>) || [];
    if (flights.length > 0) {
      const mil = flights.filter((f) => f.military).length;
      context.push(`Aircraft: ${flights.length} tracked (${mil} military).`);
    }

    // Conflicts
    const conflicts = (data.get('acled') as Array<{ country: string; fatalities: number }>) || [];
    if (conflicts.length > 0) {
      const countries = new Set(conflicts.map((c) => c.country));
      context.push(`Conflicts: ${conflicts.length} events across ${countries.size} countries.`);
    }

    // CII — fetch from API
    try {
      const ciiRes = await fetch('/api/v1/cii');
      if (ciiRes.ok) {
        const ciiData = (await ciiRes.json()) as { scores: Array<{ countryName: string; score: number }> };
        const top5 = (ciiData.scores || []).sort((a, b) => b.score - a.score).slice(0, 5);
        if (top5.length > 0) {
          context.push(`CII Top 5: ${top5.map((c) => `${c.countryName} (${c.score})`).join(', ')}.`);
        }
      }
    } catch {
      /* non-critical */
    }

    // Enabled layers
    const enabledLayers = config.layerManager.getEnabledLayers().map((l) => l.name);
    context.push(`Active layers: ${enabledLayers.join(', ')}.`);

    const res = await fetchWithRetry('/api/sitrep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: 'Global',
        query,
        data: { context: context.join('\n') },
        mode: 'query',
      }),
    });

    if (!res.ok) throw new Error('AI query failed');
    const result = (await res.json()) as { sitrep: string };
    showOutput(output, result.sitrep, 'success');
  } catch {
    showOutput(
      output,
      'AI query failed. Try a more specific question or check that ANTHROPIC_API_KEY is configured.',
      'error',
    );
  }
}

function showOutput(output: HTMLElement, text: string, type: 'success' | 'error' | 'info'): void {
  output.style.display = '';
  output.textContent = '';
  output.className = `nw-terminal-output nw-terminal-${type}`;
  output.textContent = text;

  // Auto-hide after 8 seconds for non-info
  if (type !== 'info' || text.length < 100) {
    setTimeout(() => {
      output.style.display = 'none';
    }, 8000);
  }
}

// ── Scenario Simulation Command ──

async function runScenarioCommand(query: string, output: HTMLElement): Promise<void> {
  if (!query || query === 'list') {
    const presetList = PRESET_SCENARIOS.map((p) => `• ${p.id}: ${p.name} — ${p.description}`).join('\n');
    showOutput(
      output,
      `Available scenarios:\n${presetList}\n\nUsage: scenario [name or description]\nExample: "scenario hormuz-closure" or "scenario what if Iran closes Hormuz"`,
      'info',
    );
    return;
  }

  // Try direct preset match first
  let presetId = query;
  let preset = PRESET_SCENARIOS.find((p) => p.id === query);
  if (!preset) {
    // Try free-text match
    const matched = matchScenarioQuery(query);
    if (matched) {
      preset = matched;
      presetId = matched.id;
    }
  }

  if (!preset) {
    showOutput(
      output,
      `No matching scenario found for "${query}". Type "scenario list" to see available scenarios.`,
      'error',
    );
    return;
  }

  showOutput(output, `Running scenario: ${preset.name}...`, 'info');

  // Dispatch visual overlay event — the map renders affected countries + infrastructure
  document.dispatchEvent(new CustomEvent('nw:run-scenario', { detail: { presetId } }));

  const result = simulateScenario(presetId);
  if (!result) {
    showOutput(output, 'Scenario simulation failed.', 'error');
    return;
  }

  // Format the result
  const lines: string[] = [];
  lines.push(`═══ SCENARIO: ${result.name.toUpperCase()} ═══`);
  lines.push(`[${result.confidence.toUpperCase()} CONFIDENCE] ${result.confidenceNote}`);
  lines.push('');

  if (result.affectedInfrastructure.length > 0) {
    lines.push('AFFECTED INFRASTRUCTURE:');
    for (const infra of result.affectedInfrastructure) {
      lines.push(`  ▸ ${infra.name} — ${infra.impact}`);
    }
    lines.push('');
  }

  lines.push('COUNTRY IMPACT (estimated CII change):');
  for (const country of result.affectedCountries.slice(0, 10)) {
    const arrow = country.delta >= 8 ? '▲▲' : country.delta >= 4 ? '▲' : '△';
    lines.push(`  ${arrow} ${country.name}: ${country.currentCII} → ${country.estimatedCII} (+${country.delta})`);
    lines.push(`     ${country.reason}`);
  }
  lines.push('');

  if (result.precedents.length > 0) {
    lines.push('HISTORICAL PRECEDENTS:');
    for (const p of result.precedents) {
      lines.push(`  • ${p.event} (${p.date})`);
      lines.push(`    ${p.outcome}`);
    }
    lines.push('');
  }

  if (result.cascades.length > 0) {
    lines.push('CASCADE CHAINS:');
    for (const c of result.cascades.slice(0, 8)) {
      const mag = c.magnitude === 'high' ? '●●●' : c.magnitude === 'medium' ? '●●' : '●';
      lines.push(`  ${mag} ${c.from} → ${c.to}: ${c.mechanism}`);
    }
  }

  showOutput(output, lines.join('\n'), 'info');
}

// ── AI Analyst Query ──

async function runAnalystQuery(query: string, config: TerminalConfig, output: HTMLElement): Promise<void> {
  showOutput(output, 'Consulting NexusWatch analyst...', 'info');

  // Build context from current layer data
  const contextParts: string[] = [];
  const ld = config.getLayerData();

  // CII scores
  const ciiScores = ld.get('cii-cache') as
    | Array<{ countryCode: string; countryName: string; score: number }>
    | undefined;
  if (ciiScores) {
    contextParts.push('TOP CII SCORES:');
    for (const s of (ciiScores as Array<{ countryCode: string; countryName: string; score: number }>).slice(0, 15)) {
      contextParts.push(`  ${s.countryName} (${s.countryCode}): CII ${s.score}`);
    }
  }

  // Earthquakes
  const quakes = ld.get('earthquakes') as Array<{ magnitude?: number; place?: string }> | undefined;
  if (quakes) {
    const significant = quakes.filter((q) => (q.magnitude || 0) >= 4.5);
    contextParts.push(`\nEARTHQUAKES: ${quakes.length} total, ${significant.length} above M4.5`);
    for (const q of significant.slice(0, 5)) {
      contextParts.push(`  M${(q.magnitude || 0).toFixed(1)} — ${q.place || 'unknown'}`);
    }
  }

  // ACLED
  const acled = ld.get('acled') as Array<{ country?: string }> | undefined;
  if (acled) {
    contextParts.push(`\nACLED CONFLICTS: ${acled.length} events`);
  }

  // Enabled layers
  const enabled = config.layerManager.getEnabledLayers();
  contextParts.push(`\nENABLED LAYERS: ${enabled.map((l) => l.name).join(', ')}`);

  try {
    const res = await fetchWithRetry('/api/ai-analyst', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        context: contextParts.join('\n'),
      }),
    });

    if (!res.ok) {
      showOutput(output, 'Analyst unavailable. Try again later.', 'error');
      return;
    }

    const data = (await res.json()) as { text: string; toolsUsed: string[] };
    const toolNote = data.toolsUsed.length > 0 ? `[Tools used: ${data.toolsUsed.join(', ')}]\n\n` : '';

    // Parse per-sentence confidence tags and count them for display
    const { parseClaims, overallConfidence } = await import('../utils/claimConfidence.ts');
    const claims = parseClaims(data.text);
    const overall = overallConfidence(claims);
    const counts = { H: 0, M: 0, L: 0 };
    for (const c of claims) {
      if (c.confidence === 'high') counts.H++;
      else if (c.confidence === 'medium') counts.M++;
      else counts.L++;
    }
    const confSummary =
      claims.length > 0
        ? `\n\n[OVERALL: ${overall.toUpperCase()} · ${counts.H}H / ${counts.M}M / ${counts.L}L claims]`
        : '';

    showOutput(output, `${toolNote}${data.text}${confSummary}`, 'info');
  } catch {
    showOutput(output, 'Analyst request failed. Check network connection.', 'error');
  }
}
