/**
 * Onboarding Flow (/#/welcome).
 *
 * First-time user experience. 3 steps:
 *   1. Region interests → determines country picks
 *   2. Risk types → determines which layers to highlight
 *   3. Alert preferences → auto-subscribes to email digest
 *
 * Auto-populates the watchlist and redirects to /#/watchlist.
 * Tracked in localStorage so returning users skip this.
 */

import { createElement } from '../utils/dom.ts';
import { addCiiWatch } from '../services/ciiWatchlist.ts';

const DONE_KEY = 'nw:onboarded:v1';

interface RegionDef {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Country codes to auto-add if this region is selected. */
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
    description: 'China, Taiwan, Japan, South Korea, North Korea — semiconductor + Pacific tensions',
    countries: ['CN', 'TW', 'JP', 'KR', 'KP'],
  },
  {
    id: 'horn-africa',
    label: 'Horn of Africa & Sahel',
    emoji: '🌍',
    description: 'Sudan, South Sudan, Ethiopia, Chad, Mali, Burkina Faso — active conflict + famine',
    countries: ['SD', 'SS', 'ET', 'TD', 'ML', 'BF', 'NE', 'SO'],
  },
  {
    id: 'south-asia',
    label: 'South & Central Asia',
    emoji: '🏔',
    description: 'India, Pakistan, Afghanistan, Bangladesh — nuclear powers + insurgency',
    countries: ['IN', 'PK', 'AF', 'BD'],
  },
  {
    id: 'latin-america',
    label: 'Latin America',
    emoji: '🌎',
    description: 'Venezuela, Colombia, Mexico, Haiti — displacement + security',
    countries: ['VE', 'CO', 'MX', 'HT', 'BR', 'AR'],
  },
  {
    id: 'g7',
    label: 'Major Powers (G7+)',
    emoji: '🏛',
    description: 'US, UK, France, Germany, Italy, Japan, Canada — macro & policy',
    countries: ['US', 'GB', 'FR', 'DE', 'IT', 'JP', 'CA'],
  },
];

interface ThemeDef {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

const THEMES: ThemeDef[] = [
  { id: 'conflict', label: 'Armed Conflict', emoji: '⚔', description: 'Military ops, insurgencies, proxy wars' },
  { id: 'markets', label: 'Markets & Economy', emoji: '📈', description: 'Energy, trade, sanctions, currency' },
  { id: 'disasters', label: 'Natural Disasters', emoji: '🌋', description: 'Earthquakes, fires, disease, weather' },
  { id: 'cyber', label: 'Cyber & Intelligence', emoji: '🔓', description: 'APT groups, infrastructure attacks' },
  { id: 'maritime', label: 'Maritime & Chokepoints', emoji: '⚓', description: 'Hormuz, Suez, Malacca, Taiwan Strait' },
  { id: 'politics', label: 'Politics & Elections', emoji: '🗳', description: 'Elections, regime change, diplomacy' },
];

export function renderWelcomePage(root: HTMLElement): void {
  // Skip if already onboarded and they're not explicitly revisiting
  const skipParam = new URLSearchParams(window.location.search).get('force');
  if (localStorage.getItem(DONE_KEY) && !skipParam) {
    window.location.hash = '#/watchlist';
    return;
  }

  root.innerHTML = '';
  root.className = 'nw-welcome-page';

  const selectedRegions = new Set<string>();
  const selectedThemes = new Set<string>();
  let cadence: 'daily' | 'weekly' | 'none' = 'weekly';
  let email = '';
  let step = 1;

  const container = createElement('div', { className: 'nw-welcome-container' });
  root.appendChild(container);

  function render(): void {
    container.innerHTML = '';

    // Progress bar
    const progress = createElement('div', { className: 'nw-welcome-progress' });
    for (let i = 1; i <= 3; i++) {
      const dot = createElement('div', { className: `nw-welcome-dot ${i <= step ? 'active' : ''}` });
      progress.appendChild(dot);
    }
    container.appendChild(progress);

    if (step === 1) renderStep1();
    else if (step === 2) renderStep2();
    else renderStep3();
  }

  function renderStep1(): void {
    const section = createElement('section', { className: 'nw-welcome-step' });
    section.innerHTML = `
      <div class="nw-welcome-kicker">STEP 1 OF 3</div>
      <h1>Which regions matter to you?</h1>
      <p>Pick any number. NexusWatch will auto-populate your watchlist with the most important countries in each.</p>
    `;

    const grid = createElement('div', { className: 'nw-welcome-grid' });
    for (const r of REGIONS) {
      const card = createElement('button', { className: 'nw-welcome-card' });
      card.innerHTML = `
        <div class="nw-welcome-card-emoji">${r.emoji}</div>
        <div class="nw-welcome-card-title">${r.label}</div>
        <div class="nw-welcome-card-desc">${r.description}</div>
      `;
      if (selectedRegions.has(r.id)) card.classList.add('selected');
      card.addEventListener('click', () => {
        if (selectedRegions.has(r.id)) selectedRegions.delete(r.id);
        else selectedRegions.add(r.id);
        card.classList.toggle('selected');
      });
      grid.appendChild(card);
    }
    section.appendChild(grid);

    const actions = createElement('div', { className: 'nw-welcome-actions' });
    actions.innerHTML = `
      <button class="nw-welcome-skip" data-action="skip">Skip setup</button>
      <button class="nw-welcome-next" data-action="next">Continue →</button>
    `;
    (actions.querySelector('[data-action="skip"]') as HTMLButtonElement).addEventListener('click', finish);
    (actions.querySelector('[data-action="next"]') as HTMLButtonElement).addEventListener('click', () => {
      step = 2;
      render();
    });
    section.appendChild(actions);

    container.appendChild(section);
  }

  function renderStep2(): void {
    const section = createElement('section', { className: 'nw-welcome-step' });
    section.innerHTML = `
      <div class="nw-welcome-kicker">STEP 2 OF 3</div>
      <h1>What risk types do you care about?</h1>
      <p>We'll prioritize these in your feed and daily brief.</p>
    `;

    const grid = createElement('div', { className: 'nw-welcome-grid' });
    for (const t of THEMES) {
      const card = createElement('button', { className: 'nw-welcome-card' });
      card.innerHTML = `
        <div class="nw-welcome-card-emoji">${t.emoji}</div>
        <div class="nw-welcome-card-title">${t.label}</div>
        <div class="nw-welcome-card-desc">${t.description}</div>
      `;
      if (selectedThemes.has(t.id)) card.classList.add('selected');
      card.addEventListener('click', () => {
        if (selectedThemes.has(t.id)) selectedThemes.delete(t.id);
        else selectedThemes.add(t.id);
        card.classList.toggle('selected');
      });
      grid.appendChild(card);
    }
    section.appendChild(grid);

    const actions = createElement('div', { className: 'nw-welcome-actions' });
    actions.innerHTML = `
      <button class="nw-welcome-skip" data-action="back">← Back</button>
      <button class="nw-welcome-next" data-action="next">Continue →</button>
    `;
    (actions.querySelector('[data-action="back"]') as HTMLButtonElement).addEventListener('click', () => {
      step = 1;
      render();
    });
    (actions.querySelector('[data-action="next"]') as HTMLButtonElement).addEventListener('click', () => {
      step = 3;
      render();
    });
    section.appendChild(actions);

    container.appendChild(section);
  }

  function renderStep3(): void {
    const section = createElement('section', { className: 'nw-welcome-step' });
    section.innerHTML = `
      <div class="nw-welcome-kicker">STEP 3 OF 3</div>
      <h1>How should we reach you?</h1>
      <p>Optional — skip if you prefer the platform without email alerts.</p>
      <div class="nw-welcome-email-row">
        <input type="email" class="nw-welcome-email" placeholder="your@email.com" value="${email}">
      </div>
      <div class="nw-welcome-cadence">
        <button class="nw-welcome-cadence-btn" data-cadence="daily">Daily brief</button>
        <button class="nw-welcome-cadence-btn" data-cadence="weekly">Weekly recap</button>
        <button class="nw-welcome-cadence-btn" data-cadence="none">No email</button>
      </div>
      <div class="nw-welcome-summary">
        <strong>Summary:</strong> ${selectedRegions.size} regions, ${selectedThemes.size} risk types selected.
        We'll add ~${countrySelections().length} countries to your watchlist.
      </div>
    `;
    const emailInput = section.querySelector('.nw-welcome-email') as HTMLInputElement;
    emailInput.addEventListener('input', () => {
      email = emailInput.value.trim();
    });
    section.querySelectorAll('.nw-welcome-cadence-btn').forEach((btn) => {
      if ((btn as HTMLElement).dataset.cadence === cadence) btn.classList.add('active');
      btn.addEventListener('click', () => {
        cadence = (btn as HTMLElement).dataset.cadence as typeof cadence;
        section.querySelectorAll('.nw-welcome-cadence-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const actions = createElement('div', { className: 'nw-welcome-actions' });
    actions.innerHTML = `
      <button class="nw-welcome-skip" data-action="back">← Back</button>
      <button class="nw-welcome-next" data-action="finish">Finish setup →</button>
    `;
    (actions.querySelector('[data-action="back"]') as HTMLButtonElement).addEventListener('click', () => {
      step = 2;
      render();
    });
    (actions.querySelector('[data-action="finish"]') as HTMLButtonElement).addEventListener('click', finish);
    section.appendChild(actions);

    container.appendChild(section);
  }

  function countrySelections(): string[] {
    const set = new Set<string>();
    for (const r of REGIONS) {
      if (selectedRegions.has(r.id)) r.countries.forEach((c) => set.add(c));
    }
    return Array.from(set);
  }

  async function finish(): Promise<void> {
    // Auto-populate watchlist
    const countries = countrySelections();
    for (const code of countries) addCiiWatch(code);

    // Save preferences
    localStorage.setItem(
      DONE_KEY,
      JSON.stringify({ completedAt: Date.now(), regions: [...selectedRegions], themes: [...selectedThemes] }),
    );

    // Subscribe to email if provided
    if (email && cadence !== 'none' && countries.length > 0) {
      try {
        await fetch('/api/alerts/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            country_codes: countries,
            cii_threshold: 60,
            cadence,
          }),
        });
      } catch {
        /* non-fatal */
      }
    }

    // Jump to personalized dashboard
    window.location.hash = '#/watchlist';
  }

  render();
}
