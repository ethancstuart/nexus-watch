import { ImageResponse } from '@vercel/og';
import type { VercelRequest } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'edge' };

/**
 * Top-level OG image generator at /api/og.
 *
 * Three marquee variants for marketing surfaces:
 *   - type=site                       Default site card. Wordmark + tagline + Free. badge.
 *   - type=brief&date=YYYY-MM-DD      Daily brief card. Date, headline, tension index.
 *   - type=country&iso=XX             Country card. Name, flag emoji, current CII score.
 *
 * Output: 1200x630 PNG, JetBrains-mono terminal copy, dark bg.
 * Cache: public, max-age=3600, s-maxage=86400.
 *
 * The product is FREE — no Pro/Founding/$X tier copy lives in any of these
 * templates. Tier-specific marketing cards live in /api/og/social for the
 * automated marketing pipeline.
 */

const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan', AR: 'Argentina', AU: 'Australia', BD: 'Bangladesh',
  BF: 'Burkina Faso', BR: 'Brazil', CA: 'Canada', CD: 'DR Congo',
  CN: 'China', CO: 'Colombia', DE: 'Germany', EG: 'Egypt',
  ET: 'Ethiopia', FR: 'France', GB: 'United Kingdom', HT: 'Haiti',
  IL: 'Israel', IN: 'India', IQ: 'Iraq', IR: 'Iran',
  IT: 'Italy', JP: 'Japan', KP: 'North Korea', KR: 'South Korea',
  LB: 'Lebanon', LY: 'Libya', ML: 'Mali', MM: 'Myanmar',
  MX: 'Mexico', NG: 'Nigeria', PK: 'Pakistan', PL: 'Poland',
  PS: 'Palestine', RO: 'Romania', RU: 'Russia', SA: 'Saudi Arabia',
  SD: 'Sudan', SO: 'Somalia', SS: 'South Sudan', SY: 'Syria',
  TD: 'Chad', TR: 'Turkey', TW: 'Taiwan', UA: 'Ukraine',
  US: 'United States', VE: 'Venezuela', YE: 'Yemen', ZA: 'South Africa',
};

function flag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function ciiColor(score: number): string {
  if (score >= 70) return '#dc2626';
  if (score >= 50) return '#ff6600';
  if (score >= 30) return '#e5a913';
  return '#00d4aa';
}

function ciiLabel(score: number): string {
  if (score >= 70) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 30) return 'ELEVATED';
  return 'LOW';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
// Source Serif 4 is being added by Track D; until that lands, fall back to a
// system serif so this endpoint always renders cleanly.
const SERIF = "'Source Serif 4', 'Tiempos Headline', Georgia, 'Times New Roman', serif";

function renderSiteCard(): string {
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;background:#04050a;padding:64px 72px;font-family:${MONO};">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="color:#ff6600;font-size:22px;font-weight:700;letter-spacing:0.18em;">NEXUSWATCH</span>
      <span style="color:#04050a;background:#00d4aa;font-size:13px;font-weight:700;letter-spacing:0.18em;padding:6px 14px;border-radius:999px;">FREE.</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <span style="color:#ededed;font-size:64px;font-weight:600;line-height:1.1;font-family:${SERIF};">Real-time geopolitical intelligence.</span>
      <span style="color:#7a8290;font-size:22px;font-weight:500;line-height:1.4;">45+ live data layers · 86 countries scored · daily AI brief</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="color:#5a6370;font-size:14px;letter-spacing:0.08em;">nexuswatch.dev</span>
      <span style="color:#5a6370;font-size:14px;letter-spacing:0.08em;">// terminal for the world</span>
    </div>
  </div>`;
}

function renderBriefCard(date: string, headline: string, tension: number | null): string {
  const tColor = tension == null ? '#7a8290' : ciiColor(tension);
  const tLabel = tension == null ? 'TENSION INDEX' : `TENSION ${tension}`;
  const safeHeadline = escapeHtml(headline.slice(0, 140));
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;background:#04050a;padding:64px 72px;font-family:${MONO};">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="color:#ff6600;font-size:18px;font-weight:700;letter-spacing:0.18em;">NEXUSWATCH · BRIEF</span>
      <span style="color:#04050a;background:#00d4aa;font-size:11px;font-weight:700;letter-spacing:0.18em;padding:5px 12px;border-radius:999px;">FREE.</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px;">
      <span style="color:#7a8290;font-size:18px;letter-spacing:0.14em;">SITREP · ${escapeHtml(date)}</span>
      <span style="color:#ededed;font-size:46px;font-weight:600;line-height:1.2;font-family:${SERIF};">${safeHeadline}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="color:${tColor};font-size:16px;font-weight:700;letter-spacing:0.14em;">${tLabel}</span>
      <span style="color:#5a6370;font-size:14px;">nexuswatch.dev/brief/${escapeHtml(date)}</span>
    </div>
  </div>`;
}

function renderCountryCard(iso: string, name: string, score: number | null): string {
  const color = score == null ? '#7a8290' : ciiColor(score);
  const label = score == null ? 'NO DATA' : ciiLabel(score);
  const display = score == null ? '—' : String(score);
  const emoji = flag(iso);
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;background:#04050a;padding:64px 72px;font-family:${MONO};">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="color:#ff6600;font-size:18px;font-weight:700;letter-spacing:0.18em;">NEXUSWATCH · COUNTRY</span>
      <span style="color:${color};font-size:12px;font-weight:700;letter-spacing:0.18em;padding:5px 12px;border:1px solid ${color};border-radius:4px;">${label}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;align-items:center;gap:24px;">
        <span style="font-size:88px;line-height:1;">${emoji}</span>
        <span style="color:#ededed;font-size:56px;font-weight:600;font-family:${SERIF};">${escapeHtml(name)}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:18px;">
        <span style="color:${color};font-size:128px;font-weight:700;font-family:${MONO};line-height:1;">${display}</span>
        <span style="color:#7a8290;font-size:18px;letter-spacing:0.14em;">CII · 0-100</span>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="color:#04050a;background:#00d4aa;font-size:11px;font-weight:700;letter-spacing:0.18em;padding:5px 12px;border-radius:999px;">FREE.</span>
      <span style="color:#5a6370;font-size:14px;">nexuswatch.dev/country/${escapeHtml(iso)}</span>
    </div>
  </div>`;
}

async function fetchBrief(date: string): Promise<{ headline: string; tension: number | null }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return { headline: 'Daily geopolitical intelligence brief.', tension: null };
  try {
    const sql = neon(dbUrl);
    const rows = (await sql`
      SELECT summary, content FROM daily_briefs WHERE brief_date = ${date} LIMIT 1
    `) as Array<{ summary: string | null; content: unknown }>;
    if (rows.length === 0) return { headline: 'Daily geopolitical intelligence brief.', tension: null };
    let headline = (rows[0].summary || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
    let tension: number | null = null;
    try {
      const c =
        typeof rows[0].content === 'string'
          ? (JSON.parse(rows[0].content) as { tensionIndex?: number; topRiskCountries?: Array<{ name?: string }> })
          : (rows[0].content as { tensionIndex?: number; topRiskCountries?: Array<{ name?: string }> }) || {};
      if (typeof c.tensionIndex === 'number') tension = Math.round(c.tensionIndex);
      if (!headline && c.topRiskCountries?.[0]?.name) {
        headline = `Top risk: ${c.topRiskCountries[0].name}.`;
      }
    } catch {
      /* fall back */
    }
    if (!headline) headline = 'Daily geopolitical intelligence brief.';
    return { headline, tension };
  } catch {
    return { headline: 'Daily geopolitical intelligence brief.', tension: null };
  }
}

async function fetchCountryScore(iso: string): Promise<number | null> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  try {
    const sql = neon(dbUrl);
    const rows = (await sql`
      SELECT score FROM country_cii_history
      WHERE country_code = ${iso}
      ORDER BY computed_at DESC NULLS LAST, snapshot_date DESC NULLS LAST
      LIMIT 1
    `) as Array<{ score: number | string }>;
    if (rows.length === 0) return null;
    const n = typeof rows[0].score === 'string' ? parseFloat(rows[0].score) : rows[0].score;
    return Number.isFinite(n) ? Math.round(n) : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest) {
  const url = new URL(req.url!, 'https://nexuswatch.dev');
  const type = url.searchParams.get('type') || 'site';

  let html: string;

  if (type === 'brief') {
    const date = (url.searchParams.get('date') || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
    const { headline, tension } = await fetchBrief(safeDate);
    html = renderBriefCard(safeDate, headline, tension);
  } else if (type === 'country') {
    const iso = (url.searchParams.get('iso') || 'US').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    const name = COUNTRY_NAMES[iso] || iso;
    const score = await fetchCountryScore(iso);
    html = renderCountryCard(iso, name, score);
  } else {
    html = renderSiteCard();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = new ImageResponse(html as any, { width: 1200, height: 630 });
  // ImageResponse sets its own headers; layer cache headers on top.
  response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return response;
}
