/**
 * adminMarketingV2.ts — V2 sections of the marketing admin cockpit.
 *
 * Mounted inside adminMarketing.ts as five appended sections:
 *   1. Cadence sliders per platform
 *   2. Pillar mix sliders (normalized on save)
 *   3. Voice tuning knobs (formality / hedging / data-density / emoji)
 *   4. Topic embargo list
 *   5. A/B prompt variants
 *   6. Engagement dashboard
 *   7. Post kill buttons (augments the recent-posts list elsewhere)
 *
 * All fetches hit /api/admin/marketing/* endpoints that enforce
 * resolveAdmin() server-side.
 */
import { colors as dossierColors, fonts as dossierFonts } from '../styles/email-tokens.ts';

const PLATFORMS = ['x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky', 'beehiiv'] as const;
type Platform = (typeof PLATFORMS)[number];

const PILLARS = ['signal', 'pattern', 'methodology', 'product', 'context'] as const;
type Pillar = (typeof PILLARS)[number];

interface VoiceKnobs {
  formality: number;
  hedging: number;
  dataDensity: number;
  emoji: number;
}

interface EmbargoEntry {
  key: string;
  kind: 'topic' | 'entity';
  until: string;
  reason?: string;
}

interface MarketingConfig {
  cadence: Record<Platform, number>;
  pillarMix: Record<Pillar, number>;
  voiceKnobs: VoiceKnobs;
  embargo: EmbargoEntry[];
  version: number;
  updatedAt: string;
  updatedBy?: string;
}

interface VariantRow {
  id: number;
  experiment_key: string;
  platform: string | null;
  pillar: string | null;
  label: string;
  prompt_suffix: string;
  weight: number;
  is_control: boolean;
  status: 'running' | 'paused' | 'retired' | 'winner';
  started_at: string;
  retired_at: string | null;
  notes: string | null;
  n_posts: number;
  mean_score: number;
  last_post_at: string | null;
}

interface EngagementResp {
  window_days: number;
  total_posts: number;
  byPlatform: Record<string, { posts: number; score: number; impressions: number; engagement: number }>;
  byPillar: Record<string, { posts: number; score: number; impressions: number; engagement: number }>;
  daily: Array<{ date: string; posts: number; score: number; impressions: number }>;
  movingAverage: Array<{ date: string; avg_score: number }>;
  topPosts: Array<{
    id: number;
    platform: string;
    pillar: string | null;
    content: string;
    score: number;
    impressions: number;
    likes: number;
    reposts: number;
    replies: number;
    posted_at: string | null;
    platform_url: string | null;
  }>;
}

let v2Config: MarketingConfig | null = null;
let v2Variants: VariantRow[] = [];
let v2Engagement: EngagementResp | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function v2ShellHtml(): string {
  return `
    <section style="margin-top:40px;padding-top:24px;border-top:1px solid ${dossierColors.border};">
      <div class="dossier-kicker" style="text-align:left;margin-bottom:12px;">V2 · TUNING</div>
      <h2 style="font-family:${dossierFonts.serif};font-size:20px;font-weight:600;color:${dossierColors.textPrimary};margin:0 0 16px 0;">
        Live Config
      </h2>
      <div id="nw-mk-v2-cadence" style="margin-bottom:24px;"></div>
      <div id="nw-mk-v2-pillar-mix" style="margin-bottom:24px;"></div>
      <div id="nw-mk-v2-voice-knobs" style="margin-bottom:24px;"></div>
      <div id="nw-mk-v2-embargo" style="margin-bottom:24px;"></div>
    </section>

    <section style="margin-top:24px;">
      <h2 style="${h2Style()}">A/B Prompt Variants</h2>
      <div id="nw-mk-v2-variants" style="margin-bottom:16px;">Loading…</div>
      <div id="nw-mk-v2-variant-form"></div>
    </section>

    <section style="margin-top:32px;">
      <h2 style="${h2Style()}">Engagement Dashboard (14 days)</h2>
      <div id="nw-mk-v2-engagement">Loading…</div>
    </section>
  `;
}

export async function v2MountAll(page: HTMLElement): Promise<void> {
  await Promise.all([v2LoadConfig(), v2LoadVariants(), v2LoadEngagement()]);
  v2RenderCadence(page);
  v2RenderPillarMix(page);
  v2RenderVoiceKnobs(page);
  v2RenderEmbargo(page);
  v2RenderVariants(page);
  v2RenderVariantForm(page);
  v2RenderEngagement(page);
}

/**
 * Attaches a KILL button to every post row that has data-post-id. Called from
 * adminMarketing.ts after renderPosts so existing code doesn't need to know
 * about v2 kill semantics.
 */
export function v2WirePostKills(postsRoot: HTMLElement, onKilled: () => void): void {
  postsRoot.querySelectorAll<HTMLElement>('[data-post-id]').forEach((row) => {
    if (row.querySelector('[data-kill-btn]')) return;
    const id = row.dataset.postId;
    if (!id) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'KILL';
    btn.dataset.killBtn = '1';
    btn.style.cssText = `
      font-family:${dossierFonts.mono};font-size:10px;letter-spacing:.06em;
      padding:4px 8px;margin-top:6px;border-radius:4px;cursor:pointer;
      border:1px solid #dc2626;background:white;color:#dc2626;align-self:flex-start;
    `.replace(/\s+/g, ' ');
    btn.addEventListener('click', async () => {
      if (!window.confirm('Kill this post? Status flips to suppressed — row is kept for audit.')) return;
      const res = await fetch('/api/admin/marketing/kill', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(id, 10), mode: 'suppress' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert((data && (data.error || data.hint)) || 'Kill failed.');
        return;
      }
      onKilled();
    });
    row.appendChild(btn);
  });
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function v2LoadConfig(): Promise<void> {
  try {
    const res = await fetch('/api/admin/marketing/config', { credentials: 'include' });
    if (!res.ok) return;
    const data = (await res.json()) as { config: MarketingConfig };
    v2Config = data.config;
  } catch {
    v2Config = null;
  }
}

async function v2SaveConfig(patch: Partial<MarketingConfig>): Promise<void> {
  try {
    const res = await fetch('/api/admin/marketing/config', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { config: MarketingConfig };
    v2Config = data.config;
  } catch {
    // non-fatal — UI will re-render stale
  }
}

async function v2LoadVariants(): Promise<void> {
  try {
    const res = await fetch('/api/admin/marketing/variants', { credentials: 'include' });
    if (!res.ok) return;
    const data = (await res.json()) as { rows: VariantRow[] };
    v2Variants = data.rows ?? [];
  } catch {
    v2Variants = [];
  }
}

async function v2LoadEngagement(): Promise<void> {
  try {
    const res = await fetch('/api/admin/marketing/engagement?days=14', { credentials: 'include' });
    if (!res.ok) return;
    v2Engagement = (await res.json()) as EngagementResp;
  } catch {
    v2Engagement = null;
  }
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function h2Style(): string {
  return `font-family:${dossierFonts.mono};font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${dossierColors.textTertiary};margin:0 0 12px 0;`;
}

function v2RenderCadence(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-v2-cadence') as HTMLElement | null;
  if (!el || !v2Config) return;
  el.innerHTML = `
    <div style="${h2Style()}">Cadence — Max Posts/Day Per Platform</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
      ${PLATFORMS.map((p) => {
        const v = v2Config!.cadence[p] ?? 1;
        return `
          <label style="font-family:${dossierFonts.mono};font-size:12px;display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid ${dossierColors.border};border-radius:6px;background:white;">
            <span style="display:flex;justify-content:space-between;"><strong>${p.toUpperCase()}</strong><span data-cadence-val="${p}">${v}/day</span></span>
            <input type="range" min="0" max="10" step="1" value="${v}" data-cadence="${p}" style="width:100%;" />
          </label>
        `;
      }).join('')}
    </div>
  `;
  el.querySelectorAll<HTMLInputElement>('input[data-cadence]').forEach((input) => {
    const platform = input.dataset.cadence as Platform;
    const valSpan = el.querySelector(`[data-cadence-val="${platform}"]`) as HTMLElement | null;
    input.addEventListener('input', () => {
      if (valSpan) valSpan.textContent = `${input.value}/day`;
    });
    input.addEventListener('change', async () => {
      const n = parseInt(input.value, 10);
      await v2SaveConfig({ cadence: { ...(v2Config?.cadence ?? {}), [platform]: n } as Record<Platform, number> });
    });
  });
}

function v2RenderPillarMix(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-v2-pillar-mix') as HTMLElement | null;
  if (!el || !v2Config) return;
  el.innerHTML = `
    <div style="${h2Style()}">Pillar Mix — target distribution (auto-normalized to 100%)</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
      ${PILLARS.map((p) => {
        const pct = Math.round((v2Config!.pillarMix[p] ?? 0) * 100);
        return `
          <label style="font-family:${dossierFonts.mono};font-size:12px;display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid ${dossierColors.border};border-radius:6px;background:white;">
            <span style="display:flex;justify-content:space-between;"><strong>${p}</strong><span data-pillar-val="${p}">${pct}%</span></span>
            <input type="range" min="0" max="100" step="1" value="${pct}" data-pillar="${p}" style="width:100%;" />
          </label>
        `;
      }).join('')}
    </div>
    <button type="button" id="nw-mk-v2-pillar-save" style="${primaryBtn()}">Save Pillar Mix</button>
  `;
  el.querySelectorAll<HTMLInputElement>('input[data-pillar]').forEach((input) => {
    const pillar = input.dataset.pillar as Pillar;
    const valSpan = el.querySelector(`[data-pillar-val="${pillar}"]`) as HTMLElement | null;
    input.addEventListener('input', () => {
      if (valSpan) valSpan.textContent = `${input.value}%`;
    });
  });
  (el.querySelector('#nw-mk-v2-pillar-save') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    const mix: Record<Pillar, number> = { signal: 0, pattern: 0, methodology: 0, product: 0, context: 0 };
    PILLARS.forEach((p) => {
      const input = el.querySelector(`input[data-pillar="${p}"]`) as HTMLInputElement | null;
      mix[p] = input ? parseInt(input.value, 10) : 0;
    });
    await v2SaveConfig({ pillarMix: mix });
    v2RenderPillarMix(page);
  });
}

function v2RenderVoiceKnobs(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-v2-voice-knobs') as HTMLElement | null;
  if (!el || !v2Config) return;
  const knobs: Array<[keyof VoiceKnobs, string, string]> = [
    ['formality', 'FORMALITY', 'casual ←→ boardroom'],
    ['hedging', 'HEDGING', 'assertive ←→ heavily hedged'],
    ['dataDensity', 'DATA DENSITY', 'narrative ←→ numbers-first'],
    ['emoji', 'EMOJI', 'none ←→ brand-set max'],
  ];
  el.innerHTML = `
    <div style="${h2Style()}">Voice Knobs — inject calibration into every draft</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
      ${knobs
        .map(([key, label, hint]) => {
          const v = v2Config!.voiceKnobs[key];
          return `
            <label style="font-family:${dossierFonts.mono};font-size:12px;display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid ${dossierColors.border};border-radius:6px;background:white;">
              <span style="display:flex;justify-content:space-between;"><strong>${label}</strong><span data-knob-val="${key}">${v}</span></span>
              <input type="range" min="0" max="100" step="1" value="${v}" data-knob="${key}" style="width:100%;" />
              <span style="font-size:10px;color:${dossierColors.textTertiary};">${hint}</span>
            </label>
          `;
        })
        .join('')}
    </div>
  `;
  el.querySelectorAll<HTMLInputElement>('input[data-knob]').forEach((input) => {
    const key = input.dataset.knob as keyof VoiceKnobs;
    const valSpan = el.querySelector(`[data-knob-val="${key}"]`) as HTMLElement | null;
    input.addEventListener('input', () => {
      if (valSpan) valSpan.textContent = input.value;
    });
    input.addEventListener('change', async () => {
      await v2SaveConfig({ voiceKnobs: { ...v2Config!.voiceKnobs, [key]: parseInt(input.value, 10) } });
    });
  });
}

function v2RenderEmbargo(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-v2-embargo') as HTMLElement | null;
  if (!el || !v2Config) return;
  const list = v2Config.embargo ?? [];
  el.innerHTML = `
    <div style="${h2Style()}">Topic Embargoes — skip topics / entities until the given date</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
      ${
        list.length === 0
          ? `<div style="font-family:${dossierFonts.mono};font-size:12px;color:${dossierColors.textTertiary};">No active embargoes.</div>`
          : list
              .map((e, i) => {
                const until = new Date(e.until);
                return `
                  <div style="display:flex;gap:8px;align-items:center;font-family:${dossierFonts.mono};font-size:12px;border:1px solid ${dossierColors.border};border-radius:4px;padding:6px 10px;background:white;">
                    <strong>${escapeHtml(e.key)}</strong>
                    <span style="color:${dossierColors.textTertiary};">(${e.kind})</span>
                    <span style="color:${dossierColors.textTertiary};">until ${isNaN(until.getTime()) ? e.until : until.toISOString().slice(0, 10)}</span>
                    ${e.reason ? `<span style="color:${dossierColors.textTertiary};flex:1;">— ${escapeHtml(e.reason)}</span>` : '<span style="flex:1;"></span>'}
                    <button type="button" data-embargo-remove="${i}" style="${chipBtn()}">REMOVE</button>
                  </div>
                `;
              })
              .join('')
      }
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <input id="nw-mk-v2-emb-key" placeholder="topic_key or Entity Name" style="${smallInput()}" />
      <select id="nw-mk-v2-emb-kind" style="${smallInput()}">
        <option value="topic">topic</option>
        <option value="entity">entity</option>
      </select>
      <input id="nw-mk-v2-emb-days" type="number" min="1" max="365" value="7" style="${smallInput()}; width:70px;" />
      <span style="font-family:${dossierFonts.mono};font-size:11px;color:${dossierColors.textTertiary};">days</span>
      <input id="nw-mk-v2-emb-reason" placeholder="reason (optional)" style="${smallInput()}" />
      <button type="button" id="nw-mk-v2-emb-add" style="${primaryBtn()}">ADD EMBARGO</button>
    </div>
  `;
  el.querySelectorAll<HTMLButtonElement>('button[data-embargo-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.embargoRemove ?? '', 10);
      if (!Number.isFinite(i)) return;
      const next = (v2Config!.embargo ?? []).filter((_, idx) => idx !== i);
      await v2SaveConfig({ embargo: next });
      v2RenderEmbargo(page);
    });
  });
  (el.querySelector('#nw-mk-v2-emb-add') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    const key = (el.querySelector('#nw-mk-v2-emb-key') as HTMLInputElement).value.trim();
    const kind = (el.querySelector('#nw-mk-v2-emb-kind') as HTMLSelectElement).value as 'topic' | 'entity';
    const days = Math.max(1, parseInt((el.querySelector('#nw-mk-v2-emb-days') as HTMLInputElement).value, 10) || 7);
    const reason = (el.querySelector('#nw-mk-v2-emb-reason') as HTMLInputElement).value.trim();
    if (!key) return;
    const until = new Date(Date.now() + days * 86400000).toISOString();
    const next = [...(v2Config?.embargo ?? []), { key, kind, until, reason: reason || undefined }];
    await v2SaveConfig({ embargo: next });
    v2RenderEmbargo(page);
  });
}

function v2RenderVariants(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-v2-variants') as HTMLElement | null;
  if (!el) return;
  if (v2Variants.length === 0) {
    el.innerHTML = `<div style="font-family:${dossierFonts.mono};font-size:12px;color:${dossierColors.textTertiary};">No variants yet. Add one below to start an experiment.</div>`;
    return;
  }
  const byExp = new Map<string, VariantRow[]>();
  for (const v of v2Variants) {
    const list = byExp.get(v.experiment_key) ?? [];
    list.push(v);
    byExp.set(v.experiment_key, list);
  }
  el.innerHTML = [...byExp.entries()]
    .map(([key, rows]) => {
      const rowsHtml = rows
        .map((r) => {
          const scope = `${r.platform ?? 'any'} / ${r.pillar ?? 'any'}`;
          const statusColor =
            r.status === 'winner'
              ? '#16a34a'
              : r.status === 'retired'
                ? dossierColors.textTertiary
                : r.status === 'paused'
                  ? '#f97316'
                  : dossierColors.textPrimary;
          return `
            <tr>
              <td style="padding:6px 8px;">${escapeHtml(r.label)}${r.is_control ? ' <span style="font-size:10px;color:#f97316;">(control)</span>' : ''}</td>
              <td style="padding:6px 8px;color:${dossierColors.textTertiary};">${scope}</td>
              <td style="padding:6px 8px;"><input type="number" min="0" max="1" step="0.05" value="${r.weight.toFixed(2)}" data-variant-weight="${r.id}" style="${smallInput()};width:70px;" /></td>
              <td style="padding:6px 8px;">
                <select data-variant-status="${r.id}" style="${smallInput()}">
                  ${(['running', 'paused', 'retired', 'winner'] as const).map((s) => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </td>
              <td style="padding:6px 8px;color:${statusColor};">n=${r.n_posts}, μ=${r.mean_score.toFixed(0)}</td>
              <td style="padding:6px 8px;"><button type="button" data-variant-save="${r.id}" style="${chipBtn()}">SAVE</button></td>
            </tr>
          `;
        })
        .join('');
      return `
        <div style="margin-bottom:16px;">
          <div style="font-family:${dossierFonts.mono};font-size:11px;font-weight:600;letter-spacing:.06em;color:${dossierColors.textPrimary};margin-bottom:4px;">EXPERIMENT: ${escapeHtml(key)}</div>
          <table style="width:100%;border-collapse:collapse;font-family:${dossierFonts.mono};font-size:12px;background:white;border:1px solid ${dossierColors.border};border-radius:4px;">
            <thead>
              <tr style="background:${dossierColors.bgMuted};color:${dossierColors.textTertiary};font-size:10px;letter-spacing:.08em;">
                <th style="text-align:left;padding:6px 8px;">LABEL</th>
                <th style="text-align:left;padding:6px 8px;">SCOPE</th>
                <th style="text-align:left;padding:6px 8px;">WEIGHT</th>
                <th style="text-align:left;padding:6px 8px;">STATUS</th>
                <th style="text-align:left;padding:6px 8px;">STATS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    })
    .join('');
  el.querySelectorAll<HTMLButtonElement>('button[data-variant-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.variantSave;
      if (!id) return;
      const weightEl = el.querySelector(`input[data-variant-weight="${id}"]`) as HTMLInputElement | null;
      const statusEl = el.querySelector(`select[data-variant-status="${id}"]`) as HTMLSelectElement | null;
      const body = {
        weight: weightEl ? parseFloat(weightEl.value) : undefined,
        status: statusEl?.value,
      };
      await fetch(`/api/admin/marketing/variants?id=${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await v2LoadVariants();
      v2RenderVariants(page);
    });
  });
}

function v2RenderVariantForm(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-v2-variant-form') as HTMLElement | null;
  if (!el) return;
  el.innerHTML = `
    <details style="border:1px dashed ${dossierColors.border};border-radius:6px;padding:12px;background:white;">
      <summary style="font-family:${dossierFonts.mono};font-size:12px;cursor:pointer;">+ NEW VARIANT</summary>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:12px;">
        <input id="nw-mk-v2-var-exp" placeholder="experiment_key (e.g. x-hook-v1)" style="${smallInput()}" />
        <input id="nw-mk-v2-var-label" placeholder="label (e.g. control, B, shorter)" style="${smallInput()}" />
        <select id="nw-mk-v2-var-platform" style="${smallInput()}">
          <option value="">any platform</option>
          ${PLATFORMS.map((p) => `<option value="${p}">${p}</option>`).join('')}
        </select>
        <select id="nw-mk-v2-var-pillar" style="${smallInput()}">
          <option value="">any pillar</option>
          ${PILLARS.map((p) => `<option value="${p}">${p}</option>`).join('')}
        </select>
        <input id="nw-mk-v2-var-weight" type="number" min="0" max="1" step="0.05" value="0.5" style="${smallInput()}" />
        <label style="font-family:${dossierFonts.mono};font-size:12px;display:flex;align-items:center;gap:6px;">
          <input id="nw-mk-v2-var-control" type="checkbox" /> control
        </label>
      </div>
      <textarea id="nw-mk-v2-var-suffix" rows="4" placeholder="prompt_suffix — appended to the system prompt for matching posts" style="${smallInput()};width:100%;margin-top:8px;"></textarea>
      <button type="button" id="nw-mk-v2-var-add" style="${primaryBtn()};margin-top:8px;">ADD VARIANT</button>
    </details>
  `;
  (el.querySelector('#nw-mk-v2-var-add') as HTMLButtonElement | null)?.addEventListener('click', async () => {
    const body = {
      experiment_key: (el.querySelector('#nw-mk-v2-var-exp') as HTMLInputElement).value.trim(),
      label: (el.querySelector('#nw-mk-v2-var-label') as HTMLInputElement).value.trim(),
      platform: (el.querySelector('#nw-mk-v2-var-platform') as HTMLSelectElement).value || null,
      pillar: (el.querySelector('#nw-mk-v2-var-pillar') as HTMLSelectElement).value || null,
      weight: parseFloat((el.querySelector('#nw-mk-v2-var-weight') as HTMLInputElement).value) || 0.5,
      is_control: (el.querySelector('#nw-mk-v2-var-control') as HTMLInputElement).checked,
      prompt_suffix: (el.querySelector('#nw-mk-v2-var-suffix') as HTMLTextAreaElement).value,
    };
    if (!body.experiment_key || !body.label || !body.prompt_suffix) {
      alert('experiment_key, label, and prompt_suffix are required.');
      return;
    }
    const res = await fetch('/api/admin/marketing/variants', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      alert('Variant create failed.');
      return;
    }
    await v2LoadVariants();
    v2RenderVariants(page);
  });
}

function v2RenderEngagement(page: HTMLElement): void {
  const el = page.querySelector('#nw-mk-v2-engagement') as HTMLElement | null;
  if (!el) return;
  if (!v2Engagement) {
    el.innerHTML = `<div style="font-family:${dossierFonts.mono};font-size:12px;color:${dossierColors.textTertiary};">No engagement data yet.</div>`;
    return;
  }
  const e = v2Engagement;

  const platformRows = Object.entries(e.byPlatform)
    .sort((a, b) => b[1].score - a[1].score)
    .map(
      ([p, s]) => `
        <tr>
          <td style="padding:6px 8px;text-transform:uppercase;">${p}</td>
          <td style="padding:6px 8px;">${s.posts}</td>
          <td style="padding:6px 8px;">${Math.round(s.score).toLocaleString()}</td>
          <td style="padding:6px 8px;">${Math.round(s.impressions).toLocaleString()}</td>
          <td style="padding:6px 8px;">${s.engagement.toLocaleString()}</td>
        </tr>
      `,
    )
    .join('');
  const pillarRows = Object.entries(e.byPillar)
    .sort((a, b) => b[1].score - a[1].score)
    .map(
      ([p, s]) => `
        <tr>
          <td style="padding:6px 8px;">${p}</td>
          <td style="padding:6px 8px;">${s.posts}</td>
          <td style="padding:6px 8px;">${Math.round(s.score).toLocaleString()}</td>
          <td style="padding:6px 8px;">${Math.round(s.impressions).toLocaleString()}</td>
          <td style="padding:6px 8px;">${s.engagement.toLocaleString()}</td>
        </tr>
      `,
    )
    .join('');

  const maRow = e.movingAverage.slice(-14);
  const maMax = Math.max(1, ...maRow.map((d) => d.avg_score));
  const maBars = maRow
    .map((d) => {
      const h = Math.round((d.avg_score / maMax) * 40);
      return `<div title="${d.date}: ${d.avg_score}" style="flex:1;min-width:12px;height:${h}px;background:${dossierColors.textPrimary};margin-right:2px;"></div>`;
    })
    .join('');

  const topPosts = e.topPosts
    .map(
      (p) => `
        <div style="border:1px solid ${dossierColors.border};border-radius:6px;padding:8px 10px;background:white;margin-bottom:6px;">
          <div style="font-family:${dossierFonts.mono};font-size:11px;color:${dossierColors.textTertiary};">
            ${p.platform.toUpperCase()} · ${(p.pillar ?? '?').toUpperCase()} · score ${Math.round(p.score).toLocaleString()} · impr ${p.impressions.toLocaleString()} · ♥${p.likes} ↻${p.reposts} 💬${p.replies}
          </div>
          <div style="font-family:${dossierFonts.mono};font-size:12px;color:${dossierColors.textPrimary};margin-top:4px;">${escapeHtml(p.content)}${p.platform_url ? ` · <a href="${p.platform_url}" target="_blank" rel="noopener noreferrer">open</a>` : ''}</div>
        </div>
      `,
    )
    .join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div>
        <div style="${h2Style()}">By Platform (${e.window_days}d · ${e.total_posts} posts)</div>
        <table style="width:100%;border-collapse:collapse;font-family:${dossierFonts.mono};font-size:12px;background:white;border:1px solid ${dossierColors.border};">
          <thead><tr style="background:${dossierColors.bgMuted};color:${dossierColors.textTertiary};"><th style="text-align:left;padding:6px 8px;">PLATFORM</th><th style="text-align:left;padding:6px 8px;">N</th><th style="text-align:left;padding:6px 8px;">SCORE</th><th style="text-align:left;padding:6px 8px;">IMPR</th><th style="text-align:left;padding:6px 8px;">ENG</th></tr></thead>
          <tbody>${platformRows || '<tr><td colspan="5" style="padding:6px 8px;color:#999;">no data</td></tr>'}</tbody>
        </table>
      </div>
      <div>
        <div style="${h2Style()}">By Pillar</div>
        <table style="width:100%;border-collapse:collapse;font-family:${dossierFonts.mono};font-size:12px;background:white;border:1px solid ${dossierColors.border};">
          <thead><tr style="background:${dossierColors.bgMuted};color:${dossierColors.textTertiary};"><th style="text-align:left;padding:6px 8px;">PILLAR</th><th style="text-align:left;padding:6px 8px;">N</th><th style="text-align:left;padding:6px 8px;">SCORE</th><th style="text-align:left;padding:6px 8px;">IMPR</th><th style="text-align:left;padding:6px 8px;">ENG</th></tr></thead>
          <tbody>${pillarRows || '<tr><td colspan="5" style="padding:6px 8px;color:#999;">no data</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div style="${h2Style()}">14-Day Moving Average (composite score)</div>
    <div style="display:flex;align-items:flex-end;height:50px;margin-bottom:16px;padding:6px;border:1px solid ${dossierColors.border};border-radius:4px;background:white;">
      ${maBars || '<span style="font-family:mono;font-size:12px;color:#999;">no data</span>'}
    </div>

    <div style="${h2Style()}">Top Posts (${e.window_days}d)</div>
    <div>${topPosts || '<div style="font-family:mono;font-size:12px;color:#999;">no posts yet</div>'}</div>
  `;
}

// ---------------------------------------------------------------------------
// Styling helpers
// ---------------------------------------------------------------------------

function primaryBtn(): string {
  return `
    font-family:${dossierFonts.mono};
    font-size:11px;
    font-weight:700;
    letter-spacing:.06em;
    padding:6px 12px;
    border-radius:4px;
    cursor:pointer;
    border:1px solid ${dossierColors.textPrimary};
    background:${dossierColors.textPrimary};
    color:white;
    margin-top:8px;
  `.replace(/\s+/g, ' ');
}

function chipBtn(): string {
  return `
    font-family:${dossierFonts.mono};
    font-size:10px;
    letter-spacing:.06em;
    padding:4px 8px;
    border-radius:4px;
    cursor:pointer;
    border:1px solid ${dossierColors.border};
    background:white;
    color:${dossierColors.textPrimary};
  `.replace(/\s+/g, ' ');
}

function smallInput(): string {
  return `font-family:${dossierFonts.mono};font-size:12px;padding:6px 8px;border:1px solid ${dossierColors.border};border-radius:4px;background:white;`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
