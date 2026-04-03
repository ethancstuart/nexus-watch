import { createElement } from '../utils/dom.ts';

const STORAGE_KEY = 'nw:onboarded';

const STEPS = [
  {
    title: 'NEXUSWATCH',
    text: 'Real-time geopolitical intelligence. 15 data layers, AI sitreps, and country risk scoring — all on an interactive map.',
  },
  {
    title: 'DATA LAYERS',
    text: 'Click LAYERS in the topbar to toggle data sources: earthquakes, wildfires, flights, military bases, conflict zones, cyber threats, and more.',
  },
  {
    title: 'SIDEBAR',
    text: 'Three tabs — INTEL shows alerts and country scores, MARKETS shows stocks and crypto, FEEDS shows categorized news headlines.',
  },
  {
    title: 'COUNTRY INDEX',
    text: 'Each country scored 0-100 across events, disasters, sentiment, and predictions. Click any country to fly to its location.',
  },
  {
    title: 'KEYBOARD SHORTCUTS',
    text: '1-7: toggle layers · S: generate sitrep · ?: help · Esc: close overlays. Click any map feature for details.',
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
