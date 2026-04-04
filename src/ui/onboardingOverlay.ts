import { createElement } from '../utils/dom.ts';

const STORAGE_KEY = 'nw:onboarded';

const STEPS = [
  {
    title: 'NEXUSWATCH',
    text: 'Real-time geopolitical intelligence platform. 30 data layers on a 3D globe, AI command center, auto-threat detection, and personalized watchlists.',
  },
  {
    title: 'DATA LAYERS',
    text: 'Click LAYERS in the topbar to toggle 30 data sources: conflicts, earthquakes, flights, ships, energy infrastructure, disease outbreaks, sanctions, elections, and more.',
  },
  {
    title: 'AI COMMAND CENTER',
    text: 'Type commands in the terminal at the bottom of the map. Try "ukraine", "enable sanctions", "status", or "sitrep". The AI monitors data and generates auto-alerts.',
  },
  {
    title: 'INTEL SIDEBAR',
    text: 'Three tabs — INTEL (threat detection, watchlist, country scores), MARKETS (stocks + crypto), FEEDS (news + OSINT). Click any alert to fly to its location.',
  },
  {
    title: 'EXPLORE',
    text: 'Click the globe to identify regions. Use the LEGEND button for symbol reference. Press F for fullscreen. Press ? for all keyboard shortcuts.',
  },
];

export function showOnboarding(container: HTMLElement): void {
  if (localStorage.getItem(STORAGE_KEY)) return;

  let currentStep = 0;

  const overlay = createElement('div', { className: 'nw-onboard-overlay' });
  const card = createElement('div', { className: 'nw-onboard-card' });

  function renderStep() {
    card.textContent = '';
    const step = STEPS[currentStep];

    const stepCount = createElement('div', { className: 'nw-onboard-step' });
    stepCount.textContent = `${currentStep + 1} / ${STEPS.length}`;

    const title = createElement('div', { className: 'nw-onboard-title', textContent: step.title });
    const text = createElement('div', { className: 'nw-onboard-text', textContent: step.text });

    const actions = createElement('div', { className: 'nw-onboard-actions' });

    if (currentStep > 0) {
      const prevBtn = createElement('button', { className: 'nw-onboard-btn', textContent: 'BACK' });
      prevBtn.addEventListener('click', () => {
        currentStep--;
        renderStep();
      });
      actions.appendChild(prevBtn);
    }

    const skipBtn = createElement('button', { className: 'nw-onboard-btn nw-onboard-skip', textContent: 'SKIP' });
    skipBtn.addEventListener('click', dismiss);
    actions.appendChild(skipBtn);

    if (currentStep < STEPS.length - 1) {
      const nextBtn = createElement('button', { className: 'nw-onboard-btn nw-onboard-next', textContent: 'NEXT' });
      nextBtn.addEventListener('click', () => {
        currentStep++;
        renderStep();
      });
      actions.appendChild(nextBtn);
    } else {
      const doneBtn = createElement('button', {
        className: 'nw-onboard-btn nw-onboard-next',
        textContent: 'GET STARTED',
      });
      doneBtn.addEventListener('click', dismiss);
      actions.appendChild(doneBtn);
    }

    card.appendChild(stepCount);
    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(actions);
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    overlay.remove();
  }

  overlay.appendChild(card);
  container.appendChild(overlay);
  renderStep();
}
