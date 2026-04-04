import { createElement } from '../utils/dom.ts';
import { fetchWithRetry } from '../utils/fetch.ts';
import type { MapView } from '../map/MapView.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';

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

  wrapper.appendChild(prompt);
  wrapper.appendChild(input);
  wrapper.appendChild(output);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = input.value.trim();
      if (cmd) {
        processCommand(cmd, config, output);
        input.value = '';
      }
    }
    if (e.key === 'Escape') {
      input.value = '';
      input.blur();
      output.style.display = 'none';
    }
  });

  return wrapper;
}

function processCommand(cmd: string, config: TerminalConfig, output: HTMLElement): void {
  const lower = cmd.toLowerCase();

  // Location matching — check if command contains any known location
  // Strip common prefixes for cleaner matching
  const stripped = lower
    .replace(/^(show|go|fly|zoom|navigate|find|search|where is|take me to|go to)\s+(me\s+)?(to\s+)?/i, '')
    .trim();

  // Try exact match first, then fuzzy match
  for (const [name, coords] of Object.entries(LOCATIONS)) {
    if (stripped === name || lower === name) {
      config.mapView.flyTo(coords[0], coords[1], coords[2]);
      showOutput(output, `Flying to ${name.toUpperCase()}`, 'success');
      return;
    }
  }
  // Partial/contains match
  for (const [name, coords] of Object.entries(LOCATIONS)) {
    if (stripped.includes(name) || name.includes(stripped)) {
      config.mapView.flyTo(coords[0], coords[1], coords[2]);
      showOutput(output, `Flying to ${name.toUpperCase()}`, 'success');
      return;
    }
  }

  // Enable/disable layers
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

  // Status command
  if (lower === 'status' || lower === 'layers') {
    const enabled = config.layerManager.getEnabledLayers();
    const names = enabled.map((l) => l.name).join(', ');
    showOutput(output, `${enabled.length} layers active: ${names}`, 'info');
    return;
  }

  // Help
  if (lower === 'help' || lower === '?') {
    showOutput(
      output,
      'Commands: [location] — fly to location | enable/disable [layer] — toggle layers | status — show active layers | sitrep — generate report',
      'info',
    );
    return;
  }

  // Sitrep
  if (lower === 'sitrep' || lower === 'brief' || lower === 'report') {
    showOutput(output, 'Generating sitrep...', 'info');
    void generateTerminalSitrep(config, output);
    return;
  }

  // Geocoding fallback: try to find the location via Nominatim
  showOutput(output, `Searching for "${cmd}"...`, 'info');
  void geocodeAndFly(cmd, config, output);
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
