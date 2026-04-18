/**
 * Onboarding Flow (/#/welcome) — Redesigned per D-13.
 *
 * Map-first approach: "Explore the Map" goes straight to /#/intel.
 * This page is a single-step preference screen shown:
 *   - When user visits /#/welcome directly
 *   - After 60s on the intel map (triggered by nexuswatch.ts)
 *
 * One screen: region interest cards + optional email signup.
 * No risk-types step (let usage patterns reveal preferences).
 */

import '../styles/welcome.css';
import { createElement } from '../utils/dom.ts';
import { addCiiWatch } from '../services/ciiWatchlist.ts';

const DONE_KEY = 'nw:onboarded:v2';
const OLD_KEY = 'nw:onboarded:v1';

interface RegionDef {
  id: string;
  label: string;
  emoji: string;
  description: string;
  countries: string[];
}

const REGIONS: RegionDef[] = [
  {
    id: 'middle-east',
    label: 'Middle East',
    emoji: '🕌',
    description: 'Iran, Israel, Palestine, Lebanon, Syria, Yemen, Saudi Arabia, Iraq',
    countries: ['IR', 'IL', 'PS', 'LB', 'SY', 'YE', 'SA', 'IQ'],
  },
  {
    id: 'eastern-europe',
    label: 'Russia & Eastern Europe',
    emoji: '🇺🇦',
    description: 'Ukraine, Russia, Poland, Romania — ongoing war, NATO flank',
    countries: ['UA', 'RU', 'PL', 'RO'],
  },
  {
    id: 'east-asia',
    label: 'East Asia & Taiwan Strait',
    emoji: '🏯',
    description: 'China, Taiwan, Japan, South Korea, North Korea',
    countries: ['CN', 'TW', 'JP', 'KR', 'KP'],
  },
  {
    id: 'horn-africa',
    label: 'Horn of Africa & Sahel',
    emoji: '🌍',
    description: 'Sudan, South Sudan, Ethiopia, Chad, Mali, Burkina Faso',
    countries: ['SD', 'SS', 'ET', 'TD', 'ML', 'BF', 'NE', 'SO'],
  },
  {
    id: 'south-asia',
    label: 'South & Central Asia',
    emoji: '🏔',
    description: 'India, Pakistan, Afghanistan, Bangladesh',
    countries: ['IN', 'PK', 'AF', 'BD'],
  },
  {
    id: 'latin-america',
    label: 'Latin America',
    emoji: '🌎',
    description: 'Venezuela, Colombia, Mexico, Haiti, Brazil, Argentina',
    countries: ['VE', 'CO', 'MX', 'HT', 'BR', 'AR'],
  },
  {
    id: 'g7',
    label: 'Major Powers (G7+)',
    emoji: '🏛',
    description: 'US, UK, France, Germany, Italy, Japan, Canada',
    countries: ['US', 'GB', 'FR', 'DE', 'IT', 'JP', 'CA'],
  },
];

export function renderWelcomePage(root: HTMLElement): void {
  // Skip if already onboarded (v1 or v2) and not forced
  const skipParam = new URLSearchParams(window.location.search).get('force');
  // Migrate v1 → v2 so old users don't see the welcome screen again
  if (localStorage.getItem(OLD_KEY) && !localStorage.getItem(DONE_KEY)) {
    localStorage.setItem(DONE_KEY, localStorage.getItem(OLD_KEY)!);
  }
  if (localStorage.getItem(DONE_KEY) && !skipParam) {
    window.location.hash = '#/watchlist';
    return;
  }

  root.innerHTML = '';

  const selectedRegions = new Set<string>();
  let email = '';

  const page = createElement('div', { className: 'nw-welcome-page nw-page' });
  page.setAttribute('role', 'main');
  page.id = 'main-content';

  page.innerHTML = `
    <div class="welcome-container">
      <h1 class="welcome-title">What are you watching?</h1>
      <p class="welcome-subtitle">Pick the regions that matter to you. We'll set up your watchlist with the most important countries in each.</p>

      <div class="welcome-grid" id="welcome-grid"></div>

      <div class="welcome-email-section">
        <p class="welcome-email-label">Want the daily brief? (optional)</p>
        <div class="welcome-email-row">
          <label for="welcome-email" class="sr-only">Email address</label>
          <input type="email" id="welcome-email" class="welcome-email-input" placeholder="your@email.com">
        </div>
      </div>

      <div class="welcome-actions">
        <button class="welcome-skip" id="welcome-skip">Skip for now</button>
        <button class="welcome-finish" id="welcome-finish">Set up my watchlist</button>
      </div>

      <p class="welcome-note">You can always change this later in Settings.</p>
    </div>
  `;

  root.appendChild(page);

  // Render region cards
  const grid = document.getElementById('welcome-grid');
  if (grid) {
    for (const r of REGIONS) {
      const card = createElement('button', { className: 'welcome-card' });
      card.innerHTML = `
        <div class="welcome-card-emoji">${r.emoji}</div>
        <div class="welcome-card-title">${r.label}</div>
        <div class="welcome-card-desc">${r.description}</div>
      `;
      card.addEventListener('click', () => {
        if (selectedRegions.has(r.id)) selectedRegions.delete(r.id);
        else selectedRegions.add(r.id);
        card.classList.toggle('selected');
        updateFinishBtn();
      });
      grid.appendChild(card);
    }
  }

  const emailInput = document.getElementById('welcome-email') as HTMLInputElement | null;
  emailInput?.addEventListener('input', () => {
    email = emailInput.value.trim();
  });

  const finishBtn = document.getElementById('welcome-finish') as HTMLButtonElement | null;
  const skipBtn = document.getElementById('welcome-skip') as HTMLButtonElement | null;

  function updateFinishBtn() {
    if (finishBtn) {
      const count = getCountries().length;
      finishBtn.textContent = count > 0 ? `Set up my watchlist (${count} countries)` : 'Set up my watchlist';
    }
  }

  function getCountries(): string[] {
    const set = new Set<string>();
    for (const r of REGIONS) {
      if (selectedRegions.has(r.id)) r.countries.forEach((c) => set.add(c));
    }
    return Array.from(set);
  }

  async function finish(): Promise<void> {
    const countries = getCountries();
    for (const code of countries) addCiiWatch(code);

    localStorage.setItem(DONE_KEY, JSON.stringify({ completedAt: Date.now(), regions: [...selectedRegions] }));

    // Subscribe to email if provided
    if (email && countries.length > 0) {
      try {
        await fetch('/api/alerts/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            country_codes: countries,
            cii_threshold: 60,
            cadence: 'daily',
          }),
        });
      } catch {
        /* non-fatal */
      }
    }

    // Go to watchlist if regions selected, otherwise back to map
    window.location.hash = countries.length > 0 ? '#/watchlist' : '#/intel';
  }

  finishBtn?.addEventListener('click', () => void finish());
  skipBtn?.addEventListener('click', () => {
    localStorage.setItem(DONE_KEY, JSON.stringify({ completedAt: Date.now(), skipped: true }));
    window.location.hash = '#/intel';
  });
}
