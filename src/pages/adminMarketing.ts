import '../styles/briefs-dossier.css';
import { createElement } from '../utils/dom.ts';
import { colors as dossierColors, fonts as dossierFonts } from '../styles/email-tokens.ts';

/**
 * Admin — Marketing Automation Dashboard — Track M.1
 *
 * Route: /#/admin/marketing
 *
 * Single-screen cockpit for the agentic marketing module:
 *   - Global PAUSE-ALL (top-right, always visible)
 *   - Global SHADOW-mode toggle (default ON)
 *   - Per-platform enable/disable + last-run timestamp
 *   - Recent posts viewer (last 30) with engagement
 *   - Pillar distribution bar
 *   - Voice context editor (loved/hated/neutral examples)
 *   - Topic queue preview (per platform)
 *
 * All endpoints are admin-gated server-side (resolveAdmin in
 * api/admin/_auth.ts). The hash route itself is cosmetic — the auth
 * gate lives at the API.
 */

const PLATFORMS = ['x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky', 'beehiiv'] as const;
type Platform = (typeof PLATFORMS)[number];

interface MarketingState {
  paused: boolean;
  shadow_mode: boolean;
  platforms: Record<Platform, { enabled: boolean; last_run: string | null }>;
  anthropic_calls_today: number;
}

interface MarketingPost {
  id: number;
  platform: string;
  pillar: string | null;
  topic_key: string | null;
  format: string;
  content: string;
  status: string;
  shadow_mode: boolean;
  voice_score: number | null;
  voice_violations: string[];
  scheduled_at: string | null;
  posted_at: string | null;
  platform_post_id: string | null;
  platform_url: string | null;
  platform_error: string | null;
  created_at: string;
  impressions: number;
  likes: number;
  reposts: number;
  replies: number;
  intel_buyer_signal: number;
}

interface VoiceContextRow {
  id: number;
  platform: string;
  category: 'loved' | 'hated' | 'neutral';
  content: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

interface PageState {
  filterPlatform: Platform | null;
  marketing: MarketingState | null;
  posts: MarketingPost[];
  pillarDistribution: Array<{ pillar: string; c: number }>;
  voiceContext: VoiceContextRow[];
}

let state: PageState;

export function renderAdminMarketing(root: HTMLElement): void {
  root.textContent = '';
  document.title = 'Marketing Automation — NexusWatch Admin';
  state = {
    filterPlatform: null,
    marketing: null,
    posts: [],
    pillarDistribution: [],
    voiceContext: [],
  };

  const page = createElement('div', { className: 'briefs-dossier' });
  page.innerHTML = shellHtml();
  root.appendChild(page);

  void refreshAll(page);
  wireGlobalControls(page);
}

function shellHtml(): string {
  return `
    <nav class="dossier-nav">
      <a href="#/" class="dossier-nav-logo">NexusWatch</a>
      <div class="dossier-nav-links">
        <a href="#/intel" class="dossier-nav-link">PLATFORM</a>
        <a href="#/admin/social-queue" class="dossier-nav-link">SOCIAL QUEUE</a>
        <a href="#/admin/marketing" class="dossier-nav-link dossier-nav-subscribe">MARKETING</a>
      </div>
    </nav>

    <main style="max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:8px;">
        <div>
          <div class="dossier-kicker" style="text-align:left;margin-bottom:8px;">ADMIN · MARKETING AUTOMATION</div>
          <h1 style="font-family:${dossierFonts.serif};font-size:32px;font-weight:600;color:${dossierColors.textPrimary};margin:0 0 4px 0;">
            Engine Cockpit
          </h1>
          <p id="nw-mk-status-line" style="font-family:${dossierFonts.mono};font-size:12px;color:${dossierColors.textTertiary};margin:0;">
            Loading state…
          </p>
        </div>
        <button type="button" id="nw-mk-pause-all" style="${pauseButtonStyle(false)}">
          PAUSE ALL
        </button>
      </div>

      <section style="margin-top:24px;">
        <h2 style="${sectionH2()}">Mode</h2>
        <div id="nw-mk-mode" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;"></div>
      </section>

      <section style="margin-top:32px;">
        <h2 style="${sectionH2()}">Per-Platform</h2>
        <div id="nw-mk-platforms" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;"></div>
      </section>

      <section style="margin-top:32px;">
        <h2 style="${sectionH2()}">Pillar Distribution (last 7 days)</h2>
        <div id="nw-mk-pillars" style="font-family:${dossierFonts.mono};font-size:13px;color:${dossierColors.textPrimary};"></div>
      </section>

      <section style="margin-top:32px;">
        <h2 style="${sectionH2()}">Recent Posts</h2>
        <div id="nw-mk-post-filters" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;"></div>
        <div id="nw-mk-posts" style="display:flex;flex-direction:column;gap:8px;">Loading…</div>
      </section>

      <section style="margin-top:32px;">
        <h2 style="${sectionH2()}">Topic Queue Preview</h2>
        <p style="font-family:${dossierFonts.sans};font-size:13px;color:${dossierColors.textTertiary};margin:0 0 12px 0;">
          Click a platform to generate a preview draft (does not post or log to history).
        </p>
        <div id="nw-mk-preview-buttons" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;"></div>
        <div id="nw-mk-preview" style="font-family:${dossierFonts.mono};font-size:13px;color:${dossierColors.textPrimary};white-space:pre-wrap;background:${dossierColors.bgMuted};padding:16px;border-radius:6px;border:1px solid ${dossierColors.border};min-height:80px;">
          (no preview generated yet)
        </div>
      </section>

      <section style="margin-top:32px;">
        <h2 style="${sectionH2()}">Voice Context (loved / hated / neutral)</h2>
        <p style="font-family:${dossierFonts.sans};font-size:13px;color:${dossierColors.textTertiary};margin:0 0 12px 0;">
          Drop example posts here to steer the engine. The next cron run picks them up automatically.
        </p>
        <div id="nw-mk-voice-form" style="margin-bottom:16px;"></div>
        <div id="nw-mk-voice-list" style="display:flex;flex-direction:column;gap:8px;">Loading…</div>
      </section>
    </main>
  `;
}

function sectionH2(): string {
  return `font-family:${dossierFonts.mono};font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${dossierColors.textTertiary};margin:0 0 12px 0;`;
}

function pauseButtonStyle(active: boolean): string {
  return `
    font-family:${dossierFonts.mono};
    font-size:12px;
    font-weight:700;
    letter-spacing:.08em;
    padding:10px 16px;
    border-radius:4px;
    cursor:pointer;
    border:1px solid ${active ? '#dc2626' : dossierColors.border};
    background:${active ? '#dc2626' : '#f8fafc'};
    color:${active ? 'white' : '#dc2626'};
  `.replace(/\s+/g, ' ');
}

function chipStyle(active: boolean): string {
  return `
    font-family:${dossierFonts.mono};
    font-size:11px;
    padding:6px 10px;
    border-radius:4px;
    cursor:pointer;
    border:1px solid ${active ? dossierColors.textPrimary : dossierColors.border};
    background:${active ? dossierColors.textPrimary : 'white'};
    color:${active ? 'white' : dossierColors.textPrimary};
  `.replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function fetchState(): Promise<MarketingState | null> {
  try {
    const res = await fetch('/api/admin/marketing/state', { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as MarketingState;
  } catch {
    return null;
  }
}

async function fetchPosts(platform: Platform | null): Promise<{
  rows: MarketingPost[];
  pillar_distribution: Array<{ pillar: string; c: number }>;
} | null> {
  try {
    const url = platform
      ? `/api/admin/marketing/posts?platform=${platform}&limit=30`
      : '/api/admin/marketing/posts?limit=30';
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as {
      rows: MarketingPost[];
      pillar_distribution: Array<{ pillar: string; c: number }>;
    };
  } catch {
    return null;
  }
}

async function fetchVoiceContext(): Promise<VoiceContextRow[]> {
  try {
    const res = await fetch('/api/admin/marketing/voice-context', { credentials: 'include' });
    if (!res.ok) return [];
    const data = (await res.json()) as { rows: VoiceContextRow[] };
    return data.rows ?? [];
  } catch {
    return [];
  }
}

async function refreshAll(page: HTMLElement): Promise<void> {
  state.marketing = await fetchState();
  const postsResp = await fetchPosts(state.filterPlatform);
  state.posts = postsResp?.rows ?? [];
  state.pillarDistribution = postsResp?.pillar_distribution ?? [];
  state.voiceContext = await fetchVoiceContext();
  renderAll(page);
}

function renderAll(page: HTMLElement): void {
  renderStatusLine(page);
  renderPauseButton(page);
  renderModeRow(page);
  renderPlatformGrid(page);
  renderPillarBars(page);
  renderPostFilters(page);
  renderPosts(page);
  renderPreviewButtons(page);
  renderVoiceForm(page);
  renderVoiceList(page);
}

function renderStatusLine(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-status-line') as HTMLElement | null;
  if (!el || !state.marketing) return;
  const m = state.marketing;
  const mode = m.paused ? 'PAUSED' : m.shadow_mode ? 'SHADOW' : 'LIVE';
  el.textContent = `Mode: ${mode} · Anthropic calls today: ${m.anthropic_calls_today} / 200 · ${new Date().toISOString().slice(0, 19)}Z`;
}

function renderPauseButton(page: HTMLElement): void {
  const btn = page.querySelector('#nw-mk-pause-all') as HTMLButtonElement | null;
  if (!btn || !state.marketing) return;
  const paused = state.marketing.paused;
  btn.textContent = paused ? 'RESUME ALL' : 'PAUSE ALL';
  btn.setAttribute('style', pauseButtonStyle(paused));
}

function renderModeRow(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-mode') as HTMLElement | null;
  if (!el || !state.marketing) return;
  const m = state.marketing;
  el.innerHTML = `
    <button type="button" data-mode="shadow" style="${chipStyle(m.shadow_mode)}">SHADOW MODE</button>
    <button type="button" data-mode="live" style="${chipStyle(!m.shadow_mode)}">LIVE MODE</button>
  `;
  el.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((b) => {
    b.addEventListener('click', async () => {
      const action = b.dataset.mode === 'shadow' ? 'shadow' : 'live';
      await fetch('/api/admin/marketing/pause', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await refreshAll(page);
    });
  });
}

function renderPlatformGrid(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-platforms') as HTMLElement | null;
  if (!el || !state.marketing) return;
  const m = state.marketing;
  el.innerHTML = PLATFORMS.map((p) => {
    const ps = m.platforms[p] ?? { enabled: false, last_run: null };
    const lastRun = ps.last_run ? new Date(ps.last_run).toISOString().slice(11, 16) + 'Z' : '—';
    return `
      <div style="border:1px solid ${dossierColors.border};border-radius:6px;padding:10px 12px;background:white;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-family:${dossierFonts.mono};font-size:13px;text-transform:uppercase;">${p}</strong>
          <button type="button" data-platform="${p}" data-action="${ps.enabled ? 'disable' : 'enable'}"
                  style="${chipStyle(ps.enabled)}">
            ${ps.enabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
        <div style="font-family:${dossierFonts.mono};font-size:11px;color:${dossierColors.textTertiary};margin-top:6px;">
          last run: ${lastRun}
        </div>
      </div>
    `;
  }).join('');
  el.querySelectorAll<HTMLButtonElement>('button[data-platform]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const platform = btn.dataset.platform as Platform;
      const action = btn.dataset.action as 'enable' | 'disable';
      await fetch('/api/admin/marketing/pause', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, platform }),
      });
      await refreshAll(page);
    });
  });
}

function renderPillarBars(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-pillars') as HTMLElement | null;
  if (!el) return;
  const targets: Record<string, number> = {
    signal: 0.4,
    pattern: 0.2,
    methodology: 0.15,
    product: 0.15,
    context: 0.1,
  };
  const total = state.pillarDistribution.reduce((s, r) => s + r.c, 0) || 1;
  const actualMap: Record<string, number> = {};
  for (const r of state.pillarDistribution) actualMap[r.pillar] = r.c / total;
  el.innerHTML = Object.keys(targets)
    .map((p) => {
      const actual = actualMap[p] ?? 0;
      const target = targets[p];
      const bars = Math.round(actual * 20);
      const bar = '\u2588'.repeat(bars) + '\u2591'.repeat(20 - bars);
      return `<div>${p.padEnd(12)} ${bar} ${(actual * 100).toFixed(0).padStart(3)}% (target ${(target * 100).toFixed(0)}%)</div>`;
    })
    .join('');
}

function renderPostFilters(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-post-filters') as HTMLElement | null;
  if (!el) return;
  const all = [null, ...PLATFORMS] as const;
  el.innerHTML = all
    .map((p) => {
      const label = p === null ? 'ALL' : p.toUpperCase();
      const active = state.filterPlatform === p;
      return `<button type="button" data-filter="${p ?? ''}" style="${chipStyle(active)}">${label}</button>`;
    })
    .join('');
  el.querySelectorAll<HTMLButtonElement>('button[data-filter]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.filter;
      state.filterPlatform = !v ? null : (v as Platform);
      const postsResp = await fetchPosts(state.filterPlatform);
      state.posts = postsResp?.rows ?? [];
      state.pillarDistribution = postsResp?.pillar_distribution ?? [];
      renderPostFilters(page);
      renderPosts(page);
      renderPillarBars(page);
    });
  });
}

function renderPosts(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-posts') as HTMLElement | null;
  if (!el) return;
  if (state.posts.length === 0) {
    el.innerHTML = `<div style="font-family:${dossierFonts.mono};font-size:12px;color:${dossierColors.textTertiary};">No posts yet.</div>`;
    return;
  }
  el.innerHTML = state.posts
    .map((p) => {
      const ts = new Date(p.created_at).toISOString().slice(11, 16);
      const tag = p.shadow_mode ? '[SHADOW]' : '[LIVE]';
      const status = p.status.toUpperCase();
      const score = p.voice_score ?? '—';
      const previewText = (p.content || '').slice(0, 200).replace(/\n/g, ' ');
      const errorRow = p.platform_error
        ? `<div style="font-family:${dossierFonts.mono};font-size:11px;color:#dc2626;">ERROR: ${escapeHtml(p.platform_error)}</div>`
        : '';
      return `
        <div style="border:1px solid ${dossierColors.border};border-radius:6px;padding:10px 12px;background:white;">
          <div style="font-family:${dossierFonts.mono};font-size:11px;color:${dossierColors.textTertiary};margin-bottom:4px;">
            ${ts}Z · ${p.platform.toUpperCase()} · ${(p.pillar ?? '?').toUpperCase()} · ${status} · ${tag} · voice ${score}
          </div>
          <div style="font-family:${dossierFonts.mono};font-size:13px;color:${dossierColors.textPrimary};white-space:pre-wrap;">${escapeHtml(previewText)}${p.content.length > 200 ? '…' : ''}</div>
          <div style="font-family:${dossierFonts.mono};font-size:11px;color:${dossierColors.textTertiary};margin-top:6px;">
            impr ${p.impressions} · likes ${p.likes} · reposts ${p.reposts} · replies ${p.replies} · intel ${p.intel_buyer_signal}
          </div>
          ${errorRow}
        </div>
      `;
    })
    .join('');
}

function renderPreviewButtons(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-preview-buttons') as HTMLElement | null;
  if (!el) return;
  el.innerHTML = (['x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky'] as const)
    .map((p) => `<button type="button" data-preview="${p}" style="${chipStyle(false)}">${p.toUpperCase()}</button>`)
    .join('');
  el.querySelectorAll<HTMLButtonElement>('button[data-preview]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const platform = btn.dataset.preview as Platform;
      const previewEl = page.querySelector('#nw-mk-preview') as HTMLElement | null;
      if (!previewEl) return;
      previewEl.textContent = `Generating preview for ${platform.toUpperCase()}…`;
      try {
        const res = await fetch('/api/admin/marketing/preview', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform }),
        });
        const data = await res.json();
        previewEl.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        previewEl.textContent = `Preview failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
  });
}

function renderVoiceForm(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-voice-form') as HTMLElement | null;
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;">
      <select id="nw-mk-vc-platform" style="font-family:${dossierFonts.mono};font-size:12px;padding:6px 8px;border:1px solid ${dossierColors.border};border-radius:4px;">
        <option value="all">all platforms</option>
        ${PLATFORMS.map((p) => `<option value="${p}">${p}</option>`).join('')}
      </select>
      <select id="nw-mk-vc-category" style="font-family:${dossierFonts.mono};font-size:12px;padding:6px 8px;border:1px solid ${dossierColors.border};border-radius:4px;">
        <option value="loved">loved</option>
        <option value="hated">hated</option>
        <option value="neutral">neutral</option>
      </select>
      <textarea id="nw-mk-vc-content" placeholder="Paste an example post…" rows="3" style="flex:1;min-width:280px;font-family:${dossierFonts.mono};font-size:12px;padding:8px;border:1px solid ${dossierColors.border};border-radius:4px;"></textarea>
      <input id="nw-mk-vc-notes" type="text" placeholder="why is this loved/hated?" style="flex:1;min-width:200px;font-family:${dossierFonts.mono};font-size:12px;padding:6px 8px;border:1px solid ${dossierColors.border};border-radius:4px;" />
      <button type="button" id="nw-mk-vc-add" style="${chipStyle(true)}">ADD</button>
    </div>
  `;
  const addBtn = el.querySelector('#nw-mk-vc-add') as HTMLButtonElement | null;
  addBtn?.addEventListener('click', async () => {
    const platform = (el.querySelector('#nw-mk-vc-platform') as HTMLSelectElement).value;
    const category = (el.querySelector('#nw-mk-vc-category') as HTMLSelectElement).value;
    const content = (el.querySelector('#nw-mk-vc-content') as HTMLTextAreaElement).value.trim();
    const notes = (el.querySelector('#nw-mk-vc-notes') as HTMLInputElement).value.trim();
    if (content.length < 5) return;
    await fetch('/api/admin/marketing/voice-context', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, category, content, notes }),
    });
    state.voiceContext = await fetchVoiceContext();
    renderVoiceList(page);
    (el.querySelector('#nw-mk-vc-content') as HTMLTextAreaElement).value = '';
    (el.querySelector('#nw-mk-vc-notes') as HTMLInputElement).value = '';
  });
}

function renderVoiceList(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-voice-list') as HTMLElement | null;
  if (!el) return;
  if (state.voiceContext.length === 0) {
    el.innerHTML = `<div style="font-family:${dossierFonts.mono};font-size:12px;color:${dossierColors.textTertiary};">No voice context yet. Add some examples above.</div>`;
    return;
  }
  el.innerHTML = state.voiceContext
    .map((r) => {
      const icon = r.category === 'loved' ? '\u2764' : r.category === 'hated' ? '\u2717' : '\u25CB';
      return `
        <div style="border:1px solid ${dossierColors.border};border-radius:6px;padding:8px 12px;background:white;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div style="flex:1;">
            <div style="font-family:${dossierFonts.mono};font-size:11px;color:${dossierColors.textTertiary};">
              ${icon} ${r.category} · ${r.platform} · ${r.notes ?? ''}
            </div>
            <div style="font-family:${dossierFonts.mono};font-size:12px;color:${dossierColors.textPrimary};white-space:pre-wrap;margin-top:4px;">${escapeHtml(r.content)}</div>
          </div>
          <button type="button" data-delete-vc="${r.id}" style="${chipStyle(false)}">DELETE</button>
        </div>
      `;
    })
    .join('');
  el.querySelectorAll<HTMLButtonElement>('button[data-delete-vc]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteVc;
      await fetch(`/api/admin/marketing/voice-context?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      state.voiceContext = await fetchVoiceContext();
      renderVoiceList(page);
    });
  });
}

function wireGlobalControls(page: HTMLElement): void {
  const pauseBtn = page.querySelector('#nw-mk-pause-all') as HTMLButtonElement | null;
  pauseBtn?.addEventListener('click', async () => {
    if (!state.marketing) return;
    const action = state.marketing.paused ? 'resume' : 'pause';
    if (action === 'resume') {
      const ok = window.confirm('Resume marketing automation? Engine will start drafting on the next cron tick.');
      if (!ok) return;
    }
    await fetch('/api/admin/marketing/pause', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await refreshAll(page);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
