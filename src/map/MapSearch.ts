import { createElement } from '../utils/dom.ts';
import type { MapView } from './MapView.ts';
import { getMonitoredCountries, getCachedCII, ciiColor } from '../services/countryInstabilityIndex.ts';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
}

export function createMapSearch(mapView: MapView): HTMLElement {
  const wrapper = createElement('div', { className: 'nw-search' });

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'nw-search-input';
  input.placeholder = 'Search countries & locations...';
  input.spellcheck = false;
  input.autocomplete = 'off';

  const results = createElement('div', { className: 'nw-search-results' });
  results.style.display = 'none';

  wrapper.appendChild(input);
  wrapper.appendChild(results);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  input.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      results.style.display = 'none';
      return;
    }
    // Show CII country matches immediately (no network), then fetch Nominatim
    renderCountryMatches(query);
    debounceTimer = setTimeout(() => void searchNominatim(query), 400);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      results.style.display = 'none';
      input.blur();
    }
  });

  // Close results on outside click
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target as Node)) {
      results.style.display = 'none';
    }
  });

  /** Instant: search CII-monitored countries by name or code */
  function renderCountryMatches(query: string) {
    const q = query.toLowerCase();
    const countries = getMonitoredCountries();
    const scores = getCachedCII();

    const matches = countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q).slice(0, 6);

    results.textContent = '';

    if (matches.length === 0) {
      results.style.display = 'none';
      return;
    }

    results.style.display = '';

    for (const country of matches) {
      const score = scores.find((s) => s.countryCode === country.code);
      const row = createElement('div', { className: 'nw-search-result nw-search-country' });

      const nameSpan = createElement('span', {});
      nameSpan.style.cssText = 'flex:1;color:var(--nw-text)';
      nameSpan.textContent = `${country.name} (${country.code})`;

      row.appendChild(nameSpan);

      if (score) {
        const scoreSpan = createElement('span', {});
        scoreSpan.style.cssText = `font-family:var(--nw-font-mono);font-weight:700;color:${ciiColor(score.score)};font-size:12px`;
        scoreSpan.textContent = `CII ${score.score}`;
        row.appendChild(scoreSpan);

        const trendSpan = createElement('span', {});
        if (score.trend === 'rising') {
          trendSpan.textContent = '\u2191';
          trendSpan.style.cssText = 'color:#dc2626;font-size:11px;margin-left:4px';
        } else if (score.trend === 'falling') {
          trendSpan.textContent = '\u2193';
          trendSpan.style.cssText = 'color:#22c55e;font-size:11px;margin-left:4px';
        }
        row.appendChild(trendSpan);
      } else {
        const badge = createElement('span', {});
        badge.style.cssText = 'font-size:10px;color:var(--nw-text-muted)';
        badge.textContent = country.tier.toUpperCase();
        row.appendChild(badge);
      }

      row.style.cssText += ';display:flex;align-items:center;gap:8px';

      row.addEventListener('click', () => {
        mapView.flyTo(country.lon, country.lat, 5);
        input.value = country.name;
        results.style.display = 'none';
        // Dispatch event so sidebar can show country detail
        document.dispatchEvent(new CustomEvent('nw:country-search', { detail: { countryCode: country.code } }));
      });
      results.appendChild(row);
    }
  }

  /** Network: search Nominatim for locations not in CII database */
  async function searchNominatim(query: string) {
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        limit: '3',
        addressdetails: '0',
      });

      const res = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: { 'User-Agent': 'NexusWatch/1.0' },
      });

      if (!res.ok) return;
      const data = (await res.json()) as SearchResult[];

      // Append Nominatim results below existing country matches
      if (data.length > 0 && results.children.length > 0) {
        const divider = createElement('div', {});
        divider.style.cssText =
          'font-size:9px;color:var(--nw-text-muted);padding:4px 8px;font-family:var(--nw-font-mono);letter-spacing:0.5px;border-top:1px solid var(--nw-border)';
        divider.textContent = 'LOCATIONS';
        results.appendChild(divider);
      }

      for (const item of data) {
        const row = createElement('div', { className: 'nw-search-result' });
        row.textContent = item.display_name.split(',').slice(0, 2).join(',');
        row.addEventListener('click', () => {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          mapView.flyTo(lon, lat, 8);
          input.value = item.display_name.split(',')[0];
          results.style.display = 'none';
        });
        results.appendChild(row);
      }

      if (results.children.length > 0) {
        results.style.display = '';
      }
    } catch {
      // Silent fail on search
    }
  }

  return wrapper;
}
