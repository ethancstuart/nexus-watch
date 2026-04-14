/**
 * Entity Graph Page (/#/entities).
 *
 * Palantir-style browser for geopolitical non-state actors —
 * armed groups, intelligence agencies, terrorist orgs, private
 * military contractors, proxy forces, corporations with
 * geopolitical weight.
 *
 * Filterable by type, country, sanctions status. Click an entity
 * to see its network: sponsors, proxies, operating countries,
 * associated conflicts.
 */

import { createElement } from '../utils/dom.ts';
import { ENTITIES, getEntity, type EntityType } from '../services/entityRegistry.ts';

const TYPE_LABELS: Record<EntityType, string> = {
  armed_group: 'Armed Group',
  intelligence_agency: 'Intelligence Agency',
  terrorist_org: 'Terrorist Org',
  private_military: 'Private Military',
  state_actor: 'State Actor',
  corporation: 'Corporation',
  proxy_force: 'Proxy Force',
};

const TYPE_COLORS: Record<EntityType, string> = {
  armed_group: '#dc2626',
  intelligence_agency: '#8b5cf6',
  terrorist_org: '#991b1b',
  private_military: '#f97316',
  state_actor: '#3b82f6',
  corporation: '#06b6d4',
  proxy_force: '#eab308',
};

export function renderEntitiesPage(root: HTMLElement, detailId?: string): void {
  root.innerHTML = '';
  root.className = 'nw-entities-page';

  const header = createElement('header', { className: 'nw-entities-header' });
  header.innerHTML = `
    <a href="#/intel" class="nw-entities-back">← Back to Intel Map</a>
    <h1>Entity Registry</h1>
    <p class="nw-entities-subtitle">
      Non-state actors, intelligence agencies, and corporations with geopolitical weight.
      Click any entity to see its network and associated countries.
    </p>
  `;
  root.appendChild(header);

  // Layout: left column = entity list with filters, right column = detail
  const layout = createElement('div', { className: 'nw-entities-layout' });
  const listCol = createElement('div', { className: 'nw-entities-list-col' });
  const detailCol = createElement('div', { className: 'nw-entities-detail-col' });
  layout.appendChild(listCol);
  layout.appendChild(detailCol);
  root.appendChild(layout);

  // Filter state
  let typeFilter: EntityType | 'all' = 'all';
  let searchQuery = '';

  // Filter controls
  const filters = createElement('div', { className: 'nw-entities-filters' });
  filters.innerHTML = `
    <input type="text" class="nw-entities-search" placeholder="Search name or alias...">
    <div class="nw-entities-type-chips">
      <button class="nw-entity-chip active" data-type="all">All</button>
      ${Object.entries(TYPE_LABELS)
        .map(([type, label]) => `<button class="nw-entity-chip" data-type="${type}">${label}</button>`)
        .join('')}
    </div>
  `;
  listCol.appendChild(filters);

  const listEl = createElement('div', { className: 'nw-entities-list' });
  listCol.appendChild(listEl);

  function renderList(): void {
    listEl.innerHTML = '';
    const filtered = ENTITIES.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = e.name.toLowerCase().includes(q);
        const matchAlias = e.aliases?.some((a) => a.toLowerCase().includes(q));
        if (!matchName && !matchAlias) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="nw-entities-empty">No entities match.</div>';
      return;
    }

    for (const e of filtered) {
      const item = createElement('div', { className: 'nw-entity-item' });
      item.innerHTML = `
        <div class="nw-entity-dot" style="background: ${TYPE_COLORS[e.type]}"></div>
        <div class="nw-entity-info">
          <div class="nw-entity-name">${e.name}${e.sanctioned ? ' <span class="nw-entity-sanctioned">🚫</span>' : ''}</div>
          <div class="nw-entity-meta">
            ${TYPE_LABELS[e.type]} · ${e.homeCountry} · ${e.operatesIn.length} countries
          </div>
        </div>
      `;
      item.addEventListener('click', () => {
        window.history.replaceState(null, '', `#/entities/${e.id}`);
        renderDetail(e.id);
      });
      listEl.appendChild(item);
    }
  }

  function renderDetail(id: string): void {
    detailCol.innerHTML = '';
    const entity = getEntity(id);
    if (!entity) {
      detailCol.innerHTML = '<div class="nw-entities-empty">Entity not found.</div>';
      return;
    }

    const detail = createElement('div', { className: 'nw-entity-detail' });

    // Header
    const dHeader = createElement('div', { className: 'nw-entity-detail-header' });
    dHeader.innerHTML = `
      <div class="nw-entity-detail-type" style="background: ${TYPE_COLORS[entity.type]}15; color: ${TYPE_COLORS[entity.type]};">
        ${TYPE_LABELS[entity.type].toUpperCase()}
      </div>
      <h2>${entity.name}</h2>
      ${entity.aliases ? `<div class="nw-entity-aliases">Aliases: ${entity.aliases.join(' · ')}</div>` : ''}
      ${entity.sanctioned ? '<div class="nw-entity-sanctioned-badge">🚫 UNDER SANCTIONS</div>' : ''}
    `;
    detail.appendChild(dHeader);

    // Description
    const desc = createElement('div', { className: 'nw-entity-description' });
    desc.textContent = entity.description;
    detail.appendChild(desc);

    // Home + operates
    const geo = createElement('div', { className: 'nw-entity-geo' });
    geo.innerHTML = `
      <div class="nw-entity-field">
        <div class="nw-entity-field-label">HOME</div>
        <div class="nw-entity-field-value">
          <a href="#/audit/${entity.homeCountry}">${entity.homeCountry}</a>
        </div>
      </div>
      <div class="nw-entity-field">
        <div class="nw-entity-field-label">OPERATES IN</div>
        <div class="nw-entity-field-value">
          ${entity.operatesIn.map((c) => `<a href="#/audit/${c}" class="nw-entity-country-chip">${c}</a>`).join('')}
        </div>
      </div>
    `;
    detail.appendChild(geo);

    // Network: sponsors + proxies
    const network = createElement('div', { className: 'nw-entity-network' });
    const parts: string[] = [];

    if (entity.sponsoredBy && entity.sponsoredBy.length > 0) {
      parts.push(`
        <div class="nw-entity-field">
          <div class="nw-entity-field-label">SPONSORED BY</div>
          <div class="nw-entity-field-value">
            ${entity.sponsoredBy
              .map((sid) => {
                const s = getEntity(sid);
                return s
                  ? `<a href="#/entities/${s.id}" class="nw-entity-link" style="border-color:${TYPE_COLORS[s.type]}">${s.name}</a>`
                  : `<span class="nw-entity-link">${sid}</span>`;
              })
              .join('')}
          </div>
        </div>
      `);
    }

    if (entity.proxies && entity.proxies.length > 0) {
      parts.push(`
        <div class="nw-entity-field">
          <div class="nw-entity-field-label">PROXIES / AFFILIATES</div>
          <div class="nw-entity-field-value">
            ${entity.proxies
              .map((pid) => {
                const p = getEntity(pid);
                return p
                  ? `<a href="#/entities/${p.id}" class="nw-entity-link" style="border-color:${TYPE_COLORS[p.type]}">${p.name}</a>`
                  : `<span class="nw-entity-link">${pid}</span>`;
              })
              .join('')}
          </div>
        </div>
      `);
    }

    // Entities sponsored BY this one (reverse lookup)
    const sponsoredByThis = ENTITIES.filter((e) => e.sponsoredBy?.includes(entity.id));
    if (sponsoredByThis.length > 0) {
      parts.push(`
        <div class="nw-entity-field">
          <div class="nw-entity-field-label">ENTITIES THIS ONE SPONSORS</div>
          <div class="nw-entity-field-value">
            ${sponsoredByThis
              .map(
                (s) =>
                  `<a href="#/entities/${s.id}" class="nw-entity-link" style="border-color:${TYPE_COLORS[s.type]}">${s.name}</a>`,
              )
              .join('')}
          </div>
        </div>
      `);
    }

    network.innerHTML = parts.join('');
    if (parts.length > 0) detail.appendChild(network);

    // Conflicts
    if (entity.associatedConflicts && entity.associatedConflicts.length > 0) {
      const conflicts = createElement('div', { className: 'nw-entity-field' });
      conflicts.innerHTML = `
        <div class="nw-entity-field-label">ASSOCIATED CONFLICTS</div>
        <div class="nw-entity-field-value">
          ${entity.associatedConflicts.map((c) => `<span class="nw-entity-conflict-chip">${c.replace(/-/g, ' ')}</span>`).join('')}
        </div>
      `;
      detail.appendChild(conflicts);
    }

    detailCol.appendChild(detail);
  }

  // Wire filters
  const searchInput = filters.querySelector('.nw-entities-search') as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    renderList();
  });
  filters.querySelectorAll('.nw-entity-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      typeFilter = ((chip as HTMLElement).dataset.type as EntityType | 'all') || 'all';
      filters.querySelectorAll('.nw-entity-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      renderList();
    });
  });

  renderList();

  if (detailId) {
    renderDetail(detailId);
  } else {
    detailCol.innerHTML = `
      <div class="nw-entity-placeholder">
        <h3>Select an entity</h3>
        <p>Pick an entity on the left to see its network, sponsors, and associated countries.</p>
        <div class="nw-entity-stats">
          <div class="nw-entity-stat">
            <div class="nw-entity-stat-num">${ENTITIES.length}</div>
            <div class="nw-entity-stat-label">ENTITIES</div>
          </div>
          <div class="nw-entity-stat">
            <div class="nw-entity-stat-num">${ENTITIES.filter((e) => e.sanctioned).length}</div>
            <div class="nw-entity-stat-label">SANCTIONED</div>
          </div>
          <div class="nw-entity-stat">
            <div class="nw-entity-stat-num">${Object.keys(TYPE_LABELS).length}</div>
            <div class="nw-entity-stat-label">TYPES</div>
          </div>
        </div>
      </div>
    `;
  }
}
