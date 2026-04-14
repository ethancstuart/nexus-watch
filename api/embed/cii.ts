import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Embeddable CII Widget
 *
 * GET /api/embed/cii?code=UA          → 280x120 iframe HTML
 * GET /api/embed/cii?code=UA&size=sm  → 180x80 mini
 * GET /api/embed/cii?code=UA&size=lg  → 400x240 full
 *
 * Designed for embedding in blogs, news sites, dashboards:
 *   <iframe src="https://nexuswatch.dev/api/embed/cii?code=UA"
 *           width="280" height="120" frameborder="0"></iframe>
 *
 * Attribution bar ("NexusWatch →") links back to /#/audit/:code.
 * No auth required. Cached 5 minutes.
 */

const NAMES: Record<string, string> = {
  UA: 'Ukraine',
  RU: 'Russia',
  CN: 'China',
  TW: 'Taiwan',
  IR: 'Iran',
  IQ: 'Iraq',
  SY: 'Syria',
  IL: 'Israel',
  PS: 'Palestine',
  YE: 'Yemen',
  SD: 'Sudan',
  SS: 'South Sudan',
  ET: 'Ethiopia',
  SO: 'Somalia',
  CD: 'DR Congo',
  MM: 'Myanmar',
  AF: 'Afghanistan',
  PK: 'Pakistan',
  KP: 'North Korea',
  KR: 'South Korea',
  VE: 'Venezuela',
  NG: 'Nigeria',
  LY: 'Libya',
  LB: 'Lebanon',
  SA: 'Saudi Arabia',
  US: 'United States',
  JP: 'Japan',
  DE: 'Germany',
  GB: 'United Kingdom',
  FR: 'France',
  IN: 'India',
  BR: 'Brazil',
  MX: 'Mexico',
  PH: 'Philippines',
  ID: 'Indonesia',
  TR: 'Turkey',
  EG: 'Egypt',
  ZA: 'South Africa',
  KE: 'Kenya',
  BD: 'Bangladesh',
};

function scoreColor(s: number): string {
  if (s >= 75) return '#dc2626';
  if (s >= 50) return '#f97316';
  if (s >= 25) return '#eab308';
  return '#22c55e';
}

function scoreLabel(s: number): string {
  if (s >= 75) return 'CRITICAL';
  if (s >= 50) return 'HIGH';
  if (s >= 25) return 'ELEVATED';
  return 'STABLE';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.removeHeader('Content-Security-Policy');

  const code = String(req.query.code || '').toUpperCase();
  const size = String(req.query.size || 'md') as 'sm' | 'md' | 'lg';
  if (!code) return res.status(400).send('code required');

  const dbUrl = process.env.DATABASE_URL;
  let score = 0;
  let confidence = 'unknown';
  let asOf: string | null = null;

  if (dbUrl) {
    try {
      const sql = neon(dbUrl);
      const rows = (await sql`
        SELECT cii_score, confidence, date
        FROM cii_daily_snapshots
        WHERE country_code = ${code}
        ORDER BY date DESC
        LIMIT 1
      `.catch(() => [])) as unknown as Array<{ cii_score: number; confidence: string; date: string }>;
      if (rows.length > 0) {
        score = rows[0].cii_score;
        confidence = rows[0].confidence;
        asOf = rows[0].date;
      }
    } catch {
      // Fall through to empty widget
    }
  }

  const name = NAMES[code] || code;
  const color = scoreColor(score);
  const label = scoreLabel(score);
  const hasData = score > 0 || asOf !== null;

  const dims = {
    sm: { w: 180, h: 80, scoreSize: 32, labelSize: 9, nameSize: 11 },
    md: { w: 280, h: 120, scoreSize: 48, labelSize: 10, nameSize: 13 },
    lg: { w: 400, h: 240, scoreSize: 72, labelSize: 12, nameSize: 16 },
  }[size] || { w: 280, h: 120, scoreSize: 48, labelSize: 10, nameSize: 13 };

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${name} CII · NexusWatch</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  body {
    background: #0a0a0a;
    color: #e0e0e0;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border: 1px solid #222;
    border-radius: 6px;
    overflow: hidden;
  }
  .name {
    font-size: ${dims.nameSize}px;
    font-weight: 600;
    color: #ccc;
    letter-spacing: 0.5px;
  }
  .code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #666;
    letter-spacing: 1px;
  }
  .score-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .score {
    font-size: ${dims.scoreSize}px;
    font-weight: 700;
    line-height: 1;
    color: ${color};
    font-variant-numeric: tabular-nums;
  }
  .label {
    font-size: ${dims.labelSize}px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: ${color};
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9px;
    color: #666;
    letter-spacing: 0.5px;
  }
  .footer a {
    color: #ff6600;
    text-decoration: none;
    font-weight: 600;
    letter-spacing: 1px;
  }
  .footer a:hover { text-decoration: underline; }
  .conf {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 2px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1px;
  }
  .conf-high { background: rgba(34,197,94,0.15); color: #22c55e; }
  .conf-medium { background: rgba(234,179,8,0.15); color: #eab308; }
  .conf-low { background: rgba(220,38,38,0.15); color: #dc2626; }
  .conf-unknown { background: #1a1a1a; color: #666; }
  .no-data { color: #666; font-style: italic; }
</style>
</head>
<body>
  <div>
    <div class="name">${name} <span class="code">${code}</span></div>
  </div>
  ${
    hasData
      ? `<div class="score-row">
        <div class="score">${score}</div>
        <div class="label">${label}</div>
      </div>`
      : `<div class="no-data">No CII data yet</div>`
  }
  <div class="footer">
    <span>
      <span class="conf conf-${confidence}">${confidence.toUpperCase()}</span>
      ${asOf ? ` · ${asOf}` : ''}
    </span>
    <a href="https://nexuswatch.dev/#/audit/${code}" target="_blank" rel="noopener">NexusWatch →</a>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.send(html);
}
