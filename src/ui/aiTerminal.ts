import { createElement } from '../utils/dom.ts';
import { fetchWithRetry } from '../utils/fetch.ts';
import type { MapView } from '../map/MapView.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';

interface TerminalConfig {
  mapView: MapView;
  layerManager: MapLayerManager;
  getLayerData: () => Map<string, unknown>;
}

// Known locations for natural language commands
const LOCATIONS: Record<string, [number, number, number]> = {
  ukraine: [31.2, 48.4, 5],
  russia: [37.6, 55.8, 4],
  china: [104.2, 35.9, 4],
  taiwan: [121.5, 25.0, 7],
  'taiwan strait': [119.5, 24.5, 7],
  gaza: [34.4, 31.4, 10],
  israel: [34.9, 31.0, 7],
  iran: [53.7, 32.4, 5],
  'red sea': [39.0, 18.0, 5],
  hormuz: [56.3, 26.6, 8],
  'strait of hormuz': [56.3, 26.6, 8],
  suez: [32.3, 30.5, 8],
  'suez canal': [32.3, 30.5, 8],
  malacca: [101.8, 2.5, 6],
  sudan: [32.5, 15.5, 5],
  myanmar: [96.1, 19.8, 5],
  syria: [38.9, 34.8, 6],
  afghanistan: [67.7, 33.9, 5],
  'north korea': [125.8, 39.0, 6],
  'south china sea': [114.0, 12.0, 5],
  europe: [10.0, 50.0, 4],
  'middle east': [45.0, 30.0, 4],
  africa: [20.0, 5.0, 3],
  'persian gulf': [51.0, 27.0, 6],
  baltic: [20.0, 57.0, 5],
  arctic: [0.0, 75.0, 3],
  'gulf of mexico': [-90.0, 26.0, 5],
  'north sea': [2.0, 57.0, 5],
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

  // Show/fly to location
  for (const [name, coords] of Object.entries(LOCATIONS)) {
    if (
      lower.includes(name) &&
      (lower.startsWith('show') || lower.startsWith('go') || lower.startsWith('fly') || lower.startsWith('zoom'))
    ) {
      config.mapView.flyTo(coords[0], coords[1], coords[2]);
      showOutput(output, `Flying to ${name.toUpperCase()}`, 'success');
      return;
    }
  }

  // Just a location name — fly there
  for (const [name, coords] of Object.entries(LOCATIONS)) {
    if (lower === name) {
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

  // Fallback: try AI interpretation
  showOutput(output, 'Processing...', 'info');
  void aiInterpret(cmd, config, output);
}

async function generateTerminalSitrep(config: TerminalConfig, output: HTMLElement): Promise<void> {
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

async function aiInterpret(cmd: string, config: TerminalConfig, output: HTMLElement): Promise<void> {
  try {
    const res = await fetchWithRetry('/api/sitrep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: 'Command',
        data: {
          personalContext: {
            tensionIndex: 0,
            tensionTrend: 'stable',
            watchlistTopics: '',
            watchlistMatches: `User command: ${cmd}`,
          },
        },
      }),
    });
    if (!res.ok) throw new Error('AI unavailable');
    const result = (await res.json()) as { sitrep: string };
    showOutput(output, result.sitrep, 'success');
  } catch {
    showOutput(output, `Unknown command: "${cmd}". Type "help" for available commands.`, 'error');
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
