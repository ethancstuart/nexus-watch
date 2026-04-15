import '../styles/briefs-dossier.css';
import { createElement } from '../utils/dom.ts';
import { colors as dossierColors, fonts as dossierFonts } from '../styles/email-tokens.ts';

/**
 * Admin — Revenue Cockpit (route: /#/admin/revenue)
 *
 * Single-screen dashboard over Stripe for MRR/ARR, tier mix, churn, the
 * founding-100 cohort counter, and a live event stream.
 *
 * Data source: /api/admin/revenue (admin-gated). Stripe is the source
 * of truth — this page does no caching beyond one fetch on mount.
 */

interface RevenueResp {
  mrr: { total: number; analyst: number; pro: number; founding: number };
  arr: number;
  subs: { active: number; canceling: number; canceled: number; total: number };
  by_tier: { analyst: number; pro: number; founding: number };
  founding: { cap: number; active: number; reserved: number; remaining: number };
  mtd_new: number;
  mtd_churned: number;
  churn_30d_pct: number;
  recent_events: Array<{
    type: string;
    at: string;
    amount: number | null;
    tier: string | null;
    customer_email: string | null;
  }>;
  fetched_at: string;
}

export async function renderAdminRevenue(root: HTMLElement): Promise<void> {
  root.textContent = '';
  document.title = 'Revenue — NexusWatch Admin';

  const page = createElement('div', { className: 'briefs-dossier' });
  page.innerHTML = shell();
  root.appendChild(page);

  const body = page.querySelector('#nw-rev-body') as HTMLElement | null;
  if (!body) return;

  body.innerHTML = loadingHtml();

  try {
    const res = await fetch('/api/admin/revenue', { credentials: 'include' });
    if (res.status === 403) {
      body.innerHTML = forbiddenHtml();
      return;
    }
    if (!res.ok) {
      body.innerHTML = errorHtml(`Fetch failed: ${res.status}`);
      return;
    }
    const data = (await res.json()) as RevenueResp;
    body.innerHTML = renderMain(data);
  } catch (err) {
    body.innerHTML = errorHtml(err instanceof Error ? err.message : 'unknown error');
  }
}

function shell(): string {
  return `
    <nav class="dossier-nav">
      <a href="#/" class="dossier-nav-logo">NexusWatch</a>
      <div class="dossier-nav-links">
        <a href="#/intel" class="dossier-nav-link">PLATFORM</a>
        <a href="#/admin/marketing" class="dossier-nav-link">MARKETING</a>
        <a href="#/admin/revenue" class="dossier-nav-link dossier-nav-subscribe">REVENUE</a>
      </div>
    </nav>

    <main style="max-width: 1200px; margin: 0 auto; padding: 32px 24px 64px;">
      <div class="dossier-kicker" style="text-align:left;margin-bottom:8px;">ADMIN · REVENUE</div>
      <h1 style="font-family:${dossierFonts.serif};font-size:32px;font-weight:600;color:${dossierColors.textPrimary};margin:0 0 24px 0;">
        Revenue Cockpit
      </h1>
      <div id="nw-rev-body"></div>
    </main>
  `;
}

function loadingHtml(): string {
  return `<div style="font-family:${dossierFonts.mono};font-size:13px;color:${dossierColors.textTertiary};">Loading Stripe data…</div>`;
}

function forbiddenHtml(): string {
  return `<div style="font-family:${dossierFonts.mono};font-size:13px;color:#dc2626;">403 — admin only. Sign in with an admin email.</div>`;
}

function errorHtml(msg: string): string {
  return `<div style="font-family:${dossierFonts.mono};font-size:13px;color:#dc2626;">Error: ${escapeHtml(msg)}</div>`;
}

function renderMain(d: RevenueResp): string {
  const foundingPct = Math.round((d.founding.active / Math.max(1, d.founding.cap)) * 100);
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px;">
      ${metricCard('MRR', '$' + d.mrr.total.toLocaleString(), `Analyst $${d.mrr.analyst} · Pro $${d.mrr.pro} · Founding $${d.mrr.founding}`)}
      ${metricCard('ARR', '$' + d.arr.toLocaleString(), `${d.subs.active} active subs`)}
      ${metricCard('Active', String(d.subs.active), `${d.subs.canceling} canceling · ${d.subs.canceled} canceled`)}
      ${metricCard('30d Churn', `${d.churn_30d_pct}%`, `MTD new ${d.mtd_new} · churned ${d.mtd_churned}`)}
    </div>

    <section style="margin-top:24px;">
      <h2 style="${h2()}">Founding-100 Cohort</h2>
      <div style="background:white;border:1px solid ${dossierColors.border};border-radius:6px;padding:16px;">
        <div style="display:flex;justify-content:space-between;font-family:${dossierFonts.mono};font-size:13px;margin-bottom:8px;">
          <span>${d.founding.active} / ${d.founding.cap} seats claimed</span>
          <span style="color:${dossierColors.textTertiary};">${d.founding.remaining} remaining · ${d.founding.reserved} reserved (in-flight checkouts)</span>
        </div>
        <div style="height:10px;background:${dossierColors.bgMuted};border-radius:5px;overflow:hidden;">
          <div style="height:100%;width:${foundingPct}%;background:#9a1b1b;"></div>
        </div>
      </div>
    </section>

    <section style="margin-top:24px;">
      <h2 style="${h2()}">Tier Mix</h2>
      <table style="width:100%;border-collapse:collapse;font-family:${dossierFonts.mono};font-size:13px;background:white;border:1px solid ${dossierColors.border};border-radius:6px;">
        <thead>
          <tr style="background:${dossierColors.bgMuted};color:${dossierColors.textTertiary};font-size:11px;letter-spacing:.08em;">
            <th style="text-align:left;padding:8px 12px;">TIER</th>
            <th style="text-align:left;padding:8px 12px;">ACTIVE</th>
            <th style="text-align:left;padding:8px 12px;">MRR</th>
            <th style="text-align:left;padding:8px 12px;">% OF MRR</th>
          </tr>
        </thead>
        <tbody>
          ${tierRow('Analyst ($29)', d.by_tier.analyst, d.mrr.analyst, d.mrr.total)}
          ${tierRow('Pro ($99)', d.by_tier.pro, d.mrr.pro, d.mrr.total)}
          ${tierRow('Founding ($19)', d.by_tier.founding, d.mrr.founding, d.mrr.total)}
        </tbody>
      </table>
    </section>

    <section style="margin-top:24px;">
      <h2 style="${h2()}">Recent Stripe Events</h2>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${
          d.recent_events.length === 0
            ? `<div style="font-family:${dossierFonts.mono};font-size:12px;color:${dossierColors.textTertiary};">No recent events.</div>`
            : d.recent_events
                .map(
                  (e) => `
          <div style="display:flex;justify-content:space-between;font-family:${dossierFonts.mono};font-size:12px;background:white;border:1px solid ${dossierColors.border};border-radius:4px;padding:6px 10px;">
            <span>${escapeHtml(e.type)} ${e.tier ? `· ${escapeHtml(e.tier)}` : ''} ${e.customer_email ? `· ${escapeHtml(e.customer_email)}` : ''}</span>
            <span style="color:${dossierColors.textTertiary};">${e.amount !== null ? '$' + e.amount : ''} · ${new Date(e.at).toISOString().slice(0, 19)}Z</span>
          </div>
        `,
                )
                .join('')
        }
      </div>
    </section>

    <div style="margin-top:24px;font-family:${dossierFonts.mono};font-size:11px;color:${dossierColors.textTertiary};">
      Fetched ${new Date(d.fetched_at).toISOString()} · Source: Stripe API (stripe:${d.subs.total} subs)
    </div>
  `;
}

function metricCard(label: string, value: string, note: string): string {
  return `
    <div style="background:white;border:1px solid ${dossierColors.border};border-radius:6px;padding:12px 14px;">
      <div style="font-family:${dossierFonts.mono};font-size:10px;letter-spacing:.1em;color:${dossierColors.textTertiary};margin-bottom:4px;">${label}</div>
      <div style="font-family:${dossierFonts.serif};font-size:28px;font-weight:600;color:${dossierColors.textPrimary};">${value}</div>
      <div style="font-family:${dossierFonts.mono};font-size:11px;color:${dossierColors.textTertiary};margin-top:6px;">${note}</div>
    </div>
  `;
}

function tierRow(label: string, n: number, mrr: number, total: number): string {
  const pct = total > 0 ? Math.round((mrr / total) * 100) : 0;
  return `
    <tr>
      <td style="padding:8px 12px;">${label}</td>
      <td style="padding:8px 12px;">${n}</td>
      <td style="padding:8px 12px;">$${mrr.toLocaleString()}</td>
      <td style="padding:8px 12px;">${pct}%</td>
    </tr>
  `;
}

function h2(): string {
  return `font-family:${dossierFonts.mono};font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${dossierColors.textTertiary};margin:0 0 12px 0;`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
