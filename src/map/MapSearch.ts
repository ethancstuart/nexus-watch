import { createElement } from '../utils/dom.ts';
import type { MapView } from './MapView.ts';

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
  input.placeholder = 'Search location...';
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
    debounceTimer = setTimeout(() => void search(query), 300);
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

  async function search(query: string) {
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        limit: '5',
        addressdetails: '0',
      });

      const res = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: { 'User-Agent': 'NexusWatch/1.0' },
      });

      if (!res.ok) return;
      const data = (await res.json()) as SearchResult[];
      renderResults(data);
    } catch {
      // Silent fail on search
    }
  }

  function renderResults(data: SearchResult[]) {
    results.textContent = '';

    if (data.length === 0) {
      results.style.display = 'none';
      return;
    }

    results.style.display = '';

    for (const item of data) {
      const row = createElement('div', { className: 'nw-search-result' });
      row.textContent = item.display_name;
      row.addEventListener('click', () => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        mapView.flyTo(lon, lat, 8);
        input.value = item.display_name.split(',')[0];
        results.style.display = 'none';
      });
      results.appendChild(row);
    }
  }

  return wrapper;
}
