/**
 * Crisis Playbook Trigger Modal
 *
 * Fires automatically when checkCrisisTriggers() detects a crisis condition.
 * Shows historical precedent, monitoring checklist, affected infrastructure,
 * and focuses the map on the crisis region.
 */

import { createElement } from '../utils/dom.ts';
import type { ActiveCrisis } from '../services/crisisPlaybook.ts';
import { dismissCrisis } from '../services/crisisPlaybook.ts';
import type { MapView } from '../map/MapView.ts';

const DISMISSED_KEY = 'nw:dismissed-crises';

function wasDismissed(id: string): boolean {
  try {
    const dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') as string[];
    return dismissed.includes(id);
  } catch {
    return false;
  }
}

function markDismissed(id: string): void {
  try {
    const dismissed = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') as string[];
    if (!dismissed.includes(id)) {
      dismissed.push(id);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed.slice(-50)));
    }
  } catch {
    /* quota — non-fatal */
  }
}

export function showCrisisModal(crisis: ActiveCrisis, mapView: MapView): void {
  if (wasDismissed(crisis.playbook.id)) return;

  // Remove any existing modal
  document.querySelector('.nw-crisis-modal-overlay')?.remove();

  const overlay = createElement('div', { className: 'nw-crisis-modal-overlay' });

  const modal = createElement('div', { className: 'nw-crisis-modal' });

  // Header with severity banner
  const header = createElement('div', { className: 'nw-crisis-modal-header' });
  header.innerHTML = `
    <div class="nw-crisis-banner">
      <span class="nw-crisis-pulse">●</span>
      <span class="nw-crisis-banner-text">CRISIS MODE ACTIVATED</span>
    </div>
  `;

  const title = createElement('h2', { className: 'nw-crisis-modal-title' });
  title.textContent = crisis.playbook.name;
  header.appendChild(title);

  const reason = createElement('div', { className: 'nw-crisis-modal-reason' });
  reason.textContent = crisis.triggerReason;
  header.appendChild(reason);

  const closeBtn = createElement('button', { className: 'nw-crisis-modal-close', textContent: '✕' });
  closeBtn.addEventListener('click', () => close());
  header.appendChild(closeBtn);

  modal.appendChild(header);

  // Body
  const body = createElement('div', { className: 'nw-crisis-modal-body' });

  // Historical precedent
  if (crisis.playbook.precedent) {
    const precedent = createElement('div', { className: 'nw-crisis-section' });
    precedent.innerHTML = `
      <div class="nw-crisis-section-label">HISTORICAL PRECEDENT</div>
      <div class="nw-crisis-precedent">
        <div class="nw-crisis-precedent-event">${crisis.playbook.precedent.event} <span class="nw-crisis-precedent-date">(${crisis.playbook.precedent.date})</span></div>
        <div class="nw-crisis-precedent-outcome">${crisis.playbook.precedent.outcome}</div>
      </div>
    `;
    body.appendChild(precedent);
  }

  // Monitoring priorities
  if (crisis.playbook.monitoringPriorities.length > 0) {
    const priorities = createElement('div', { className: 'nw-crisis-section' });
    priorities.innerHTML = `
      <div class="nw-crisis-section-label">MONITORING PRIORITIES</div>
      <ul class="nw-crisis-priorities">
        ${crisis.playbook.monitoringPriorities.map((p) => `<li>${p}</li>`).join('')}
      </ul>
    `;
    body.appendChild(priorities);
  }

  // At-risk infrastructure
  if (crisis.playbook.atRiskInfrastructure.length > 0) {
    const infra = createElement('div', { className: 'nw-crisis-section' });
    const infraList = crisis.playbook.atRiskInfrastructure
      .map(
        (i) =>
          `<div class="nw-crisis-infra-item" data-lat="${i.lat}" data-lon="${i.lon}">
            <span class="nw-crisis-infra-type">${i.type.toUpperCase()}</span>
            <span class="nw-crisis-infra-name">${i.name}</span>
          </div>`,
      )
      .join('');
    infra.innerHTML = `
      <div class="nw-crisis-section-label">AT-RISK INFRASTRUCTURE</div>
      ${infraList}
    `;
    infra.querySelectorAll('.nw-crisis-infra-item').forEach((item) => {
      item.addEventListener('click', () => {
        const lat = parseFloat((item as HTMLElement).dataset.lat!);
        const lon = parseFloat((item as HTMLElement).dataset.lon!);
        mapView.flyTo(lon, lat, 6);
      });
    });
    body.appendChild(infra);
  }

  // Affected countries
  if (crisis.playbook.affectedCountries.length > 0) {
    const countries = createElement('div', { className: 'nw-crisis-section' });
    countries.innerHTML = `
      <div class="nw-crisis-section-label">AFFECTED COUNTRIES</div>
      <div class="nw-crisis-countries">${crisis.playbook.affectedCountries.join(' · ')}</div>
    `;
    body.appendChild(countries);
  }

  modal.appendChild(body);

  // Actions
  const actions = createElement('div', { className: 'nw-crisis-modal-actions' });
  const focusBtn = createElement('button', { className: 'nw-crisis-action-primary' });
  focusBtn.textContent = 'Focus Map on Crisis Region';
  focusBtn.addEventListener('click', () => {
    mapView.flyTo(crisis.playbook.focusPoint.lon, crisis.playbook.focusPoint.lat, crisis.playbook.focusPoint.zoom);
    close();
  });

  const dismissBtn = createElement('button', { className: 'nw-crisis-action-secondary' });
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => close());

  actions.appendChild(focusBtn);
  actions.appendChild(dismissBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on overlay click (but not modal click)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Close on Esc
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);

  function close(): void {
    markDismissed(crisis.playbook.id);
    dismissCrisis(crisis.playbook.id);
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
  }
}
