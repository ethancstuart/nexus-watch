import { createElement } from '../../utils/dom.ts';

export type IntelViewMode = 'map' | 'classic';

export function createViewToggle(currentMode: IntelViewMode, onToggle: (mode: IntelViewMode) => void): HTMLElement {
  const wrapper = createElement('div', { className: 'view-toggle' });

  const mapBtn = createElement('button', { className: 'view-toggle-btn' });
  mapBtn.textContent = 'Intel Map';
  mapBtn.dataset.mode = 'map';

  const classicBtn = createElement('button', { className: 'view-toggle-btn' });
  classicBtn.textContent = 'Dashboard';
  classicBtn.dataset.mode = 'classic';

  function setActive(mode: IntelViewMode) {
    mapBtn.classList.toggle('view-toggle-active', mode === 'map');
    classicBtn.classList.toggle('view-toggle-active', mode === 'classic');
  }

  setActive(currentMode);

  mapBtn.addEventListener('click', () => {
    setActive('map');
    onToggle('map');
  });

  classicBtn.addEventListener('click', () => {
    setActive('classic');
    onToggle('classic');
  });

  wrapper.appendChild(mapBtn);
  wrapper.appendChild(classicBtn);

  return wrapper;
}
