import '../styles/briefs-dossier.css';
import { createElement } from '../utils/dom.ts';
import { colors as dossierColors, fonts as dossierFonts } from '../styles/email-tokens.ts';

/**
 * Admin — Social drafting queue UI — Track C.6.
 *
 * Route: /#/admin/social-queue
 *
 * Reviewer surface for draft approval. Hits the existing C.1 admin
 * endpoint at /api/admin/social/queue for list + transitions. This
 * page is pure UI wiring on top of that API — no new server code.
 *
 * The point of this page is to make approval FAST. Track C's core
 * architectural invariant is "permanent human-in-the-loop review,"
 * which is only sustainable if the reviewer can clear a queue of 20
 * drafts in five minutes. Two things drive that:
 *
 *   1. **Keyboard shortcuts** — J/K navigate row by row, A approves
 *      the focused row, R rejects, H holds, E toggles an inline
 *      edit field. No mouse required.
 *
 *   2. **Bulk approve** — select rows via checkbox, hit B to
 *      approve all selected at once. For the common case where
 *      the drafter's output is clean and the reviewer is
 *      rubber-stamping.
 *
 * Aesthetic: Light Intel Dossier scoped via .briefs-dossier, same
 * as the rest of the admin surfaces. Dossier tokens for colors,
 * JetBrains Mono for draft_content (matches how the drafts will
 * actually appear on X/LinkedIn), Tiempos serif for section
 * headers.
 */

interface QueueRow {
  id: number;
  platform: string;
  action_type: string;
  source: string | null;
  source_url: string | null;
  draft_content: string;
  rationale: string | null;
  voice_score: number | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sent_at: string | null;
  platform_post_id: string | null;
  platform_error: string | null;
  final_content: string | null;
  created_at: string;
}

interface QueueListResponse {
  filter: { status: string; platform: string | null; limit: number };
  rows: QueueRow[];
  counts: Array<{ platform: string; status: string; c: number }>;
}

interface ViewState {
  status: 'pending' | 'approved' | 'sent' | 'rejected' | 'held' | 'retracted';
  platform: string | null;
  focusIndex: number;
  selected: Set<number>;
  editing: Set<number>;
  rows: QueueRow[];
  counts: Array<{ platform: string; status: string; c: number }>;
}

let state: ViewState;

export function renderSocialQueue(root: HTMLElement): void {
  root.textContent = '';
  document.title = 'Social Queue — NexusWatch Admin';

  state = {
    status: 'pending',
    platform: null,
    focusIndex: 0,
    selected: new Set(),
    editing: new Set(),
    rows: [],
    counts: [],
  };

  const page = createElement('div', { className: 'briefs-dossier' });
  page.innerHTML = shellHtml();
  root.appendChild(page);

  wireFilterControls(page);
  wireKeyboardShortcuts(page);
  void refreshQueue(page);
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function shellHtml(): string {
  return `
    <nav class="dossier-nav">
      <a href="#/" class="dossier-nav-logo">NexusWatch</a>
      <div class="dossier-nav-links">
        <a href="#/intel" class="dossier-nav-link">PLATFORM</a>
        <a href="#/admin/social-queue" class="dossier-nav-link dossier-nav-subscribe">SOCIAL QUEUE</a>
      </div>
    </nav>

    <main style="max-width: 860px; margin: 0 auto; padding: 32px 24px 64px;">
      <div class="dossier-kicker" style="text-align: left; margin-bottom: 8px;">ADMIN · SOCIAL DRAFTING QUEUE</div>
      <h1 style="font-family: ${dossierFonts.serif}; font-size: 32px; font-weight: 600; color: ${dossierColors.textPrimary}; margin: 0 0 12px 0;">Drafts awaiting review</h1>
      <p style="${leadStyle()}">Review drafts the Track C drafting engine has produced. Approve what ships, edit what needs tuning, reject what doesn't fit. Keyboard shortcuts: <kbd>J/K</kbd> move, <kbd>A</kbd> approve, <kbd>R</kbd> reject, <kbd>H</kbd> hold, <kbd>E</kbd> edit, <kbd>Space</kbd> select, <kbd>B</kbd> bulk-approve selected.</p>

      <div id="nw-sq-counts" style="${countsStripStyle()}"></div>

      <div id="nw-sq-filters" style="display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0;"></div>

      <div id="nw-sq-list" style="margin-top: 16px;">
        <div style="${loadingStyle()}">Loading queue…</div>
      </div>

      <div id="nw-sq-status" role="status" aria-live="polite" style="${statusBarStyle()}"></div>
    </main>
  `;
}

function wireFilterControls(page: HTMLElement): void {
  const filterWrap = page.querySelector<HTMLElement>('#nw-sq-filters');
  if (!filterWrap) return;

  const statuses: ViewState['status'][] = ['pending', 'approved', 'sent', 'rejected', 'held'];
  const platforms = [null, 'x', 'linkedin', 'reddit', 'dm'] as const;

  const renderFilters = () => {
    filterWrap.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 6px; margin-right: 16px;">
        <span style="${legendStyle()}">Status</span>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${statuses
            .map(
              (s) =>
                `<button type="button" data-filter-status="${s}" style="${chipStyle(state.status === s)}">${s.toUpperCase()}</button>`,
            )
            .join('')}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <span style="${legendStyle()}">Platform</span>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${platforms
            .map((p) => {
              const label = p === null ? 'ALL' : p.toUpperCase();
              const active = state.platform === p;
              return `<button type="button" data-filter-platform="${p ?? ''}" style="${chipStyle(active)}">${label}</button>`;
            })
            .join('')}
        </div>
      </div>
    `;

    filterWrap.querySelectorAll<HTMLButtonElement>('button[data-filter-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.filterStatus as ViewState['status'];
        state.status = s;
        state.focusIndex = 0;
        state.selected.clear();
        state.editing.clear();
        renderFilters();
        void refreshQueue(page);
      });
    });
    filterWrap.querySelectorAll<HTMLButtonElement>('button[data-filter-platform]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.filterPlatform;
        state.platform = !value ? null : value;
        state.focusIndex = 0;
        state.selected.clear();
        state.editing.clear();
        renderFilters();
        void refreshQueue(page);
      });
    });
  };

  renderFilters();
}

// ---------------------------------------------------------------------------
// Data fetch + render
// ---------------------------------------------------------------------------

async function refreshQueue(page: HTMLElement): Promise<void> {
  const listEl = page.querySelector<HTMLElement>('#nw-sq-list');
  const countsEl = page.querySelector<HTMLElement>('#nw-sq-counts');
  if (!listEl || !countsEl) return;

  const params = new URLSearchParams({ status: state.status, limit: '50' });
  if (state.platform) params.set('platform', state.platform);

  try {
    const res = await fetch(`/api/admin/social/queue?${params.toString()}`, {
      credentials: 'include',
    });

    if (res.status === 403) {
      listEl.innerHTML = `<p style="${emptyStyle()}">Access denied. You need to be signed in as an admin.</p>`;
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      listEl.innerHTML = `<p style="${emptyStyle()}">Failed to load queue (${res.status}). ${escapeHtml(body.slice(0, 120))}</p>`;
      return;
    }

    const data = (await res.json()) as QueueListResponse;
    state.rows = data.rows;
    state.counts = data.counts;

    if (state.focusIndex >= state.rows.length) {
      state.focusIndex = Math.max(0, state.rows.length - 1);
    }

    countsEl.innerHTML = renderCountsStrip(data.counts);
    listEl.innerHTML = '';
    if (state.rows.length === 0) {
      listEl.innerHTML = `<p style="${emptyStyle()}">No drafts in ${state.status}${state.platform ? ' on ' + state.platform : ''}. Nothing to review.</p>`;
      return;
    }
    state.rows.forEach((row, idx) => {
      listEl.appendChild(renderRow(row, idx, page));
    });
  } catch (err) {
    console.error('[social-queue] refresh failed:', err);
    listEl.innerHTML = `<p style="${emptyStyle()}">Network error. Try refreshing.</p>`;
  }
}

function renderCountsStrip(counts: Array<{ platform: string; status: string; c: number }>): string {
  const byPlatform: Record<string, Record<string, number>> = {};
  for (const c of counts) {
    if (!byPlatform[c.platform]) byPlatform[c.platform] = {};
    byPlatform[c.platform][c.status] = c.c;
  }
  const platforms = Object.keys(byPlatform).sort();
  if (platforms.length === 0)
    return '<span style="color: ' + dossierColors.textTertiary + '; font-size: 12px;">No drafts yet.</span>';
  return platforms
    .map((p) => {
      const pending = byPlatform[p].pending ?? 0;
      const approved = byPlatform[p].approved ?? 0;
      const sent = byPlatform[p].sent ?? 0;
      return `<span style="${countPillStyle()}">
        <strong style="color: ${dossierColors.accent};">${escapeHtml(p.toUpperCase())}</strong>
        pending <strong>${pending}</strong> ·
        approved <strong>${approved}</strong> ·
        sent <strong>${sent}</strong>
      </span>`;
    })
    .join('');
}

function renderRow(row: QueueRow, idx: number, page: HTMLElement): HTMLElement {
  const wrap = createElement('article', {});
  wrap.dataset.idx = String(idx);
  wrap.dataset.id = String(row.id);

  const focused = idx === state.focusIndex;
  const selected = state.selected.has(row.id);
  const editing = state.editing.has(row.id);
  wrap.setAttribute('style', rowStyle(focused, selected));

  const voiceScoreBadge =
    row.voice_score !== null
      ? `<span style="font-family: ${dossierFonts.mono}; font-size: 11px; color: ${voiceColor(row.voice_score)}; font-weight: 700;">voice ${row.voice_score}</span>`
      : '<span style="font-family: ' +
        dossierFonts.mono +
        '; font-size: 11px; color: ' +
        dossierColors.textTertiary +
        ';">no voice score</span>';

  const contentHtml = editing
    ? `<textarea class="nw-sq-edit" style="${editFieldStyle()}">${escapeHtml(row.final_content ?? row.draft_content)}</textarea>`
    : `<pre style="${draftContentStyle()}">${escapeHtml(row.final_content ?? row.draft_content)}</pre>`;

  const editedBadge =
    row.final_content && row.final_content !== row.draft_content
      ? ' · <span style="color: ' + dossierColors.accent + '; font-weight: 700;">EDITED</span>'
      : '';

  wrap.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
      <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
        <input type="checkbox" class="nw-sq-select" ${selected ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;" />
        <span style="font-family: ${dossierFonts.mono}; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: ${dossierColors.accent}; text-transform: uppercase;">
          #${row.id} · ${escapeHtml(row.platform)} · ${escapeHtml(row.action_type)}${editedBadge}
        </span>
      </label>
      ${voiceScoreBadge}
    </div>
    ${row.source ? `<div style="font-size: 12px; color: ${dossierColors.textTertiary}; margin-bottom: 8px;">${escapeHtml(row.source)}${row.source_url ? ` · <a href="${escapeHtml(row.source_url)}" target="_blank" rel="noopener" style="color: ${dossierColors.accent};">source</a>` : ''}</div>` : ''}
    ${contentHtml}
    ${row.rationale ? `<div style="font-size: 12px; color: ${dossierColors.textTertiary}; margin: 8px 0 4px 0; font-style: italic;">Rationale: ${escapeHtml(row.rationale)}</div>` : ''}
    <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
      <button type="button" class="nw-sq-action" data-action="approve" style="${primaryBtnStyle()}">Approve</button>
      <button type="button" class="nw-sq-action" data-action="edit" style="${secondaryBtnStyle()}">${editing ? 'Save edit' : 'Edit'}</button>
      <button type="button" class="nw-sq-action" data-action="hold" style="${secondaryBtnStyle()}">Hold</button>
      <button type="button" class="nw-sq-action" data-action="reject" style="${dangerBtnStyle()}">Reject</button>
    </div>
  `;

  // Click-to-focus.
  wrap.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
    state.focusIndex = idx;
    refreshStyles(page);
  });

  // Checkbox.
  wrap.querySelector<HTMLInputElement>('.nw-sq-select')?.addEventListener('change', (e) => {
    const input = e.currentTarget as HTMLInputElement;
    if (input.checked) state.selected.add(row.id);
    else state.selected.delete(row.id);
    refreshStyles(page);
  });

  // Action buttons.
  wrap.querySelectorAll<HTMLButtonElement>('.nw-sq-action').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action as 'approve' | 'reject' | 'hold' | 'edit' | undefined;
      if (!action) return;
      void handleAction(row, action, wrap, page);
    });
  });

  return wrap;
}

function refreshStyles(page: HTMLElement): void {
  page.querySelectorAll<HTMLElement>('article[data-idx]').forEach((el) => {
    const idx = parseInt(el.dataset.idx ?? '-1', 10);
    const id = parseInt(el.dataset.id ?? '-1', 10);
    el.setAttribute('style', rowStyle(idx === state.focusIndex, state.selected.has(id)));
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function handleAction(
  row: QueueRow,
  action: 'approve' | 'reject' | 'hold' | 'edit',
  wrap: HTMLElement,
  page: HTMLElement,
): Promise<void> {
  if (action === 'edit') {
    if (state.editing.has(row.id)) {
      // Save edit — read textarea value, send approve with final_content.
      const textarea = wrap.querySelector<HTMLTextAreaElement>('.nw-sq-edit');
      const value = textarea?.value.trim() ?? '';
      if (!value) {
        setStatus(page, 'Empty edit ignored.', dossierColors.down);
        return;
      }
      state.editing.delete(row.id);
      const ok = await postTransition(row.id, 'approve', value);
      if (ok) {
        setStatus(page, `Draft #${row.id} approved with edit.`, dossierColors.up);
        void refreshQueue(page);
      }
      return;
    }
    state.editing.add(row.id);
    void refreshQueue(page);
    return;
  }

  const ok = await postTransition(row.id, action, null);
  if (ok) {
    setStatus(page, `Draft #${row.id} ${action === 'approve' ? 'approved' : action + 'ed'}.`, dossierColors.up);
    void refreshQueue(page);
  }
}

async function postTransition(
  id: number,
  action: 'approve' | 'reject' | 'hold',
  finalContent: string | null,
): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/social/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        id,
        action,
        final_content: finalContent,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[social-queue] transition failed:', res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[social-queue] transition threw:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

function wireKeyboardShortcuts(page: HTMLElement): void {
  document.addEventListener('keydown', (e) => {
    // Bail if the user is typing in an input/textarea.
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    // Respect modifier keys — don't hijack Cmd+R refresh etc.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (state.rows.length === 0) return;

    const row = state.rows[state.focusIndex];

    switch (e.key.toLowerCase()) {
      case 'j':
        e.preventDefault();
        state.focusIndex = Math.min(state.rows.length - 1, state.focusIndex + 1);
        refreshStyles(page);
        scrollIntoView(page);
        break;
      case 'k':
        e.preventDefault();
        state.focusIndex = Math.max(0, state.focusIndex - 1);
        refreshStyles(page);
        scrollIntoView(page);
        break;
      case 'a':
        if (row) {
          e.preventDefault();
          void handleAction(row, 'approve', page.querySelectorAll('article')[state.focusIndex] as HTMLElement, page);
        }
        break;
      case 'r':
        if (row) {
          e.preventDefault();
          void handleAction(row, 'reject', page.querySelectorAll('article')[state.focusIndex] as HTMLElement, page);
        }
        break;
      case 'h':
        if (row) {
          e.preventDefault();
          void handleAction(row, 'hold', page.querySelectorAll('article')[state.focusIndex] as HTMLElement, page);
        }
        break;
      case 'e':
        if (row) {
          e.preventDefault();
          void handleAction(row, 'edit', page.querySelectorAll('article')[state.focusIndex] as HTMLElement, page);
        }
        break;
      case ' ':
        if (row) {
          e.preventDefault();
          if (state.selected.has(row.id)) state.selected.delete(row.id);
          else state.selected.add(row.id);
          refreshStyles(page);
          const cb = (
            page.querySelectorAll('article')[state.focusIndex] as HTMLElement
          ).querySelector<HTMLInputElement>('.nw-sq-select');
          if (cb) cb.checked = state.selected.has(row.id);
        }
        break;
      case 'b':
        if (state.selected.size > 0) {
          e.preventDefault();
          void bulkApprove(page);
        }
        break;
    }
  });
}

async function bulkApprove(page: HTMLElement): Promise<void> {
  const ids = Array.from(state.selected);
  setStatus(page, `Approving ${ids.length} drafts…`, dossierColors.textPrimary);
  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    const success = await postTransition(id, 'approve', null);
    if (success) ok++;
    else failed++;
  }
  state.selected.clear();
  setStatus(
    page,
    `Bulk approve: ${ok} succeeded${failed > 0 ? `, ${failed} failed` : ''}.`,
    failed > 0 ? dossierColors.down : dossierColors.up,
  );
  void refreshQueue(page);
}

function scrollIntoView(page: HTMLElement): void {
  const focused = page.querySelectorAll<HTMLElement>('article')[state.focusIndex];
  focused?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------------------------------------------------------------------------
// Style helpers + misc
// ---------------------------------------------------------------------------

function setStatus(page: HTMLElement, message: string, color: string): void {
  const el = page.querySelector<HTMLElement>('#nw-sq-status');
  if (!el) return;
  el.textContent = message;
  el.style.color = color;
  setTimeout(() => {
    if (el.textContent === message) el.textContent = '';
  }, 3500);
}

function voiceColor(score: number): string {
  if (score >= 85) return dossierColors.up;
  if (score >= 70) return dossierColors.accent;
  return dossierColors.down;
}

function rowStyle(focused: boolean, selected: boolean): string {
  return [
    `display: block`,
    `padding: 16px 20px`,
    `margin-bottom: 12px`,
    `background: ${selected ? dossierColors.accentBgSoft : dossierColors.bgCard}`,
    `border: 1px solid ${focused ? dossierColors.accent : dossierColors.border}`,
    `border-left: ${focused ? `4px solid ${dossierColors.accent}` : `1px solid ${dossierColors.border}`}`,
    `border-radius: 3px`,
    `cursor: pointer`,
    `transition: border-color 0.15s, background 0.15s`,
  ].join(';');
}

function draftContentStyle(): string {
  return [
    `font-family: ${dossierFonts.mono}`,
    `font-size: 13px`,
    `line-height: 1.55`,
    `color: ${dossierColors.textPrimary}`,
    `background: ${dossierColors.bgMuted}`,
    `padding: 12px 16px`,
    `border-radius: 2px`,
    `margin: 0`,
    `white-space: pre-wrap`,
    `word-break: break-word`,
  ].join(';');
}

function editFieldStyle(): string {
  return [
    `display: block`,
    `width: 100%`,
    `min-height: 100px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 13px`,
    `line-height: 1.55`,
    `color: ${dossierColors.textPrimary}`,
    `background: ${dossierColors.bgCard}`,
    `border: 1px solid ${dossierColors.accent}`,
    `border-radius: 2px`,
    `padding: 12px 16px`,
    `outline: none`,
    `box-sizing: border-box`,
  ].join(';');
}

function primaryBtnStyle(): string {
  return [
    `padding: 8px 16px`,
    `background: ${dossierColors.accent}`,
    `color: ${dossierColors.textInverse}`,
    `border: 1px solid ${dossierColors.accent}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 11px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `cursor: pointer`,
  ].join(';');
}

function secondaryBtnStyle(): string {
  return [
    `padding: 8px 16px`,
    `background: transparent`,
    `color: ${dossierColors.textPrimary}`,
    `border: 1px solid ${dossierColors.borderStrong}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 11px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `cursor: pointer`,
  ].join(';');
}

function dangerBtnStyle(): string {
  return [
    `padding: 8px 16px`,
    `background: transparent`,
    `color: ${dossierColors.down}`,
    `border: 1px solid ${dossierColors.down}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 11px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
    `cursor: pointer`,
  ].join(';');
}

function chipStyle(active: boolean): string {
  return [
    `padding: 6px 12px`,
    `background: ${active ? dossierColors.accent : 'transparent'}`,
    `color: ${active ? dossierColors.textInverse : dossierColors.textPrimary}`,
    `border: 1px solid ${active ? dossierColors.accent : dossierColors.borderStrong}`,
    `border-radius: 2px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 10px`,
    `font-weight: 700`,
    `letter-spacing: 0.12em`,
    `cursor: pointer`,
  ].join(';');
}

function countsStripStyle(): string {
  return [
    `display: flex`,
    `flex-wrap: wrap`,
    `gap: 12px`,
    `padding: 14px 18px`,
    `background: ${dossierColors.bgMuted}`,
    `border-left: 3px solid ${dossierColors.divider}`,
    `border-radius: 2px`,
    `margin-bottom: 8px`,
  ].join(';');
}

function countPillStyle(): string {
  return [
    `font-family: ${dossierFonts.mono}`,
    `font-size: 11px`,
    `color: ${dossierColors.textSecondary}`,
    `letter-spacing: 0.06em`,
  ].join(';');
}

function legendStyle(): string {
  return [
    `font-family: ${dossierFonts.mono}`,
    `font-size: 10px`,
    `font-weight: 700`,
    `letter-spacing: 0.16em`,
    `color: ${dossierColors.textTertiary}`,
    `text-transform: uppercase`,
  ].join(';');
}

function leadStyle(): string {
  return [
    `font-family: ${dossierFonts.sans}`,
    `font-size: 15px`,
    `line-height: 1.55`,
    `color: ${dossierColors.textSecondary}`,
    `margin: 0 0 16px 0`,
  ].join(';');
}

function loadingStyle(): string {
  return [
    `text-align: center`,
    `padding: 48px 24px`,
    `font-family: ${dossierFonts.mono}`,
    `font-size: 12px`,
    `color: ${dossierColors.textTertiary}`,
    `letter-spacing: 0.12em`,
    `text-transform: uppercase`,
  ].join(';');
}

function emptyStyle(): string {
  return [
    `text-align: center`,
    `padding: 48px 24px`,
    `font-family: ${dossierFonts.sans}`,
    `font-size: 15px`,
    `color: ${dossierColors.textTertiary}`,
  ].join(';');
}

function statusBarStyle(): string {
  return [
    `margin-top: 16px`,
    `padding: 12px 16px`,
    `font-family: ${dossierFonts.sans}`,
    `font-size: 13px`,
    `min-height: 18px`,
    `color: ${dossierColors.textSecondary}`,
  ].join(';');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] || c;
  });
}
